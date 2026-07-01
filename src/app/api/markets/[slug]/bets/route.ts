import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import {
  findNoteLeafIndexInPool,
  waitForTransaction,
} from "@/lib/stellar";
import { createAuthOptions } from "@/lib/server/auth";
import { isTransientProverLag, isTransientRelayLag } from "@/lib/server/bulkWithdraw";
import { getPgPool } from "@/lib/server/db";
import {
  getInternalServiceHeaders,
  requireInternalServiceAccess,
} from "@/lib/server/internalServiceAuth";
import {
  cancelPendingMarketBet,
  confirmMarketBet,
  createMarketBetIntent,
  getMarketBySlug,
  getSubmittedMarketBetRecovery,
  markMarketBetPrepared,
  markMarketBetSubmitted,
  recordMarketActivity,
  type MarketBetRow,
  type PredictionMarketRow,
  type QueryClient,
} from "@/lib/server/markets/marketRepository";
import { serializeMarketBet } from "@/lib/server/markets/marketSerialization";
import { getWalletServerEnv } from "@/lib/server/serverEnv";
import type { MarketOutcome } from "@/lib/server/markets/marketTypes";
import { fetchJsonWithRetry } from "@/lib/server/upstreamRetry";
import type { RelayBody, TransferResponse } from "@/types";

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

function readOutcome(value: unknown): MarketOutcome | null {
  return value === "YES" || value === "NO" ? value : null;
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

function allowInternalDemoMarketAccess(request: Request) {
  const url = new URL(request.url);
  return (
    url.searchParams.get("includeDemo") === "smoke" &&
    requireInternalServiceAccess(request.headers).ok
  );
}

function readRelayBody(value: unknown): RelayBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("relayBody is required");
  }
  return value as RelayBody;
}

function getMarketEscrowRecipient() {
  return {
    recipientNotePublicHex: readHex32(
      readEnv(SERVER_ENV.MARKET_ESCROW_BN254_PUBLIC_HEX),
      "MARKET_ESCROW_BN254_PUBLIC_HEX",
    ),
    recipientX25519PublicHex: readHex32(
      readEnv(SERVER_ENV.MARKET_ESCROW_X25519_PUBLIC_HEX),
      "MARKET_ESCROW_X25519_PUBLIC_HEX",
    ),
  };
}

function marketPoolFromRow(market: PredictionMarketRow): MarketPoolConfig {
  const contractId =
    readEnv(market.contract_id) ??
    readEnv(SERVER_ENV.MARKET_POOL_CONTRACT_ID) ??
    readEnv(SERVER_ENV.NEXT_PUBLIC_MARKET_POOL_CONTRACT_ID);
  if (market.pool_status !== "active" || !contractId) {
    throw new Error("Market pool contract is not active for betting");
  }
  return {
    poolId: market.pool_id,
    contractId,
    deploymentLedger: market.deployment_ledger ?? 1,
  };
}

async function requireMarketPool(db: QueryClient, slug: string, includeDemo: boolean) {
  const publicMarket = await getMarketBySlug(db, { slug, includeDemo: false });
  const market = publicMarket ?? (includeDemo ? await getMarketBySlug(db, { slug, includeDemo: true }) : null);
  if (!market) throw new Error("Market not found");
  return { market, marketPool: marketPoolFromRow(market) };
}

