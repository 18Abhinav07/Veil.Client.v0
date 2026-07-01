import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import nextEnv from "@next/env";
import pg from "pg";

import { parseDotEnv } from "./apply-migration.mjs";
import { submitSignedXdr, waitForTransaction } from "./lib.mjs";
import { main as runMarketLiveSmoke } from "./market-live-smoke.mjs";
import { generateMarketEscrowKeys } from "./setup-market-env.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const backendEnvPath = join(root, "..", "backend", ".env");
const stellarAddressPath = join(root, "stellar-address");
const { loadEnvConfig } = nextEnv;

function readString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function loadBackendEnvFallback(env = process.env) {
  loadEnvConfig(root);
  if (!existsSync(backendEnvPath)) return;
  const backendEnv = parseDotEnv(readFileSync(backendEnvPath, "utf8"));
  for (const [key, value] of Object.entries(backendEnv)) {
    if (!env[key] && value) env[key] = value;
  }
}

function getDirectDatabaseUrl(env = process.env) {
  const value = readString(env.DIRECT_DATABASE_URL);
  if (!value) throw new Error("DIRECT_DATABASE_URL is required for market E2E smoke sessions");
  return value;
}

function randomSessionToken() {
  return randomBytes(32).toString("hex");
}

function sessionCookie(token) {
  const encoded = encodeURIComponent(token);
  return `next-auth.session-token=${encoded}; __Secure-next-auth.session-token=${encoded}`;
}

async function createSmokeSession(client, { email, name }) {
  const userResult = await client.query(
    `insert into users (email, name, "emailVerified")
     values ($1, $2, now())
     on conflict (email) do update set email = excluded.email
     returning id`,
    [email, name],
  );
  const userId = userResult.rows[0]?.id;
  if (!userId) throw new Error(`Could not create smoke user for ${email}`);

  const token = randomSessionToken();
  await client.query(
    `insert into sessions ("userId", expires, "sessionToken")
     values ($1, now() + interval '4 hours', $2)`,
    [userId, token],
  );
  return { userId, email, cookie: sessionCookie(token) };
}

async function createSmokeWalletProfile(client, { userId, email }) {
  await client.query(
    `insert into wallet_profiles (user_id, email)
     values ($1, $2)
     on conflict (user_id) do update set
       email = excluded.email,
       updated_at = now()`,
    [userId, email],
  );
}

function readDepositorAccount() {
  const data = JSON.parse(readFileSync(stellarAddressPath, "utf8"));
  const depositor = (data.accounts ?? []).find((account) => account.role === "depositor");
  if (!depositor?.publicKey || !depositor?.secret) {
    throw new Error("stellar-address must contain a depositor publicKey and secret");
  }
  return depositor;
}

async function buildSmokeWallet(env = process.env) {
  const depositor = readDepositorAccount();
  const keys = await generateMarketEscrowKeys(env.PROVER_API_URL);
  return {
    stellarPublicKey: depositor.publicKey,
    stellarSecretKey: depositor.secret,
    bn254NotePrivateKeyHex: keys.MARKET_ESCROW_BN254_PRIVATE_HEX,
    bn254NotePublicKeyHex: keys.MARKET_ESCROW_BN254_PUBLIC_HEX,
    membershipBlindingHex: keys.MARKET_ESCROW_MEMBERSHIP_BLINDING_HEX,
    x25519PublicHex: keys.MARKET_ESCROW_X25519_PUBLIC_HEX,
  };
}

function signPayloadBase64(wallet, payloadBase64) {
  const keypair = Keypair.fromSecret(wallet.stellarSecretKey);
  if (keypair.publicKey() !== wallet.stellarPublicKey) {
    throw new Error("Smoke wallet stellarSecretKey does not match stellarPublicKey");
  }
  return Buffer.from(keypair.sign(Buffer.from(payloadBase64, "base64"))).toString("base64");
}

async function requestJson(baseUrl, path, { cookie, method = "POST", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${text}`);
  }
  return data;
}

async function ensureSmokeDemoMarket(env = process.env) {
  const slug =
    readString(env.MARKET_SMOKE_MARKET_SLUG) ||
    readString(env.MARKET_SMOKE_CONFIRM_RESOLVE) ||
    "demo-settlement-yes";
  if (slug !== "demo-settlement-yes") return;
  const baseUrl = (readString(env.FRONTEND_URL) || readString(env.NEXT_PUBLIC_APP_URL) || "http://localhost:3002").replace(/\/$/, "");
  await requestJson(baseUrl, "/api/admin/markets", {
    cookie: env.MARKET_SMOKE_ADMIN_COOKIE,
    body: {
      action: "seed",
      includeDemo: true,
      smokeOnly: true,
    },
  });
}

async function requestProverJson(env, path, body) {
  const proverUrl = readString(env.PROVER_API_URL) || "http://127.0.0.1:3001";
  const response = await fetch(`${proverUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`prover ${path} failed with ${response.status}: ${text}`);
  }
  return data;
}

