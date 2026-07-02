import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import {
  findNoteLeafIndexInPool,
  waitForTransaction,
} from "@/lib/stellar";
import { createAuthOptions } from "@/lib/server/auth";
import { isTransientProverLag, isTransientRelayLag } from "@/lib/server/bulkWithdraw";
import { getPgPool } from "@/lib/server/db";
import { getInternalServiceHeaders } from "@/lib/server/internalServiceAuth";
import {
  confirmMarketNoteWithdrawal,
  markMarketNotePendingWithdrawal,
  recordMarketActivity,
  releaseMarketNotePendingWithdrawal,
  type QueryClient,
} from "@/lib/server/markets/marketRepository";
import { emitMarketUserNotification } from "@/lib/server/markets/marketNotifications";
import { serializeMarketUserNote } from "@/lib/server/markets/marketSerialization";
import { getWalletProfileByUserId } from "@/lib/server/walletRepository";
import { getWalletServerEnv } from "@/lib/server/serverEnv";
import { fetchJsonWithRetry } from "@/lib/server/upstreamRetry";
import type { RelayBody, WithdrawResponse } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 240;

const SERVER_ENV = getWalletServerEnv();
const PROVER_API = SERVER_ENV.PROVER_API_URL ?? "http://127.0.0.1:3001";
const RELAYER_URL =
  SERVER_ENV.RELAYER_URL ??
  SERVER_ENV.NEXT_PUBLIC_RELAYER_URL ??
  "http://127.0.0.1:3000";

type MarketPoolConfig = {
  poolId: string;
  contractId: string;
  deploymentLedger: number;
};

type PrepareBody = { intent: "prepare" };
type SubmitBody = { intent: "submit" };
type FinalizeBody = { intent: "finalize" };
type MarketWithdrawalBody = PrepareBody | SubmitBody | FinalizeBody;

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

function readOptionalString(value: unknown): string | null {
  const text = trimString(value);
  return text || null;
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

function readHex32(value: unknown, label: string): string {
  const text = readString(value, label).replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(text)) {
    throw new Error(`${label} must be 32-byte hex`);
  }
  return text.toLowerCase();
}

function readOptionalHex32(value: unknown, label: string): string | undefined {
  const text = trimString(value);
  if (!text) return undefined;
  const hex = text.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`${label} must be 32-byte hex`);
  }
  return hex.toLowerCase();
}

function readLeafIndex(value: unknown, label: string) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^[0-9]+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  throw new Error(`${label} must be a non-negative integer`);
}

function readOptionalLedger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function readRelayBody(value: unknown): RelayBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("relayBody is required");
  }
  return value as RelayBody;
}

function getMarketPoolConfig(): MarketPoolConfig {
  const contractId =
    readEnv(SERVER_ENV.MARKET_POOL_CONTRACT_ID) ??
    readEnv(SERVER_ENV.NEXT_PUBLIC_MARKET_POOL_CONTRACT_ID);
  if (!contractId) {
    throw new Error("MARKET_POOL_CONTRACT_ID is required before market withdrawals");
  }

  return {
    poolId: readEnv(SERVER_ENV.MARKET_POOL_ID) ?? "veil_market_pool_v1",
    contractId,
    deploymentLedger: readInteger(SERVER_ENV.MARKET_POOL_DEPLOYMENT_LEDGER, 1),
  };
}

async function requireOwnPublicWallet(db: QueryClient, userId: string) {
  const profile = await getWalletProfileByUserId(db, { userId });
  const stellarPublicKey = profile?.stellar_public_key;
  if (!profile || !stellarPublicKey) {
    throw new Error("Public wallet profile is required before withdrawing Market Notes");
  }
  return { ...profile, stellar_public_key: stellarPublicKey };
}

async function proveWithdraw(body: unknown): Promise<WithdrawResponse> {
  return fetchJsonWithRetry<WithdrawResponse>(
    `${PROVER_API}/prove/withdraw`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getInternalServiceHeaders() },
      body: JSON.stringify(body),
    },
    {
      serviceName: "prover-api /prove/withdraw",
      tries: 12,
      delayMs: 5000,
      isRetryableStatus: isTransientProverLag,
    },
  );
}