async function proveTransfer(body: unknown): Promise<TransferResponse> {
  return fetchJsonWithRetry<TransferResponse>(
    `${PROVER_API}/prove/transfer`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getInternalServiceHeaders() },
      body: JSON.stringify(body),
    },
    {
      serviceName: "prover-api /prove/transfer",
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

function encodeEscrowEncryptedOutput(input: {
  proof: TransferResponse;
  recipientNotePublicHex: string;
  recipientX25519PublicHex: string;
}) {
  return JSON.stringify({
    version: 1,
    encryptedOutputKind: "spp-x25519-output-note",
    outputIndex: 0,
    commitmentHex: input.proof.recipientNoteCommitmentHex,
    amountUnits: input.proof.recipientAmountUnits,
    recipientNotePublicHex: input.recipientNotePublicHex,
    recipientX25519PublicHex: input.recipientX25519PublicHex,
    encryptedOutput: input.proof.relayBody.extData.encryptedOutput0,
    extAmount: input.proof.relayBody.extData.extAmount,
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

async function cancelPreparedBet(db: QueryClient, input: { userId: string; betId: string }) {
  try {
    await cancelPendingMarketBet(db, input);
  } catch (error) {
    console.warn("Failed to cancel pending market bet", error);
  }
}

function requireRecoveredString(value: string | null | undefined, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} is required and no submitted bet recovery value was found`);
  return text;
}

async function resolveBetRecoveryPayload(db: QueryClient, input: {
  userId: string;
  betId: string;
  payload: Record<string, unknown>;
}) {
  const stored: MarketBetRow | null = await getSubmittedMarketBetRecovery(db, {
    userId: input.userId,
    betId: input.betId,
  });
  return {
    txHash: requireRecoveredString(
      readOptionalString(input.payload.txHash) ?? stored?.tx_hash,
      "txHash",
    ),
    minedLedger: readOptionalLedger(input.payload.minedLedger),
    escrowCommitmentHex: requireRecoveredString(
      readOptionalString(input.payload.escrowCommitmentHex) ?? stored?.escrow_commitment_hex,
      "escrowCommitmentHex",
    ),
    escrowEncryptedNoteCiphertext: requireRecoveredString(
      readOptionalString(input.payload.escrowEncryptedNoteCiphertext) ??
        stored?.escrow_encrypted_note_ciphertext,
      "escrowEncryptedNoteCiphertext",
    ),
    changeCommitmentHex:
      readOptionalString(input.payload.changeCommitmentHex) ?? stored?.change_commitment_hex ?? null,
    changeAmountUnits:
      readOptionalString(input.payload.changeAmountUnits) ?? stored?.change_amount_units ?? null,
    encryptedChangeNoteCiphertext:
      readOptionalString(input.payload.encryptedChangeNoteCiphertext) ??
      stored?.encrypted_change_note_ciphertext ??
      null,
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
    pool: {
      poolId: marketPool.contractId,
      deploymentLedger: marketPool.deploymentLedger,
    },
  });
}

async function confirmIndexedBet(input: {
  db: QueryClient;
  userId: string;
  slug: string;
  marketPool: MarketPoolConfig;
  betId: string;
  txHash: string;
  minedLedger: number | null;
  escrowCommitmentHex: string;
  escrowEncryptedNoteCiphertext: string;
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
          escrow: {
            status: "submitted",
            txHash: input.txHash,
            minedLedger: null,
            escrowLeafIndex: null,
            changeLeafIndex: null,
            indexingStatus: "pending_mine",
            error: String(error),
          },
        },
        { status: 202 },
      );
    }
  }

  let escrowLeafIndex: number;
  let changeLeafIndex: number | null = null;
  try {
    escrowLeafIndex = await findMarketNoteLeafIndex(
      input.marketPool,
      input.escrowCommitmentHex,
      minedLedger,
    );
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
        escrow: {
          status: "submitted",
          txHash: input.txHash,
          minedLedger,
          escrowLeafIndex: null,
          changeLeafIndex: null,
          indexingStatus: "pending_index",
          error: String(error),
        },
      },
      { status: 202 },
    );
  }

  const bet = await confirmMarketBet(input.db, {
    userId: input.userId,
    betId: input.betId,
    escrowCommitmentHex: input.escrowCommitmentHex,
    escrowEncryptedNoteCiphertext: input.escrowEncryptedNoteCiphertext,
    escrowLeafIndex,
    changeCommitmentHex: input.changeCommitmentHex,
    changeAmountUnits: input.changeAmountUnits,
    changeLeafIndex,
    encryptedChangeNoteCiphertext: input.encryptedChangeNoteCiphertext,
    txHash: input.txHash,
  });
  if (!bet) {
    return NextResponse.json({ error: "Bet confirmation is not available" }, { status: 409 });
  }

  await recordMarketActivity(input.db, {
    userId: input.userId,
    marketId: bet.market_id,
    betId: bet.id,
    eventType: "market_bet_confirmed",
    eventData: {
      outcome: bet.outcome,
      amountUnits: String(bet.amount_units),
      slug: input.slug,
      escrowLeafIndex,
      changeLeafIndex,
    },
    txHash: input.txHash,
  });

  return NextResponse.json({
    bet: serializeMarketBet(bet),
    escrow: {
      status: "confirmed",
      txHash: input.txHash,
      minedLedger,
      escrowLeafIndex,
      changeLeafIndex,
      indexingStatus: "indexed",
    },
  });
}

async function prepareBet(input: {
  userId: string;
  slug: string;
  includeDemo: boolean;
  payload: Record<string, unknown>;
}) {
  const db = getPgPool();
  const { market, marketPool } = await requireMarketPool(db, input.slug, input.includeDemo);
  if (market.status !== "open" || new Date(market.closes_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Market is not open for betting" }, { status: 409 });
  }

  const outcome = readOutcome(input.payload.outcome);
  const amountUnits = readPositiveUnits(input.payload.amountUnits, "amountUnits");
  const idempotencyKey = readString(input.payload.idempotencyKey, "idempotencyKey");
  const noteId = readString(input.payload.noteId, "noteId");
  const inputCommitmentHex = readString(input.payload.inputCommitmentHex, "inputCommitmentHex");
  const notePrivateKeyHex = readHex32(input.payload.notePrivateKeyHex, "notePrivateKeyHex");
  const senderEncryptionPublicHex = readHex32(
    input.payload.senderEncryptionPublicHex,
    "senderEncryptionPublicHex",
  );
  const membershipBlindingHex = readHex32(
    input.payload.membershipBlindingHex,
    "membershipBlindingHex",
  );
  const noteBlindingHex = readHex32(input.payload.noteBlindingHex, "noteBlindingHex");
  const noteAmountUnits = readPositiveUnits(input.payload.noteAmountUnits, "noteAmountUnits");
  const noteLeafIndex = readLeafIndex(input.payload.noteLeafIndex, "noteLeafIndex");
  if (!outcome) {
    return NextResponse.json({ error: "outcome must be YES or NO" }, { status: 400 });
  }
  if (BigInt(noteAmountUnits) < BigInt(amountUnits)) {
    return NextResponse.json({ error: "Market note amount is smaller than bet amount" }, { status: 400 });
  }

  const bet = await createMarketBetIntent(db, {
    userId: input.userId,
    marketSlug: input.slug,
    outcome,
    amountUnits,
    idempotencyKey,
    noteId,
    inputCommitmentHex,
  });
  if (!bet) {
    return NextResponse.json({ error: "Market is not open for betting" }, { status: 409 });
  }
  if (bet.status === "confirmed") {
    return NextResponse.json({
      bet: serializeMarketBet(bet),
      escrow: { status: "confirmed", poolId: bet.pool_id },
    });
  }

  const escrowRecipient = getMarketEscrowRecipient();
  let proof: TransferResponse;
  try {
    proof = await proveTransfer({
      notePrivateKeyHex,
      senderEncryptionPublicHex,
      membershipBlindingHex,
      noteBlindingHex,
      noteAmountUnits,
      noteLeafIndex,
      transferAmountUnits: amountUnits,
      recipientNotePublicHex: escrowRecipient.recipientNotePublicHex,
      recipientX25519PublicHex: escrowRecipient.recipientX25519PublicHex,
      poolId: marketPool.contractId,
    });
  } catch (error) {
    await cancelPreparedBet(db, { userId: input.userId, betId: bet.id });
    throw error;
  }

  await recordMarketActivity(db, {
    userId: input.userId,
    marketId: bet.market_id,
    betId: bet.id,
    eventType: "market_bet_proof_ready",
    eventData: {
      outcome: bet.outcome,
      amountUnits: String(bet.amount_units),
      slug: input.slug,
      escrowCommitmentHex: proof.recipientNoteCommitmentHex,
      changeCommitmentHex: proof.senderChangeCommitmentHex,
    },
  });

  return NextResponse.json({
    bet: serializeMarketBet(bet),
    escrow: {
      status: "proof_ready",
      poolId: marketPool.poolId,
      contractId: marketPool.contractId,
      relayBody: proof.relayBody,
      escrowCommitmentHex: proof.recipientNoteCommitmentHex,
      escrowEncryptedNoteCiphertext: encodeEscrowEncryptedOutput({
        proof,
        ...escrowRecipient,
      }),
      changeNote: {
        blindingHex: proof.senderChangeBlindingHex,
        commitmentHex: proof.senderChangeCommitmentHex,
        amountUnits: proof.senderChangeAmountUnits,
        leafIndex: -1,
        dummyBlindingHex: "",
        dummyCommitmentHex: "",
        createdAt: Date.now(),
      },
    },
  });
}

async function submitBet(input: {
  userId: string;
  slug: string;
  includeDemo: boolean;
  payload: Record<string, unknown>;
}) {
  const db = getPgPool();
  const { marketPool } = await requireMarketPool(db, input.slug, input.includeDemo);
  const betId = readString(input.payload.betId, "betId");
  const relayBody = readRelayBody(input.payload.relayBody);
  const escrowCommitmentHex = readString(input.payload.escrowCommitmentHex, "escrowCommitmentHex");
  const escrowEncryptedNoteCiphertext = readString(
    input.payload.escrowEncryptedNoteCiphertext,
    "escrowEncryptedNoteCiphertext",
  );
  const changeCommitmentHex = readOptionalString(input.payload.changeCommitmentHex);
  const changeAmountUnits = readOptionalString(input.payload.changeAmountUnits);
  const encryptedChangeNoteCiphertext = readOptionalString(
    input.payload.encryptedChangeNoteCiphertext,
  );

  const prepared = await markMarketBetPrepared(db, {
    userId: input.userId,
    betId,
    escrowCommitmentHex,
    escrowEncryptedNoteCiphertext,
    changeCommitmentHex,
    changeAmountUnits,
    encryptedChangeNoteCiphertext,
    relayBody: relayBody as unknown as Record<string, unknown>,
  });
  if (!prepared) {
    return NextResponse.json(
      { error: "Bet submission is not available for retry-safe relay" },
      { status: 409 },
    );
  }

  const relayed = await relayWithRetry(relayBody);
  const submitted = await markMarketBetSubmitted(db, {
    userId: input.userId,
    betId,
    escrowCommitmentHex,
    escrowEncryptedNoteCiphertext,
    changeCommitmentHex,
    changeAmountUnits,
    encryptedChangeNoteCiphertext,
    txHash: relayed.txHash,
  });
  if (!submitted) {
    return NextResponse.json(
      { error: "Bet submission is not available", txHash: relayed.txHash },
      { status: 409 },
    );
  }

  return confirmIndexedBet({
    db,
    userId: input.userId,
    slug: input.slug,
    marketPool,
    betId,
    txHash: relayed.txHash,
    minedLedger: null,
    escrowCommitmentHex,
    escrowEncryptedNoteCiphertext,
    changeCommitmentHex,
    changeAmountUnits,
    encryptedChangeNoteCiphertext,
  });
}

async function finalizeBet(input: {
  userId: string;
  slug: string;
  includeDemo: boolean;
  payload: Record<string, unknown>;
}) {
  const db = getPgPool();
  const { marketPool } = await requireMarketPool(db, input.slug, input.includeDemo);
  const betId = readString(input.payload.betId, "betId");
  const recovery = await resolveBetRecoveryPayload(db, {
    userId: input.userId,
    betId,
    payload: input.payload,
  });
  return confirmIndexedBet({
    db,
    userId: input.userId,
    slug: input.slug,
    marketPool,
    betId,
    ...recovery,
  });
}

async function legacyCreateIntent(input: {
  userId: string;
  slug: string;
  includeDemo: boolean;
  payload: Record<string, unknown>;
}) {
  const outcome = readOutcome(input.payload.outcome);
  const amountUnits = trimString(input.payload.amountUnits);
  const idempotencyKey = trimString(input.payload.idempotencyKey);
  if (!outcome || !amountUnits || !idempotencyKey) {
    return NextResponse.json(
      { error: "outcome, amountUnits, and idempotencyKey are required" },
      { status: 400 },
    );
  }

  let bet;
  try {
    const market = await getMarketBySlug(getPgPool(), {
      slug: input.slug,
      includeDemo: input.includeDemo,
    });
    if (!market) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }
    bet = await createMarketBetIntent(getPgPool(), {
      userId: input.userId,
      marketSlug: input.slug,
      outcome,
      amountUnits,
      idempotencyKey,
      noteId: trimString(input.payload.noteId) || null,
      inputCommitmentHex: trimString(input.payload.inputCommitmentHex) || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  if (!bet) {
    return NextResponse.json({ error: "Market is not open for betting" }, { status: 409 });
  }

  await recordMarketActivity(getPgPool(), {
    userId: input.userId,
    marketId: bet.market_id,
    betId: bet.id,
    eventType: "market_bet_intent_created",
    eventData: { outcome: bet.outcome, amountUnits: String(bet.amount_units), slug: input.slug },
  });

  return NextResponse.json({
    bet: serializeMarketBet(bet),
    escrow: {
      status: "intent_created",
      poolId: bet.pool_id,
    },
  });
}

async function legacyConfirm(input: {
  userId: string;
  slug: string;
  includeDemo: boolean;
  payload: Record<string, unknown>;
}) {
  const market = await getMarketBySlug(getPgPool(), {
    slug: input.slug,
    includeDemo: input.includeDemo,
  });
  if (!market) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }
  const betId = readString(input.payload.betId, "betId");
  const escrowCommitmentHex = readString(input.payload.escrowCommitmentHex, "escrowCommitmentHex");
  const changeCommitmentHex = readOptionalString(input.payload.changeCommitmentHex);
  const txHash = readString(input.payload.txHash, "txHash");
  const bet = await confirmMarketBet(getPgPool(), {
    userId: input.userId,
    betId,
    escrowCommitmentHex,
    changeCommitmentHex,
    txHash,
  });
  if (!bet) {
    return NextResponse.json({ error: "Bet confirmation is not available" }, { status: 409 });
  }
  await recordMarketActivity(getPgPool(), {
    userId: input.userId,
    marketId: bet.market_id,
    betId: bet.id,
    eventType: "market_bet_confirmed",
    eventData: { outcome: bet.outcome, amountUnits: String(bet.amount_units), slug: input.slug },
    txHash,
  });
  return NextResponse.json({ bet: serializeMarketBet(bet) });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { slug } = await context.params;
  try {
    const includeDemo = allowInternalDemoMarketAccess(request);
    const intent = trimString(payload.intent);
    const action = trimString(payload.action);
    if (intent === "prepare") return await prepareBet({ userId: auth.userId, slug, includeDemo, payload });
    if (intent === "submit") return await submitBet({ userId: auth.userId, slug, includeDemo, payload });
    if (intent === "finalize") return await finalizeBet({ userId: auth.userId, slug, includeDemo, payload });
    if (action === "confirm") return await legacyConfirm({ userId: auth.userId, slug, includeDemo, payload });
    return await legacyCreateIntent({ userId: auth.userId, slug, includeDemo, payload });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