async function registerSmokeWallet(env) {
  const baseUrl = readString(env.FRONTEND_URL) || readString(env.NEXT_PUBLIC_APP_URL) || "http://localhost:3002";
  const wallet = JSON.parse(env.MARKET_SMOKE_USER_WALLET_JSON);
  const registrationFields = {
    stellarPublicKey: wallet.stellarPublicKey,
    notePublicKeyHex: wallet.bn254NotePublicKeyHex,
    encryptionPublicKeyHex: wallet.x25519PublicHex,
    membershipBlindingHex: wallet.membershipBlindingHex,
  };
  const prepared = await requestJson(baseUrl.replace(/\/$/, ""), "/api/wallet/registration", {
    cookie: env.MARKET_SMOKE_USER_COOKIE,
    body: {
      intent: "prepare",
      ...registrationFields,
    },
  });
  const submitted = await requestJson(baseUrl.replace(/\/$/, ""), "/api/wallet/registration", {
    cookie: env.MARKET_SMOKE_USER_COOKIE,
    body: {
      intent: "submit",
      ...registrationFields,
      unsignedXdr: prepared.unsignedXdr,
      signatureBase64: signPayloadBase64(wallet, prepared.signingPayloadBase64),
      aspMembershipTxHash: prepared.aspMembershipTxHash,
      membershipLeafHex: prepared.membershipLeafHex,
    },
  });
  return {
    registeredInPool: submitted.profile?.registeredInPool === true,
    txHash: submitted.txHash,
  };
}

async function registerMarketEscrowAspMembership(env) {
  const adminSecret = readString(env.ASP_MEMBERSHIP_ADMIN_SECRET);
  const notePublicKeyHex = readString(env.MARKET_ESCROW_BN254_PUBLIC_HEX);
  const membershipBlindingHex = readString(env.MARKET_ESCROW_MEMBERSHIP_BLINDING_HEX);
  if (!adminSecret) throw new Error("ASP_MEMBERSHIP_ADMIN_SECRET is required for escrow ASP registration");
  if (!notePublicKeyHex) throw new Error("MARKET_ESCROW_BN254_PUBLIC_HEX is required for escrow ASP registration");
  if (!membershipBlindingHex) {
    throw new Error("MARKET_ESCROW_MEMBERSHIP_BLINDING_HEX is required for escrow ASP registration");
  }

  const adminKeypair = Keypair.fromSecret(adminSecret);
  const prepared = await requestProverJson(env, "/prove/register-asp-membership", {
    adminStellarAddress: adminKeypair.publicKey(),
    notePublicKeyHex,
    membershipBlindingHex,
  });
  if (prepared.alreadyMember === true) {
    return { alreadyMember: true, txHash: null };
  }

  const unsignedXdr = readString(prepared.unsignedXdr);
  if (!unsignedXdr) throw new Error("Escrow ASP registration did not return unsignedXdr");
  const transaction = TransactionBuilder.fromXDR(
    unsignedXdr,
    readString(env.NETWORK_PASSPHRASE) || Networks.TESTNET,
  );
  transaction.sign(adminKeypair);
  const txHash = await submitSignedXdr(transaction.toXDR());
  await waitForTransaction(txHash);
  return { alreadyMember: false, txHash };
}

export async function bootstrapMarketSmokeEnv(env = process.env) {
  loadBackendEnvFallback(env);
  const client = new pg.Client({ connectionString: getDirectDatabaseUrl(env) });
  await client.connect();
  try {
    const stamp = randomUUID();
    const user = await createSmokeSession(client, {
      email: `market-smoke-${stamp}@example.invalid`,
      name: "Market Smoke User",
    });
    const admin = await createSmokeSession(client, {
      email: readString(env.MARKET_ADMIN_EMAIL) || "abhinavpangaria2003@gmail.com",
      name: "Market Smoke Admin",
    });
    const wallet = await buildSmokeWallet(env);
    await createSmokeWalletProfile(client, user);

    env.MARKET_SMOKE_USER_COOKIE = user.cookie;
    env.MARKET_SMOKE_ADMIN_COOKIE = admin.cookie;
    env.MARKET_SMOKE_USER_ID = user.userId;
    env.MARKET_SMOKE_USER_WALLET_JSON = JSON.stringify(wallet);
    env.MARKET_SMOKE_CONFIRM_RESOLVE =
      readString(env.MARKET_SMOKE_CONFIRM_RESOLVE) ||
      readString(env.MARKET_SMOKE_MARKET_SLUG) ||
      "demo-settlement-yes";
    env.MARKET_SMOKE_DEPOSIT_USDC = readString(env.MARKET_SMOKE_DEPOSIT_USDC) || "2";
    env.MARKET_SMOKE_STAKE_USDC = readString(env.MARKET_SMOKE_STAKE_USDC) || "1";
    env.FRONTEND_URL = readString(env.FRONTEND_URL) || readString(env.NEXT_PUBLIC_APP_URL) || "http://localhost:3002";

    return { userId: user.userId, adminEmail: readString(env.MARKET_ADMIN_EMAIL) || "abhinavpangaria2003@gmail.com" };
  } finally {
    await client.end();
  }
}

async function main() {
  const context = await bootstrapMarketSmokeEnv(process.env);
  console.log(`Market E2E smoke prepared for user ${context.userId} and admin ${context.adminEmail}`);
  const escrowRegistration = await registerMarketEscrowAspMembership(process.env);
  console.log(
    escrowRegistration.alreadyMember
      ? "Market escrow ASP membership already registered"
      : `Market escrow ASP membership registered: ${escrowRegistration.txHash}`,
  );
  const registration = await registerSmokeWallet(process.env);
  if (!registration.registeredInPool) {
    throw new Error("Market E2E smoke wallet registration did not mark the wallet registered");
  }
  console.log(`Market E2E smoke wallet registered in pool: ${registration.txHash}`);
  await ensureSmokeDemoMarket(process.env);
  await runMarketLiveSmoke();
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
