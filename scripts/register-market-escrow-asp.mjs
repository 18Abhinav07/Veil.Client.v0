import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import nextEnv from "@next/env";

import { parseDotEnv } from "./apply-migration.mjs";
import { submitSignedXdr, waitForTransaction } from "./lib.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const backendEnvPath = join(root, "..", "backend", ".env");
const { loadEnvConfig } = nextEnv;

function readString(value, label = "value") {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function readOptionalString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readHex32(value, label) {
  const text = readString(value, label).replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(text)) {
    throw new Error(`${label} must be 32-byte hex`);
  }
  return text.toLowerCase();
}

function loadEnvFallback(env = process.env) {
  loadEnvConfig(root);
  if (!existsSync(backendEnvPath)) return;
  const backendEnv = parseDotEnv(readFileSync(backendEnvPath, "utf8"));
  for (const [key, value] of Object.entries(backendEnv)) {
    if (!env[key] && value) env[key] = value;
  }
}

async function requestProverJson(env, path, body) {
  const proverUrl = readOptionalString(env.PROVER_API_URL) || "http://127.0.0.1:3001";
  const token = readOptionalString(env.INTERNAL_SERVICE_AUTH_TOKEN);
  const response = await fetch(`${proverUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`prover ${path} failed with ${response.status}: ${text}`);
  }
  return data;
}

export async function registerMarketEscrowAsp(env = process.env) {
  loadEnvFallback(env);

  const adminKeypair = Keypair.fromSecret(readString(
    env.ASP_MEMBERSHIP_ADMIN_SECRET,
    "ASP_MEMBERSHIP_ADMIN_SECRET",
  ));
  const notePublicKeyHex = readHex32(
    env.MARKET_ESCROW_BN254_PUBLIC_HEX,
    "MARKET_ESCROW_BN254_PUBLIC_HEX",
  );
  const membershipBlindingHex = readHex32(
    env.MARKET_ESCROW_MEMBERSHIP_BLINDING_HEX,
    "MARKET_ESCROW_MEMBERSHIP_BLINDING_HEX",
  );

  const prepared = await requestProverJson(env, "/prove/register-asp-membership", {
    adminStellarAddress: adminKeypair.publicKey(),
    notePublicKeyHex,
    membershipBlindingHex,
  });
  const membershipLeafHex = readString(
    prepared.membershipLeafHex,
    "membershipLeafHex",
  );
  if (prepared.alreadyMember === true) {
    return {
      alreadyMember: true,
      membershipLeafHex,
      txHash: null,
      minedLedger: null,
    };
  }

  const unsignedXdr = readString(prepared.unsignedXdr, "unsignedXdr");
  const transaction = TransactionBuilder.fromXDR(
    unsignedXdr,
    readOptionalString(env.NETWORK_PASSPHRASE) || Networks.TESTNET,
  );
  transaction.sign(adminKeypair);
  const txHash = await submitSignedXdr(transaction.toXDR());
  const minedLedger = await waitForTransaction(txHash);
  return {
    alreadyMember: false,
    membershipLeafHex,
    txHash,
    minedLedger,
  };
}

export async function main(env = process.env) {
  const result = await registerMarketEscrowAsp(env);
  console.log(
    JSON.stringify(
      {
        ok: true,
        alreadyMember: result.alreadyMember,
        membershipLeafHex: result.membershipLeafHex,
        txHash: result.txHash,
        minedLedger: result.minedLedger,
      },
      null,
      2,
    ),
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