async function relayWithRetry(relayBody: RelayBody): Promise<{ txHash: string }> {
  return fetchJsonWithRetry<{ txHash: string }>(
    `${RELAYER_URL}/relay`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getInternalServiceHeaders() },
      body: JSON.stringify(relayBody),
    },
    {
      serviceName: "relayer /relay",
      tries: 18,
      delayMs: 5000,
      isRetryableStatus: isTransientRelayLag,
    },
  );
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
    pool: {
      poolId: marketPool.contractId,
      deploymentLedger: marketPool.deploymentLedger,
    },
  });
}

function hasPositiveChange(input: {
  changeAmountUnits?: string | null;
  changeCommitmentHex?: string | null;
}) {
  return Boolean(
    input.changeCommitmentHex &&
      input.changeAmountUnits &&
      BigInt(input.changeAmountUnits) > BigInt(0),
  );
}

function validateRelayBody(input: {
  relayBody: RelayBody;
  marketPool: MarketPoolConfig;
  recipientStellarAddress: string;
}) {
  if (input.relayBody.poolId !== input.marketPool.contractId) {
    throw new Error("Relay body does not target the active market pool");
  }
  if (input.relayBody.extData?.recipient !== input.recipientStellarAddress) {
    throw new Error("Market withdrawals can only return USDC to your public wallet");
  }
}

async function confirmIndexedWithdrawal(input: {
  db: QueryClient;
  userId: string;
  marketPool: MarketPoolConfig;
  noteId: string;
  inputCommitmentHex: string;
  withdrawAmountUnits: string;
  txHash: string;
  minedLedger: number | null;
  changeCommitmentHex: string | null;
  changeAmountUnits: string | null;
  encryptedChangeNoteCiphertext: string | null;
}) {
  let minedLedger = input.minedLedger;
  if (!minedLedger) {
    try {
      minedLedger = await waitForTransaction(input.txHash);
    } catch (error) {
      return NextResponse.json(
        {
          withdrawal: {
            status: "submitted",
            txHash: input.txHash,
            minedLedger: null,
            changeLeafIndex: null,
            indexingStatus: "pending_mine",
            error: String(error),
          },
        },
        { status: 202 },
      );
    }
  }

  let changeLeafIndex: number | null = null;
  try {
    if (
      hasPositiveChange({
        changeAmountUnits: input.changeAmountUnits,
        changeCommitmentHex: input.changeCommitmentHex,
      }) &&
      input.changeCommitmentHex
    ) {
      changeLeafIndex = await findMarketNoteLeafIndex(
        input.marketPool,
        input.changeCommitmentHex,
        minedLedger,
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        withdrawal: {
          status: "submitted",
          txHash: input.txHash,
          minedLedger,
          changeLeafIndex: null,
          indexingStatus: "pending_index",
          error: String(error),
        },
      },
      { status: 202 },
    );
  }

  const finalized = await confirmMarketNoteWithdrawal(input.db, {
    userId: input.userId,
    noteId: input.noteId,
    poolId: input.marketPool.poolId,
    inputCommitmentHex: input.inputCommitmentHex,
    withdrawAmountUnits: input.withdrawAmountUnits,
    txHash: input.txHash,
    changeCommitmentHex: input.changeCommitmentHex,
    changeAmountUnits: input.changeAmountUnits,
    changeLeafIndex,
    encryptedChangeNoteCiphertext: input.encryptedChangeNoteCiphertext,
  });

  if (!finalized.source_note) {
    return NextResponse.json({ error: "Market note withdrawal is not available" }, { status: 409 });
  }

  await recordMarketActivity(input.db, {
    userId: input.userId,
    eventType: "market_withdraw_confirmed",
    eventData: {
      poolId: input.marketPool.poolId,
      contractId: input.marketPool.contractId,
      noteId: input.noteId,
      inputCommitmentHex: input.inputCommitmentHex,
      withdrawAmountUnits: input.withdrawAmountUnits,
      changeCommitmentHex: input.changeCommitmentHex,
      changeLeafIndex,
    },
    txHash: input.txHash,
  });
  await emitMarketUserNotification(input.db, {
    userId: input.userId,
    eventType: "market_withdraw_confirmed",
    noteId: input.noteId,
    entityKind: "market_note",
    entityId: input.noteId,
    amountUnits: input.withdrawAmountUnits,
    title: "Market note withdrawn",
    body: "USDC was returned to your public wallet.",
    actionUrl: "/market?view=portfolio&tab=notes",
    txHash: input.txHash,
    eventData: {
      poolId: input.marketPool.poolId,
      contractId: input.marketPool.contractId,
      changeLeafIndex,
    },
  });

  return NextResponse.json({
    withdrawal: {
      status: "confirmed",
      txHash: input.txHash,
      minedLedger,
      changeLeafIndex,
      indexingStatus: "indexed",
    },
    sourceNote: serializeMarketUserNote(finalized.source_note),
    changeNote: finalized.change_note ? serializeMarketUserNote(finalized.change_note) : null,
  });
}

