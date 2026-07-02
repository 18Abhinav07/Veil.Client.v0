import {
  Keypair,
  Networks,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { createAuthOptions } from "@/lib/server/auth";
import { isTransientProverLag } from "@/lib/server/bulkWithdraw";
import { getPgPool } from "@/lib/server/db";
import { getInternalServiceHeaders } from "@/lib/server/internalServiceAuth";
import {
  createMarketDepositNote,
  recordMarketActivity,
} from "@/lib/server/markets/marketRepository";
import { emitMarketUserNotification } from "@/lib/server/markets/marketNotifications";
import { serializeMarketUserNote } from "@/lib/server/markets/marketSerialization";
import {
  findNoteLeafIndexInPool,
  submitSignedXdr,
  waitForTransaction,
} from "@/lib/stellar";
import { getWalletServerEnv } from "@/lib/server/serverEnv";
import { fetchJsonWithRetry } from "@/lib/server/upstreamRetry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

const SERVER_ENV = getWalletServerEnv();
const PROVER_API = SERVER_ENV.PROVER_API_URL ?? "http://127.0.0.1:3001";
const NETWORK_PASSPHRASE =
  SERVER_ENV.NETWORK_PASSPHRASE ??
  "Test SDF Network ; September 2015";

type MarketPoolConfig = {
  poolId: string;
  contractId: string;
  deploymentLedger: number;
};

type PrepareBody = {
  intent: "prepare";
  source?: unknown;
  amountUnits?: unknown;
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

type StoreBody = {
  intent: "store";
  commitmentHex?: unknown;
  encryptedNoteCiphertext?: unknown;
  amountUnits?: unknown;
  leafIndex?: unknown;
  txHash?: unknown;
  status?: unknown;
};

type MarketDepositBody = PrepareBody | SubmitBody | FinalizeBody | StoreBody;
type DepositProofResponse = Record<string, unknown>;

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

function trimString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readString(value: unknown, label: string): string {
  const text = trimString(value);
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function readEnv(value: string | undefined | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function readInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? "");
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readPositiveUnits(value: unknown, label: string) {
  const text = readString(value, label);
  if (!/^[1-9][0-9]*$/.test(text)) {
    throw new Error(`${label} must be a positive integer unit value`);
  }
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
  const text = trimString(value);
  return text || null;
}

function readLeafIndex(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^[0-9]+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return null;
}

function readOptionalLedger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function bufferToBase64(value: Buffer | Uint8Array): string {
  return Buffer.from(value).toString("base64");
}

function getMarketPoolConfig(): MarketPoolConfig {
  const contractId =
    readEnv(SERVER_ENV.MARKET_POOL_CONTRACT_ID) ??
    readEnv(SERVER_ENV.NEXT_PUBLIC_MARKET_POOL_CONTRACT_ID);
  if (!contractId) {
    throw new Error("MARKET_POOL_CONTRACT_ID is required before market deposits");
  }

  return {
    poolId: readEnv(SERVER_ENV.MARKET_POOL_ID) ?? "veil_market_pool_v1",
    contractId,
    deploymentLedger: readInteger(SERVER_ENV.MARKET_POOL_DEPLOYMENT_LEDGER, 1),
  };
}

function marketPoolEventOptions(marketPool: MarketPoolConfig) {
  return {
    pool: {
      poolId: marketPool.contractId,
      deploymentLedger: marketPool.deploymentLedger,
    },
  };
}

async function findMarketNoteLeafIndex(
  marketPool: MarketPoolConfig,
  commitmentHex: string,
  minedLedger: number | null,
) {
  const startLedger = minedLedger
    ? Math.max(1, minedLedger - 2)
    : Math.max(1, marketPool.deploymentLedger);
  return findNoteLeafIndexInPool(commitmentHex, startLedger, {
    timeoutMs: 90_000,
    ...marketPoolEventOptions(marketPool),
  });
}

async function prepareDeposit(body: PrepareBody) {
  const marketPool = getMarketPoolConfig();
  const source = readPublicKey(body.source, "source");
  const amountUnits = readPositiveUnits(body.amountUnits, "amountUnits");
  const notePrivateKeyHex = readHex32(body.notePrivateKeyHex, "notePrivateKeyHex");
  const senderEncryptionPublicHex = readHex32(
    body.senderEncryptionPublicHex,
    "senderEncryptionPublicHex",
  );
  const membershipBlindingHex = readHex32(
    body.membershipBlindingHex,
    "membershipBlindingHex",
  );

  const data = await fetchJsonWithRetry<DepositProofResponse>(
    `${PROVER_API}/prove/deposit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getInternalServiceHeaders() },
      body: JSON.stringify({
        notePrivateKeyHex,
        senderEncryptionPublicHex,
        membershipBlindingHex,
        amountUnits,
        stellarAddress: source,
        poolId: marketPool.contractId,
      }),
    },
    {
      serviceName: "prover-api /prove/deposit",
      tries: 12,
      delayMs: 5000,
      isRetryableStatus: isTransientProverLag,
    },
  );

  const unsignedXdr = readString(data.unsignedXdr, "unsignedXdr");
  const transaction = TransactionBuilder.fromXDR(
    unsignedXdr,
    NETWORK_PASSPHRASE || Networks.TESTNET,
  );

  return NextResponse.json({
    ...data,
    marketPool: {
      poolId: marketPool.poolId,
      contractId: marketPool.contractId,
      deploymentLedger: marketPool.deploymentLedger,
    },
    signingPayloadBase64: bufferToBase64(transaction.hash()),
    networkPassphrase: NETWORK_PASSPHRASE,
  });
}

async function submitDeposit(body: SubmitBody) {
  const marketPool = getMarketPoolConfig();
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
    const leafIndex = await findMarketNoteLeafIndex(marketPool, noteCommitmentHex, minedLedger);
    return NextResponse.json({
      txHash,
      minedLedger,
      leafIndex,
      indexingStatus: "indexed",
      marketPool: { poolId: marketPool.poolId },
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
  const marketPool = getMarketPoolConfig();
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
    const leafIndex = await findMarketNoteLeafIndex(marketPool, noteCommitmentHex, minedLedger);
    return NextResponse.json({
      txHash,
      minedLedger,
      leafIndex,
      indexingStatus: "indexed",
      marketPool: { poolId: marketPool.poolId },
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

async function storeDeposit(body: StoreBody, userId: string) {
  const marketPool = getMarketPoolConfig();
  const commitmentHex = readString(body.commitmentHex, "commitmentHex");
  const encryptedNoteCiphertext = readString(body.encryptedNoteCiphertext, "encryptedNoteCiphertext");
  const amountUnits = readPositiveUnits(body.amountUnits, "amountUnits");
  const leafIndex = readLeafIndex(body.leafIndex);
  const txHash = readOptionalString(body.txHash);
  const requestedStatus = trimString(body.status);
  const status = requestedStatus === "pending_deposit" ? "pending_deposit" : "unspent";

  if (status === "unspent" && leafIndex === null) {
    return NextResponse.json({ error: "leafIndex must be a non-negative integer" }, { status: 400 });
  }
  if (status === "unspent" && !txHash) {
    return NextResponse.json({ error: "txHash is required for confirmed market deposits" }, { status: 400 });
  }

  const db = getPgPool();
  const note = await createMarketDepositNote(db, {
    userId,
    poolId: marketPool.poolId,
    commitmentHex,
    encryptedNoteCiphertext,
    amountUnits,
    leafIndex,
    txHash,
    status,
  });

  if (!note) {
    return NextResponse.json({ error: "Market setup is not active" }, { status: 409 });
  }

  await recordMarketActivity(db, {
    userId,
    eventType: "market_deposit_recorded",
    eventData: {
      poolId: marketPool.poolId,
      contractId: marketPool.contractId,
      commitmentHex,
      amountUnits,
      leafIndex,
      status,
    },
    txHash,
  });

  if (note.status === "unspent") {
    await emitMarketUserNotification(db, {
      userId,
      eventType: "market_deposit_confirmed",
      noteId: note.id,
      entityKind: "market_note",
      entityId: note.id,
      amountUnits: String(note.amount_units),
      title: "Market note deposited",
      actionUrl: "/market?view=portfolio&tab=notes",
      txHash,
      eventData: {
        poolId: marketPool.poolId,
        contractId: marketPool.contractId,
        commitmentHex,
        leafIndex,
      },
    });
  }

  return NextResponse.json({ note: serializeMarketUserNote(note) });
}

export async function POST(request: Request) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  try {
    const body = (await request.json()) as MarketDepositBody;
    if (body.intent === "prepare") return await prepareDeposit(body);
    if (body.intent === "submit") return await submitDeposit(body);
    if (body.intent === "finalize") return await finalizeDeposit(body);
    if (body.intent === "store") return await storeDeposit(body, auth.userId);
    return NextResponse.json(
      { error: "intent must be prepare, submit, finalize, or store" },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/prover-api \/prove\/deposit failed:\s*422/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "Market deposit transaction was rejected during simulation. Check the prover artifact configuration and pool state, then try again.",
          detail: message,
        },
        { status: 422 },
      );
    }
    if (/fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|AggregateError/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "Market prover is unavailable. Start the prover API on port 3001 or set PROVER_API_URL, then try again.",
          detail: message,
        },
        { status: 503 },
      );
    }
    if (/sendTransaction|soroban|rpc/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "Stellar RPC is unavailable while submitting the market deposit. Try again after the RPC node catches up.",
          detail: message,
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
