import {
  Keypair,
  Networks,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { submitSignedXdr, waitForTransaction } from "@/lib/stellar";
import { createAuthOptions } from "@/lib/server/auth";
import { getPgPool } from "@/lib/server/db";
import { getInternalServiceHeaders } from "@/lib/server/internalServiceAuth";
import { getWalletServerEnv } from "@/lib/server/serverEnv";
import {
  getWalletProfileByUserId,
  markWalletRegisteredInPool,
} from "@/lib/server/walletRepository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

const PROVER_API = process.env.PROVER_API_URL ?? "http://localhost:3001";
const NETWORK_PASSPHRASE =
  process.env.NETWORK_PASSPHRASE ??
  "Test SDF Network ; September 2015";

class RegistrationServiceConfigError extends Error {}

type PrepareBody = {
  intent: "prepare";
  stellarPublicKey?: unknown;
  notePublicKeyHex?: unknown;
  encryptionPublicKeyHex?: unknown;
  membershipBlindingHex?: unknown;
};

type SubmitBody = {
  intent: "submit";
  stellarPublicKey?: unknown;
  notePublicKeyHex?: unknown;
  encryptionPublicKeyHex?: unknown;
  membershipBlindingHex?: unknown;
  unsignedXdr?: unknown;
  signatureBase64?: unknown;
  aspMembershipTxHash?: unknown;
  membershipLeafHex?: unknown;
};

function bufferToBase64(value: Buffer | Uint8Array): string {
  return Buffer.from(value).toString("base64");
}

async function requireUserId() {
  const session = await getServerSession(createAuthOptions());
  const userId = session?.user?.id;
  if (!userId) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      userId: null,
    };
  }
  return { error: null, userId };
}

function readString(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function readPublicKey(value: unknown, label: string): string {
  const key = readString(value, label);
  try {
    Keypair.fromPublicKey(key);
  } catch {
    throw new Error(`${label} must be a valid Stellar public key`);
  }
  return key;
}

function readHex32(value: unknown, label: string): string {
  const text = readString(value, label).replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(text)) {
    throw new Error(`${label} must be 32-byte hex`);
  }
  return text.toLowerCase();
}

function readRegistrationFields(body: PrepareBody | SubmitBody) {
  return {
    stellarPublicKey: readPublicKey(body.stellarPublicKey, "stellarPublicKey"),
    notePublicKeyHex: readHex32(body.notePublicKeyHex, "notePublicKeyHex"),
    encryptionPublicKeyHex: readHex32(
      body.encryptionPublicKeyHex,
      "encryptionPublicKeyHex",
    ),
    membershipBlindingHex: readHex32(
      body.membershipBlindingHex,
      "membershipBlindingHex",
    ),
  };
}