async function prepareWithdrawal(userId: string, payload: Record<string, unknown>) {
  const db = getPgPool();
  const marketPool = getMarketPoolConfig();
  const profile = await requireOwnPublicWallet(db, userId);
  const noteId = readString(payload.noteId, "noteId");
  const inputCommitmentHex = readString(payload.inputCommitmentHex, "inputCommitmentHex");
  const notePrivateKeyHex = readHex32(payload.notePrivateKeyHex, "notePrivateKeyHex");
  const senderEncryptionPublicHex = readHex32(payload.senderEncryptionPublicHex, "senderEncryptionPublicHex");
  const membershipBlindingHex = readHex32(payload.membershipBlindingHex, "membershipBlindingHex");
  const noteBlindingHex = readHex32(payload.noteBlindingHex, "noteBlindingHex");
  const noteAmountUnits = readPositiveUnits(payload.noteAmountUnits, "noteAmountUnits");
  const noteLeafIndex = readLeafIndex(payload.noteLeafIndex, "noteLeafIndex");
  const dummyBlindingHex = readOptionalHex32(payload.dummyBlindingHex, "dummyBlindingHex");
  const withdrawAmountUnits = readPositiveUnits(payload.withdrawAmountUnits, "withdrawAmountUnits");

  if (BigInt(withdrawAmountUnits) > BigInt(noteAmountUnits)) {
    return NextResponse.json(
      { error: "Withdraw amount exceeds selected Market Note balance" },
      { status: 400 },
    );
  }

  const proof = await proveWithdraw({
    notePrivateKeyHex,
    senderEncryptionPublicHex,
    membershipBlindingHex,
    noteBlindingHex,
    noteAmountUnits,
    noteLeafIndex,
    dummyBlindingHex,
    withdrawAmountUnits,
    recipientStellarAddress: profile.stellar_public_key,
    poolId: marketPool.contractId,
  });

  return NextResponse.json({
    withdrawal: {
      status: "proof_ready",
      noteId,
      inputCommitmentHex,
      withdrawAmountUnits,
      recipientStellarAddress: profile.stellar_public_key,
      poolId: marketPool.poolId,
      contractId: marketPool.contractId,
      relayBody: proof.relayBody,
      changeNote: {
        blindingHex: proof.changeNoteBlindingHex,
        commitmentHex: proof.changeNoteCommitmentHex,
        amountUnits: proof.changeAmountUnits,
        leafIndex: -1,
        dummyBlindingHex: proof.nextDummyBlindingHex,
        dummyCommitmentHex: proof.nextDummyCommitmentHex,
        createdAt: Date.now(),
      },
    },
  });
}

