import {
  Keypair,
  Networks,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { createAuthOptions } from "@/lib/server/auth";
import {
  findNoteLeafIndexFromLedger,
  findNoteLeafIndex,
  submitSignedXdr,
  waitForTransaction,
} from "@/lib/stellar";
import { getInternalServiceHeaders } from "@/lib/server/internalServiceAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

const PROVER_API = process.env.PROVER_API_URL ?? "http://localhost:3001";
const NETWORK_PASSPHRASE =
  process.env.NETWORK_PASSPHRASE ??
  "Test SDF Network ; September 2015";

type PrepareBody = {
  intent: "prepare";
  source?: unknown;
  amountUnits?: unknown;
  poolId?: unknown;
  notePrivateKeyHex?: unknown;
  senderEncryptionPublicHex?: unknown;
  membershipBlindingHex?: unknown;
};

type SubmitBody = {
  intent: "submit";
  source?: unknown;
  unsignedXdr?: unknown;
  signatureBase64?: unknown;
  noteCommitmentHex?: unknown;
};

type FinalizeBody = {
  intent: "finalize";
  noteCommitmentHex?: unknown;
  txHash?: unknown;
  minedLedger?: unknown;
};

function bufferToBase64(value: Buffer | Uint8Array): string {
  return Buffer.from(value).toString("base64");
}

async function requireSession() {
  const session = await getServerSession(createAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
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

function readOptionalString(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function readOptionalLedger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

async function prepareDeposit(body: PrepareBody) {
  const source = readPublicKey(body.source, "source");
  const amountUnits = readString(body.amountUnits, "amountUnits");
  const poolId = readString(body.poolId, "poolId");
  const notePrivateKeyHex = readHex32(body.notePrivateKeyHex, "notePrivateKeyHex");
  const senderEncryptionPublicHex = readHex32(
    body.senderEncryptionPublicHex,
    "senderEncryptionPublicHex",
  );
  const membershipBlindingHex = readHex32(
    body.membershipBlindingHex,
    "membershipBlindingHex",
  );

  const upstream = await fetch(`${PROVER_API}/prove/deposit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getInternalServiceHeaders() },
    body: JSON.stringify({
      notePrivateKeyHex,
      senderEncryptionPublicHex,
      membershipBlindingHex,
      amountUnits,
      stellarAddress: source,
      poolId,
    }),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return NextResponse.json(data, { status: upstream.status });
  }

  const unsignedXdr = readString(data.unsignedXdr, "unsignedXdr");
  const transaction = TransactionBuilder.fromXDR(
    unsignedXdr,
    NETWORK_PASSPHRASE || Networks.TESTNET,
  );

  return NextResponse.json({
    ...data,
    signingPayloadBase64: bufferToBase64(transaction.hash()),
    networkPassphrase: NETWORK_PASSPHRASE,
  });
}

async function submitDeposit(body: SubmitBody) {
  const source = readPublicKey(body.source, "source");
  const unsignedXdr = readString(body.unsignedXdr, "unsignedXdr");
  const signatureBase64 = readString(body.signatureBase64, "signatureBase64");
  const noteCommitmentHex = readString(body.noteCommitmentHex, "noteCommitmentHex");
  const sourceKeypair = Keypair.fromPublicKey(source);
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
  let minedLedger: number;
  try {
    minedLedger = await waitForTransaction(txHash);
  } catch (error) {
    return NextResponse.json(
      {
        txHash,
        minedLedger: null,
        leafIndex: null,
        indexingStatus: "pending_mine",
        error: String(error),
      },
      { status: 202 },
    );
  }

  try {
    const leafIndex = await findNoteLeafIndex(noteCommitmentHex, minedLedger);
    return NextResponse.json({
      txHash,
      minedLedger,
      leafIndex,
      indexingStatus: "indexed",
    });
  } catch (error) {
    return NextResponse.json(
      {
        txHash,
        minedLedger,
        leafIndex: null,
        indexingStatus: "pending_index",
        error: String(error),
      },
      { status: 202 },
    );
  }
}

async function finalizeDeposit(body: FinalizeBody) {
  const noteCommitmentHex = readString(body.noteCommitmentHex, "noteCommitmentHex");
  const txHash = readOptionalString(body.txHash);
  let minedLedger = readOptionalLedger(body.minedLedger);

  if (!minedLedger && txHash) {
    try {
      minedLedger = await waitForTransaction(txHash);
    } catch (error) {
      return NextResponse.json(
        {
          txHash,
          minedLedger: null,
          leafIndex: null,
          indexingStatus: "pending_mine",
          error: String(error),
        },
        { status: 202 },
      );
    }
  }

  try {
    const leafIndex = minedLedger
      ? await findNoteLeafIndex(noteCommitmentHex, minedLedger)
      : await findNoteLeafIndexFromLedger(noteCommitmentHex);
    return NextResponse.json({
      txHash,
      minedLedger,
      leafIndex,
      indexingStatus: "indexed",
    });
  } catch (error) {
    return NextResponse.json(
      {
        txHash,
        minedLedger,
        leafIndex: null,
        indexingStatus: "pending_index",
        error: String(error),
      },
      { status: 202 },
    );
  }
}

export async function POST(request: Request) {
  const authError = await requireSession();
  if (authError) return authError;

  try {
    const body = (await request.json()) as PrepareBody | SubmitBody | FinalizeBody;
    if (body.intent === "prepare") return await prepareDeposit(body);
    if (body.intent === "submit") return await submitDeposit(body);
    if (body.intent === "finalize") return await finalizeDeposit(body);
    return NextResponse.json({ error: "intent must be prepare, submit, or finalize" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