async function fetchProverJson(path: string, body: Record<string, unknown>) {
  const upstream = await fetch(`${PROVER_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getInternalServiceHeaders() },
    body: JSON.stringify(body),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    throw new Error(data?.error ?? `${path} failed: HTTP ${upstream.status}`);
  }
  return data as Record<string, unknown>;
}

async function assertWalletProfile(userId: string, stellarPublicKey: string) {
  const profile = await getWalletProfileByUserId(getPgPool(), { userId });
  if (!profile) {
    throw new Error("Wallet profile has not been created");
  }
  if (
    profile.stellar_public_key &&
    profile.stellar_public_key !== stellarPublicKey
  ) {
    throw new Error("Registration public key does not match this wallet profile");
  }
  return profile;
}

async function prepareRegistration(userId: string, body: PrepareBody) {
  const fields = readRegistrationFields(body);
  await assertWalletProfile(userId, fields.stellarPublicKey);

  const aspRegistration = await prepareAndSubmitAspMembership(fields);
  const data = await fetchProverJson("/prove/register", {
    stellarAddress: fields.stellarPublicKey,
    notePublicKeyHex: fields.notePublicKeyHex,
    encryptionPublicKeyHex: fields.encryptionPublicKeyHex,
    membershipBlindingHex: fields.membershipBlindingHex,
  });

  const unsignedXdr = readString(data.unsignedXdr, "unsignedXdr");
  const transaction = TransactionBuilder.fromXDR(
    unsignedXdr,
    NETWORK_PASSPHRASE || Networks.TESTNET,
  );

  return NextResponse.json({
    ...data,
    signingPayloadBase64: bufferToBase64(transaction.hash()),
    networkPassphrase: NETWORK_PASSPHRASE,
    aspRegistrationMode: "service-admin",
    aspMembershipTxHash: aspRegistration.txHash,
    aspMembershipMinedLedger: aspRegistration.minedLedger,
    membershipLeafHex: aspRegistration.membershipLeafHex,
    aspMembershipAlreadyMember: aspRegistration.alreadyMember,
  });
}

async function prepareAndSubmitAspMembership(fields: {
  notePublicKeyHex: string;
  membershipBlindingHex: string;
}) {
  const env = getWalletServerEnv();
  const adminSecret = env.ASP_MEMBERSHIP_ADMIN_SECRET;
  if (!adminSecret) {
    throw new RegistrationServiceConfigError(
      "ASP_MEMBERSHIP_ADMIN_SECRET is required to register wallets in the ASP membership tree",
    );
  }
  const adminKeypair = Keypair.fromSecret(adminSecret);
  const data = await fetchProverJson("/prove/register-asp-membership", {
    adminStellarAddress: adminKeypair.publicKey(),
    notePublicKeyHex: fields.notePublicKeyHex,
    membershipBlindingHex: fields.membershipBlindingHex,
  });
  const membershipLeafHex = readString(data.membershipLeafHex, "membershipLeafHex");
  if (data.alreadyMember === true) {
    return {
      alreadyMember: true,
      membershipLeafHex,
      txHash: null as string | null,
      minedLedger: null as number | null,
    };
  }

  const unsignedXdr = readString(data.unsignedXdr, "unsignedXdr");
  const transaction = TransactionBuilder.fromXDR(
    unsignedXdr,
    NETWORK_PASSPHRASE || Networks.TESTNET,
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

async function submitRegistration(userId: string, body: SubmitBody) {
  const fields = readRegistrationFields(body);
  await assertWalletProfile(userId, fields.stellarPublicKey);

  const unsignedXdr = readString(body.unsignedXdr, "unsignedXdr");
  const signatureBase64 = readString(body.signatureBase64, "signatureBase64");
  const membershipLeafHex =
    typeof body.membershipLeafHex === "string" && body.membershipLeafHex.trim()
      ? body.membershipLeafHex.trim()
      : null;
  const sourceKeypair = Keypair.fromPublicKey(fields.stellarPublicKey);
  const transaction = TransactionBuilder.fromXDR(
    unsignedXdr,
    NETWORK_PASSPHRASE || Networks.TESTNET,
  );

  transaction.signatures.push(
    new xdr.DecoratedSignature({
      hint: sourceKeypair.signatureHint(),
      signature: Buffer.from(signatureBase64, "base64"),
    }),
  );

  const txHash = await submitSignedXdr(transaction.toXDR());
  const minedLedger = await waitForTransaction(txHash);
  const profile = await markWalletRegisteredInPool(getPgPool(), {
    userId,
    stellarPublicKey: fields.stellarPublicKey,
    bn254PublicHex: fields.notePublicKeyHex,
    x25519PublicHex: fields.encryptionPublicKeyHex,
    membershipBlindingPublicHex: membershipLeafHex,
    txHash,
  });

  return NextResponse.json({
    txHash,
    minedLedger,
    profile: {
      userId: profile?.user_id ?? userId,
      email: profile?.email ?? null,
      handle: profile?.handle ?? null,
      stellarPublicKey: profile?.stellar_public_key ?? fields.stellarPublicKey,
      registeredInPool: profile?.registered_in_pool ?? true,
      bn254PublicHex: profile?.bn254_public_hex ?? fields.notePublicKeyHex,
      x25519PublicHex: profile?.x25519_public_hex ?? fields.encryptionPublicKeyHex,
      poolRegistrationTxHash: profile?.pool_registration_tx_hash ?? txHash,
      membershipLeafHex: profile?.membership_blinding_public_hex ?? membershipLeafHex,
    },
  });
}

export async function GET() {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  const profile = await getWalletProfileByUserId(getPgPool(), { userId: auth.userId });
  return NextResponse.json({
    profile: profile
      ? {
          userId: profile.user_id,
          email: profile.email,
          handle: profile.handle,
          stellarPublicKey: profile.stellar_public_key,
          registeredInPool: profile.registered_in_pool,
          bn254PublicHex: profile.bn254_public_hex,
          x25519PublicHex: profile.x25519_public_hex,
          poolRegistrationTxHash: profile.pool_registration_tx_hash,
          membershipLeafHex: profile.membership_blinding_public_hex,
        }
      : null,
    registeredInPool: profile?.registered_in_pool ?? false,
  });
}

export async function POST(request: Request) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  try {
    const body = (await request.json()) as PrepareBody | SubmitBody;
    if (body.intent === "prepare") {
      return await prepareRegistration(auth.userId, body);
    }
    if (body.intent === "submit") {
      return await submitRegistration(auth.userId, body);
    }
    return NextResponse.json({ error: "intent must be prepare or submit" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: error instanceof RegistrationServiceConfigError ? 503 : 400 },
    );
  }
}