async function submitWithdrawal(userId: string, payload: Record<string, unknown>) {
  const db = getPgPool();
  const marketPool = getMarketPoolConfig();
  const profile = await requireOwnPublicWallet(db, userId);
  const noteId = readString(payload.noteId, "noteId");
  const inputCommitmentHex = readString(payload.inputCommitmentHex, "inputCommitmentHex");
  const withdrawAmountUnits = readPositiveUnits(payload.withdrawAmountUnits, "withdrawAmountUnits");
  const relayBody = readRelayBody(payload.relayBody);
  const changeCommitmentHex = readOptionalString(payload.changeCommitmentHex);
  const changeAmountUnits = readOptionalString(payload.changeAmountUnits);
  const encryptedChangeNoteCiphertext = readOptionalString(payload.encryptedChangeNoteCiphertext);

  validateRelayBody({
    relayBody,
    marketPool,
    recipientStellarAddress: profile.stellar_public_key,
  });

  const locked = await markMarketNotePendingWithdrawal(db, {
    userId,
    noteId,
    poolId: marketPool.poolId,
    commitmentHex: inputCommitmentHex,
    withdrawAmountUnits,
  });
  if (!locked) {
    return NextResponse.json({ error: "Selected Market Note is no longer spendable" }, { status: 409 });
  }

  let txHash: string | null = null;
  try {
    const relayed = await relayWithRetry(relayBody);
    txHash = relayed.txHash;
  } catch (error) {
    await releaseMarketNotePendingWithdrawal(db, {
      userId,
      noteId,
      commitmentHex: inputCommitmentHex,
    });
    throw error;
  }

  return confirmIndexedWithdrawal({
    db,
    userId,
    marketPool,
    noteId,
    inputCommitmentHex,
    withdrawAmountUnits,
    txHash,
    minedLedger: null,
    changeCommitmentHex,
    changeAmountUnits,
    encryptedChangeNoteCiphertext,
  });
}

async function finalizeWithdrawal(userId: string, payload: Record<string, unknown>) {
  const db = getPgPool();
  const marketPool = getMarketPoolConfig();
  const noteId = readString(payload.noteId, "noteId");
  const inputCommitmentHex = readString(payload.inputCommitmentHex, "inputCommitmentHex");
  const withdrawAmountUnits = readPositiveUnits(payload.withdrawAmountUnits, "withdrawAmountUnits");
  const txHash = readString(payload.txHash, "txHash");
  const minedLedger = readOptionalLedger(payload.minedLedger);
  return confirmIndexedWithdrawal({
    db,
    userId,
    marketPool,
    noteId,
    inputCommitmentHex,
    withdrawAmountUnits,
    txHash,
    minedLedger,
    changeCommitmentHex: readOptionalString(payload.changeCommitmentHex),
    changeAmountUnits: readOptionalString(payload.changeAmountUnits),
    encryptedChangeNoteCiphertext: readOptionalString(payload.encryptedChangeNoteCiphertext),
  });
}

export async function POST(request: Request) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  try {
    const payload = (await request.json()) as MarketWithdrawalBody & Record<string, unknown>;
    const intent = trimString(payload.intent);
    if (intent === "prepare") return await prepareWithdrawal(auth.userId, payload);
    if (intent === "submit") return await submitWithdrawal(auth.userId, payload);
    if (intent === "finalize") return await finalizeWithdrawal(auth.userId, payload);
    return NextResponse.json(
      { error: "intent must be prepare, submit, or finalize" },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|AggregateError/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "Market withdrawal service is unavailable. Check the prover and relayer services, then try again.",
          detail: message,
        },
        { status: 503 },
      );
    }
    if (/prover-api \/prove\/withdraw failed:\s*422/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "Market withdrawal proof was rejected during simulation. Refresh Market Notes and try again.",
          detail: message,
        },
        { status: 422 },
      );
    }
    if (/relayer \/relay failed:\s*422/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "Market withdrawal transaction was rejected during relay simulation. Refresh Market Notes and try again.",
          detail: message,
        },
        { status: 422 },
      );
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
