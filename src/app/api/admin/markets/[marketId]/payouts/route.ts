import { NextResponse } from "next/server";

import {
  findNoteLeafIndexInPool,
  findPoolCommitmentEventInPool,
  waitForTransaction,
} from "@/lib/stellar";
import { isTransientProverLag, isTransientRelayLag } from "@/lib/server/bulkWithdraw";
import { getPgPool } from "@/lib/server/db";
import { getInternalServiceHeaders } from "@/lib/server/internalServiceAuth";
import { requireMarketAdmin } from "@/lib/server/markets/marketAuth";
import {
  confirmSubmittedMarketEscrowConsolidationTransfer,
  executeMarketPayoutTransfer,
  getExecutableMarketPayout,
  getMarketEscrowConsolidationPair,
  getSubmittedMarketEscrowConsolidation,
  getSubmittedMarketPayout,
  listMarketPayoutQueue,
  markMarketEscrowConsolidationPrepared,
  markMarketEscrowConsolidationSubmitted,
  markMarketPayoutPrepared,
  markMarketPayoutSubmitted,
  type ExecutableMarketPayoutRow,
  type MarketEscrowConsolidationPairRow,
  type SubmittedMarketEscrowConsolidationRow,
} from "@/lib/server/markets/marketRepository";
import {
  emitMarketPayoutFailedNotification,
  emitMarketPayoutReadyNotification,
} from "@/lib/server/markets/marketNotifications";
import { serializeMarketPayout } from "@/lib/server/markets/marketSerialization";
import { getWalletServerEnv } from "@/lib/server/serverEnv";
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

type EncryptedOutputEnvelope = {
  encryptedOutputKind?: string;
  outputIndex?: number;
  commitmentHex?: string;
  amountUnits?: string;
  encryptedOutput?: unknown;
};

type DecryptedEscrowNote = {
  blindingHex: string;
  commitmentHex: string;
  amountUnits: string;
};

type EscrowDecryptableNote = {
  commitment_hex: string;
  encrypted_note_ciphertext: string;
  leaf_index: number;
};

type MarketPoolLocator = {
  contract_id: string;
  deployment_ledger: number;
};

type MarketEscrowKeys = {
  notePrivateKeyHex: string;
  encryptionPrivateKeyHex: string;
  senderEncryptionPublicHex: string;
  senderNotePublicHex: string;
  membershipBlindingHex: string;
};

function adminError(error: unknown) {
  const status = typeof (error as { status?: unknown })?.status === "number"
    ? (error as { status: number }).status
    : 500;
  return NextResponse.json(
    { error: error instanceof Error ? error.message : String(error) },
    { status },
  );
}

function trimString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readString(value: unknown, label: string) {
  const text = trimString(value);
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function readEnv(name: string) {
  return readString(SERVER_ENV[name], name);
}

function readHex32(value: unknown, label: string) {
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

function readRelayBody(value: unknown, label: string): RelayBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is required`);
  }
  return value as RelayBody;
}

function readPositiveUnits(value: unknown, label: string) {
  const text = readString(value, label);
  if (!/^[1-9][0-9]*$/.test(text)) {
    throw new Error(`${label} must be a positive integer unit value`);
  }
  return text;
}

function readMarketEscrowKeys(): MarketEscrowKeys {
  return {
    notePrivateKeyHex: readHex32(
      readEnv("MARKET_ESCROW_BN254_PRIVATE_HEX"),
      "MARKET_ESCROW_BN254_PRIVATE_HEX",
    ),
    encryptionPrivateKeyHex: readHex32(
      readEnv("MARKET_ESCROW_X25519_PRIVATE_HEX"),
      "MARKET_ESCROW_X25519_PRIVATE_HEX",
    ),
    senderEncryptionPublicHex: readHex32(
      readEnv("MARKET_ESCROW_X25519_PUBLIC_HEX"),
      "MARKET_ESCROW_X25519_PUBLIC_HEX",
    ),
    senderNotePublicHex: readHex32(
      readEnv("MARKET_ESCROW_BN254_PUBLIC_HEX"),
      "MARKET_ESCROW_BN254_PUBLIC_HEX",
    ),
    membershipBlindingHex: readHex32(
      readEnv("MARKET_ESCROW_MEMBERSHIP_BLINDING_HEX"),
      "MARKET_ESCROW_MEMBERSHIP_BLINDING_HEX",
    ),
  };
}

function readEncryptedOutput(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new Error("encryptedOutput must be an array of bytes");
  }
  return value.map((byte) => {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new Error("encryptedOutput must contain bytes");
    }
    return byte;
  });
}

function parseEscrowEnvelope(ciphertext: string, expectedCommitmentHex: string) {
  let envelope: EncryptedOutputEnvelope;
  try {
    envelope = JSON.parse(ciphertext) as EncryptedOutputEnvelope;
  } catch {
    throw new Error("Escrow note ciphertext is not a valid encrypted output envelope");
  }
  if (envelope.encryptedOutputKind !== "spp-x25519-output-note") {
    throw new Error("Escrow note ciphertext is not an output-note envelope");
  }
  if (trimString(envelope.commitmentHex) !== expectedCommitmentHex) {
    throw new Error("Escrow note envelope commitment does not match source note");
  }
  return {
    encryptedOutput: readEncryptedOutput(envelope.encryptedOutput),
  };
}

function encodeEncryptedOutput(input: {
  proof: TransferResponse;
  outputIndex: 0 | 1;
  commitmentHex: string;
  amountUnits: string;
  recipientNotePublicHex: string;
  recipientX25519PublicHex: string;
}) {
  return JSON.stringify({
    version: 1,
    encryptedOutputKind: "spp-x25519-output-note",
    outputIndex: input.outputIndex,
    commitmentHex: input.commitmentHex,
    amountUnits: input.amountUnits,
    recipientNotePublicHex: input.recipientNotePublicHex,
    recipientX25519PublicHex: input.recipientX25519PublicHex,
    encryptedOutput: input.outputIndex === 0
      ? input.proof.relayBody.extData.encryptedOutput0
      : input.proof.relayBody.extData.encryptedOutput1,
    extAmount: input.proof.relayBody.extData.extAmount,
  });
}

async function decryptEscrowNote(input: {
  note: EscrowDecryptableNote;
  notePrivateKeyHex: string;
  encryptionPrivateKeyHex: string;
}): Promise<DecryptedEscrowNote> {
  const envelope = parseEscrowEnvelope(
    input.note.encrypted_note_ciphertext,
    input.note.commitment_hex,
  );
  const decrypted = await fetchJsonWithRetry<Record<string, unknown>>(
    `${PROVER_API}/keys/decrypt-output-note`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getInternalServiceHeaders() },
      body: JSON.stringify({
        notePrivateKeyHex: input.notePrivateKeyHex,
        encryptionPrivateKeyHex: input.encryptionPrivateKeyHex,
        commitmentHex: input.note.commitment_hex,
        leafIndex: input.note.leaf_index,
        encryptedOutput: envelope.encryptedOutput,
      }),
    },
    {
      serviceName: "prover-api /keys/decrypt-output-note",
      tries: 6,
      delayMs: 1000,
      isRetryableStatus: isTransientProverLag,
    },
  );

  return {
    blindingHex: readHex32(decrypted.blindingHex, "decrypted blindingHex"),
    commitmentHex: readString(decrypted.commitmentHex, "decrypted commitmentHex"),
    amountUnits: readPositiveUnits(decrypted.amountUnits, "decrypted amountUnits"),
  };
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

function isCommitmentNotFoundError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /NewCommitment event .* not found/i.test(message);
}

async function findMarketPoolCommitmentEvent(
  pool: MarketPoolLocator,
  commitmentHex: string,
) {
  return findPoolCommitmentEventInPool(commitmentHex, Math.max(1, pool.deployment_ledger), {
    timeoutMs: 45_000,
    pool: {
      poolId: pool.contract_id,
      deploymentLedger: pool.deployment_ledger,
    },
  });
}

async function findMarketPoolLeafIndex(
  pool: MarketPoolLocator,
  commitmentHex: string,
  minedLedger: number,
) {
  return findNoteLeafIndexInPool(commitmentHex, Math.max(1, minedLedger - 2), {
    timeoutMs: 90_000,
    pool: {
      poolId: pool.contract_id,
      deploymentLedger: pool.deployment_ledger,
    },
  });
}

async function recoverPreparedPayoutSubmission(input: {
  db: ReturnType<typeof getPgPool>;
  payout: ExecutableMarketPayoutRow;
  adminEmail: string;
}) {
  const sourceEscrowNoteId = readString(
    input.payout.source_escrow_note_id,
    "prepared payout source escrow note id",
  );
  const payoutCommitmentHex = readString(
    input.payout.payout_commitment_hex,
    "prepared payout commitment",
  );
  const encryptedPayoutNoteCiphertext = readString(
    input.payout.encrypted_note_ciphertext,
    "prepared payout ciphertext",
  );

  let recovered: Awaited<ReturnType<typeof findMarketPoolCommitmentEvent>>;
  try {
    recovered = await findMarketPoolCommitmentEvent(input.payout, payoutCommitmentHex);
  } catch (error) {
    if (isCommitmentNotFoundError(error)) return null;
    throw error;
  }

  const txHash = trimString(recovered.txHash);
  if (!txHash) {
    return NextResponse.json(
      {
        error: "Recovered payout commitment event did not include tx hash",
        payoutId: input.payout.id,
        payoutCommitmentHex,
        leafIndex: recovered.leafIndex,
        ledger: recovered.ledger,
      },
      { status: 409 },
    );
  }

  const submitted = await markMarketPayoutSubmitted(input.db, {
    marketId: input.payout.market_id,
    payoutId: input.payout.id,
    sourceEscrowNoteId,
    payoutCommitmentHex,
    encryptedPayoutNoteCiphertext,
    changeCommitmentHex: trimString(input.payout.change_commitment_hex) || null,
    encryptedChangeNoteCiphertext:
      trimString(input.payout.encrypted_change_note_ciphertext) || null,
    changeAmountUnits: trimString(input.payout.change_amount_units) || null,
    txHash,
  });
  if (!submitted) {
    await emitMarketPayoutFailedNotification(input.db, {
      userId: input.payout.user_id,
      payoutId: input.payout.id,
      marketId: input.payout.market_id,
      amountUnits: String(input.payout.amount_units),
      errorMessage: "Prepared payout was recovered but could not be checkpointed",
      txHash,
    });
    return NextResponse.json(
      {
        error: "Prepared payout was recovered but could not be checkpointed",
        txHash,
        payoutId: input.payout.id,
        payoutCommitmentHex,
      },
      { status: 409 },
    );
  }

  return finalizeSubmittedPayout({
    db: input.db,
    payout: {
      ...input.payout,
      ...submitted,
      tx_hash: txHash,
      source_escrow_note_id: sourceEscrowNoteId,
      payout_commitment_hex: payoutCommitmentHex,
      encrypted_note_ciphertext: encryptedPayoutNoteCiphertext,
    },
    adminEmail: input.adminEmail,
  });
}

async function findMarketNoteLeafIndex(
  payout: ExecutableMarketPayoutRow,
  commitmentHex: string,
  minedLedger: number,
) {
  return findMarketPoolLeafIndex(payout, commitmentHex, minedLedger);
}

async function countRemainingPayouts(
  db: ReturnType<typeof getPgPool>,
  marketId: string,
) {
  return (await listMarketPayoutQueue(db, { marketId })).length;
}

async function finalizeSubmittedPayout(input: {
  db: ReturnType<typeof getPgPool>;
  payout: ExecutableMarketPayoutRow;
  adminEmail: string;
}) {
  const txHash = readString(input.payout.tx_hash, "submitted payout txHash");
  const payoutCommitmentHex = readString(
    input.payout.payout_commitment_hex,
    "submitted payout commitment",
  );
  const encryptedPayoutNoteCiphertext = readString(
    input.payout.encrypted_note_ciphertext,
    "submitted payout ciphertext",
  );
  const sourceEscrowNoteId = readString(
    input.payout.source_escrow_note_id,
    "submitted payout source escrow note id",
  );
  const changeCommitmentHex = trimString(input.payout.change_commitment_hex) || null;
  const encryptedChangeNoteCiphertext =
    trimString(input.payout.encrypted_change_note_ciphertext) || null;
  const changeAmountUnits = trimString(input.payout.change_amount_units) || null;

  let minedLedger: number;
  try {
    minedLedger = await waitForTransaction(txHash);
  } catch (error) {
    return NextResponse.json(
      {
        payout: {
          status: "submitted",
          payoutId: input.payout.id,
          txHash,
          minedLedger: null,
          indexingStatus: "pending_mine",
          error: String(error),
        },
        executedCount: 0,
        consolidatedCount: 0,
        remainingCount: await countRemainingPayouts(input.db, input.payout.market_id),
        completed: false,
      },
      { status: 202 },
    );
  }

  let payoutLeafIndex: number;
  let changeLeafIndex: number | null = null;
  try {
    payoutLeafIndex = await findMarketNoteLeafIndex(
      input.payout,
      payoutCommitmentHex,
      minedLedger,
    );
    if (
      changeCommitmentHex &&
      changeAmountUnits &&
      BigInt(changeAmountUnits) > BigInt(0)
    ) {
      changeLeafIndex = await findMarketNoteLeafIndex(
        input.payout,
        changeCommitmentHex,
        minedLedger,
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        payout: {
          status: "submitted",
          payoutId: input.payout.id,
          txHash,
          minedLedger,
          indexingStatus: "pending_index",
          error: String(error),
        },
        executedCount: 0,
        consolidatedCount: 0,
        remainingCount: await countRemainingPayouts(input.db, input.payout.market_id),
        completed: false,
      },
      { status: 202 },
    );
  }

  const result = await executeMarketPayoutTransfer(input.db, {
    marketId: input.payout.market_id,
    adminEmail: input.adminEmail,
    payoutId: input.payout.id,
    sourceEscrowNoteId,
    payoutCommitmentHex,
    encryptedPayoutNoteCiphertext,
    payoutLeafIndex,
    changeCommitmentHex,
    encryptedChangeNoteCiphertext,
    changeAmountUnits,
    changeLeafIndex,
    txHash,
  });
  if (!result.payout) {
    await emitMarketPayoutFailedNotification(input.db, {
      userId: input.payout.user_id,
      payoutId: input.payout.id,
      marketId: input.payout.market_id,
      amountUnits: String(input.payout.amount_units),
      errorMessage: "Submitted payout could not be finalized",
      txHash,
    });
    return NextResponse.json(
      {
        error: "Submitted payout could not be finalized",
        txHash,
        minedLedger,
        payoutLeafIndex,
      changeLeafIndex,
    },
      { status: 409 },
    );
  }
  await emitMarketPayoutReadyNotification(input.db, {
    userId: result.payout.user_id,
    payoutId: result.payout.id,
    marketId: result.payout.market_id,
    amountUnits: String(result.payout.amount_units),
    payoutCommitmentHex: result.payout.payout_commitment_hex,
    encryptedNoteCiphertext: result.payout.encrypted_note_ciphertext,
    leafIndex: result.payout.leaf_index,
    txHash: result.payout.tx_hash,
  });

  const remainingCount = await countRemainingPayouts(input.db, input.payout.market_id);
  return NextResponse.json({
    payout: serializeMarketPayout(result.payout),
    settlementJob: result.settlementJob,
    txHash,
    minedLedger,
    payoutLeafIndex,
    changeLeafIndex,
    encryptedPayoutNoteCiphertext,
    executedCount: 1,
    consolidatedCount: 0,
    remainingCount,
    completed: remainingCount === 0,
  });
}

async function submitPreparedPayout(input: {
  db: ReturnType<typeof getPgPool>;
  payout: ExecutableMarketPayoutRow;
  adminEmail: string;
}) {
  const relayBody = readRelayBody(input.payout.relay_body, "prepared payout relay body");
  const sourceEscrowNoteId = readString(
    input.payout.source_escrow_note_id,
    "prepared payout source escrow note id",
  );
  const payoutCommitmentHex = readString(
    input.payout.payout_commitment_hex,
    "prepared payout commitment",
  );
  const encryptedPayoutNoteCiphertext = readString(
    input.payout.encrypted_note_ciphertext,
    "prepared payout ciphertext",
  );
  const recovered = await recoverPreparedPayoutSubmission(input);
  if (recovered) return recovered;

  const relayed = await relayWithRetry(relayBody);
  const submitted = await markMarketPayoutSubmitted(input.db, {
    marketId: input.payout.market_id,
    payoutId: input.payout.id,
    sourceEscrowNoteId,
    payoutCommitmentHex,
    encryptedPayoutNoteCiphertext,
    changeCommitmentHex: trimString(input.payout.change_commitment_hex) || null,
    encryptedChangeNoteCiphertext:
      trimString(input.payout.encrypted_change_note_ciphertext) || null,
    changeAmountUnits: trimString(input.payout.change_amount_units) || null,
    txHash: relayed.txHash,
  });
  if (!submitted) {
    return NextResponse.json(
      {
        error: "Prepared payout was relayed but could not be checkpointed",
        txHash: relayed.txHash,
      },
      { status: 409 },
    );
  }

  return finalizeSubmittedPayout({
    db: input.db,
    payout: {
      ...input.payout,
      ...submitted,
      tx_hash: relayed.txHash,
      source_escrow_note_id: sourceEscrowNoteId,
      payout_commitment_hex: payoutCommitmentHex,
      encrypted_note_ciphertext: encryptedPayoutNoteCiphertext,
    },
    adminEmail: input.adminEmail,
  });
}

async function finalizeSubmittedConsolidation(input: {
  db: ReturnType<typeof getPgPool>;
  transfer: SubmittedMarketEscrowConsolidationRow;
  adminEmail: string;
}) {
  const txHash = readString(input.transfer.tx_hash, "submitted consolidation txHash");
  const rollupCommitmentHex = readString(
    input.transfer.output_commitment_hex,
    "submitted consolidation commitment",
  );
  const encryptedRollupNoteCiphertext = readString(
    input.transfer.output_encrypted_note_ciphertext,
    "submitted consolidation ciphertext",
  );
  const rollupAmountUnits = readPositiveUnits(
    input.transfer.output_amount_units,
    "submitted consolidation amount",
  );

  let minedLedger: number;
  try {
    minedLedger = await waitForTransaction(txHash);
  } catch (error) {
    return NextResponse.json(
      {
        consolidation: {
          status: "submitted",
          transferId: input.transfer.id,
          txHash,
          minedLedger: null,
          indexingStatus: "pending_mine",
          error: String(error),
        },
        executedCount: 0,
        consolidatedCount: 0,
        remainingCount: await countRemainingPayouts(input.db, input.transfer.market_id),
        completed: false,
      },
      { status: 202 },
    );
  }

  let rollupLeafIndex: number;
  try {
    rollupLeafIndex = await findMarketPoolLeafIndex(
      input.transfer,
      rollupCommitmentHex,
      minedLedger,
    );
  } catch (error) {
    return NextResponse.json(
      {
        consolidation: {
          status: "submitted",
          transferId: input.transfer.id,
          txHash,
          minedLedger,
          indexingStatus: "pending_index",
          error: String(error),
        },
        executedCount: 0,
        consolidatedCount: 0,
        remainingCount: await countRemainingPayouts(input.db, input.transfer.market_id),
        completed: false,
      },
      { status: 202 },
    );
  }

  const result = await confirmSubmittedMarketEscrowConsolidationTransfer(input.db, {
    marketId: input.transfer.market_id,
    adminEmail: input.adminEmail,
    transferId: input.transfer.id,
    rollupCommitmentHex,
    encryptedRollupNoteCiphertext,
    rollupAmountUnits,
    rollupLeafIndex,
    txHash,
  });
  if (!result.rollupNote) {
    return NextResponse.json(
      {
        error: "Submitted consolidation could not be finalized",
        transferId: input.transfer.id,
        txHash,
        minedLedger,
        rollupLeafIndex,
      },
      { status: 409 },
    );
  }

  const remainingCount = await countRemainingPayouts(input.db, input.transfer.market_id);
  return NextResponse.json({
    consolidation: {
      status: "confirmed",
      transferId: input.transfer.id,
      txHash,
      minedLedger,
      rollupLeafIndex,
      rollupAmountUnits,
      rollupCommitmentHex,
    },
    executedCount: 0,
    consolidatedCount: 1,
    remainingCount,
    completed: remainingCount === 0,
  });
}

async function recoverPreparedConsolidationSubmission(input: {
  db: ReturnType<typeof getPgPool>;
  transfer: SubmittedMarketEscrowConsolidationRow;
  adminEmail: string;
}) {
  const rollupCommitmentHex = readString(
    input.transfer.output_commitment_hex,
    "prepared consolidation commitment",
  );
  const encryptedRollupNoteCiphertext = readString(
    input.transfer.output_encrypted_note_ciphertext,
    "prepared consolidation ciphertext",
  );
  const rollupAmountUnits = readPositiveUnits(
    input.transfer.output_amount_units,
    "prepared consolidation amount",
  );

  let recovered: Awaited<ReturnType<typeof findMarketPoolCommitmentEvent>>;
  try {
    recovered = await findMarketPoolCommitmentEvent(input.transfer, rollupCommitmentHex);
  } catch (error) {
    if (isCommitmentNotFoundError(error)) return null;
    throw error;
  }

  const txHash = trimString(recovered.txHash);
  if (!txHash) {
    return NextResponse.json(
      {
        error: "Recovered consolidation commitment event did not include tx hash",
        transferId: input.transfer.id,
        rollupCommitmentHex,
        leafIndex: recovered.leafIndex,
        ledger: recovered.ledger,
      },
      { status: 409 },
    );
  }

  const submitted = await markMarketEscrowConsolidationSubmitted(input.db, {
    marketId: input.transfer.market_id,
    adminEmail: input.adminEmail,
    sourceEscrowNoteIds: input.transfer.source_escrow_note_ids,
    rollupCommitmentHex,
    encryptedRollupNoteCiphertext,
    rollupAmountUnits,
    txHash,
  });
  if (!submitted) {
    return NextResponse.json(
      {
        error: "Prepared consolidation was recovered but could not be checkpointed",
        transferId: input.transfer.id,
        txHash,
        rollupCommitmentHex,
      },
      { status: 409 },
    );
  }

  return finalizeSubmittedConsolidation({
    db: input.db,
    transfer: {
      ...input.transfer,
      ...submitted,
      tx_hash: txHash,
      output_commitment_hex: rollupCommitmentHex,
      output_encrypted_note_ciphertext: encryptedRollupNoteCiphertext,
      output_amount_units: rollupAmountUnits,
    },
    adminEmail: input.adminEmail,
  });
}

async function submitPreparedConsolidation(input: {
  db: ReturnType<typeof getPgPool>;
  transfer: SubmittedMarketEscrowConsolidationRow;
  adminEmail: string;
}) {
  const relayBody = readRelayBody(input.transfer.relay_body, "prepared consolidation relay body");
  const recovered = await recoverPreparedConsolidationSubmission(input);
  if (recovered) return recovered;

  const relayed = await relayWithRetry(relayBody);
  const submitted = await markMarketEscrowConsolidationSubmitted(input.db, {
    marketId: input.transfer.market_id,
    adminEmail: input.adminEmail,
    sourceEscrowNoteIds: input.transfer.source_escrow_note_ids,
    rollupCommitmentHex: readString(
      input.transfer.output_commitment_hex,
      "prepared consolidation commitment",
    ),
    encryptedRollupNoteCiphertext: readString(
      input.transfer.output_encrypted_note_ciphertext,
      "prepared consolidation ciphertext",
    ),
    rollupAmountUnits: readPositiveUnits(
      input.transfer.output_amount_units,
      "prepared consolidation amount",
    ),
    txHash: relayed.txHash,
  });
  if (!submitted) {
    return NextResponse.json(
      {
        error: "Prepared consolidation was relayed but could not be checkpointed",
        txHash: relayed.txHash,
      },
      { status: 409 },
    );
  }

  return finalizeSubmittedConsolidation({
    db: input.db,
    transfer: {
      ...input.transfer,
      ...submitted,
      tx_hash: relayed.txHash,
    },
    adminEmail: input.adminEmail,
  });
}

function payoutSourceNote(payout: ExecutableMarketPayoutRow): EscrowDecryptableNote {
  return {
    commitment_hex: payout.source_commitment_hex,
    encrypted_note_ciphertext: payout.source_encrypted_note_ciphertext,
    leaf_index: payout.source_leaf_index,
  };
}

function assertEscrowNoteMatches(
  row: Pick<MarketEscrowConsolidationPairRow, "commitment_hex" | "amount_units">,
  decrypted: DecryptedEscrowNote,
  label: string,
) {
  if (decrypted.commitmentHex !== row.commitment_hex) {
    throw new Error(`${label} commitment mismatch`);
  }
  if (decrypted.amountUnits !== String(row.amount_units)) {
    throw new Error(`${label} amount mismatch`);
  }
}

async function executeEscrowConsolidationStep(input: {
  db: ReturnType<typeof getPgPool>;
  marketId: string;
  adminEmail: string;
  keys: MarketEscrowKeys;
}) {
  const pair = await getMarketEscrowConsolidationPair(input.db, {
    marketId: input.marketId,
  });
  if (pair.length !== 2) return null;
  const [first, second] = pair;
  if (first.leaf_index === null || second.leaf_index === null) {
    throw new Error("Consolidation source notes must have indexed leaves");
  }
  if (first.contract_id !== second.contract_id) {
    throw new Error("Consolidation source notes must use the same market pool");
  }

  const firstNote = await decryptEscrowNote({
    note: {
      commitment_hex: first.commitment_hex,
      encrypted_note_ciphertext: readString(
        first.encrypted_note_ciphertext,
        "first escrow note ciphertext",
      ),
      leaf_index: readLeafIndex(first.leaf_index, "first escrow leaf index"),
    },
    notePrivateKeyHex: input.keys.notePrivateKeyHex,
    encryptionPrivateKeyHex: input.keys.encryptionPrivateKeyHex,
  });
  const secondNote = await decryptEscrowNote({
    note: {
      commitment_hex: second.commitment_hex,
      encrypted_note_ciphertext: readString(
        second.encrypted_note_ciphertext,
        "second escrow note ciphertext",
      ),
      leaf_index: readLeafIndex(second.leaf_index, "second escrow leaf index"),
    },
    notePrivateKeyHex: input.keys.notePrivateKeyHex,
    encryptionPrivateKeyHex: input.keys.encryptionPrivateKeyHex,
  });
  assertEscrowNoteMatches(first, firstNote, "First escrow source note");
  assertEscrowNoteMatches(second, secondNote, "Second escrow source note");

  const rollupAmountUnits = (
    BigInt(firstNote.amountUnits) + BigInt(secondNote.amountUnits)
  ).toString();
  const inputNotes = [
    {
      noteBlindingHex: firstNote.blindingHex,
      noteAmountUnits: firstNote.amountUnits,
      noteLeafIndex: readLeafIndex(first.leaf_index, "first escrow leaf index"),
    },
    {
      noteBlindingHex: secondNote.blindingHex,
      noteAmountUnits: secondNote.amountUnits,
      noteLeafIndex: readLeafIndex(second.leaf_index, "second escrow leaf index"),
    },
  ];
  const proof = await proveTransfer({
    notePrivateKeyHex: input.keys.notePrivateKeyHex,
    senderEncryptionPublicHex: input.keys.senderEncryptionPublicHex,
    membershipBlindingHex: input.keys.membershipBlindingHex,
    noteBlindingHex: firstNote.blindingHex,
    noteAmountUnits: firstNote.amountUnits,
    noteLeafIndex: readLeafIndex(first.leaf_index, "first escrow leaf index"),
    inputNotes,
    transferAmountUnits: rollupAmountUnits,
    recipientNotePublicHex: input.keys.senderNotePublicHex,
    recipientX25519PublicHex: input.keys.senderEncryptionPublicHex,
    poolId: first.contract_id,
  });
  if (proof.recipientAmountUnits !== rollupAmountUnits) {
    throw new Error("Consolidation proof recipient amount mismatch");
  }
  if (BigInt(proof.senderChangeAmountUnits || "0") !== BigInt(0)) {
    throw new Error("Consolidation proof unexpectedly produced sender change");
  }

  const encryptedRollupNoteCiphertext = encodeEncryptedOutput({
    proof,
    outputIndex: 0,
    commitmentHex: proof.recipientNoteCommitmentHex,
    amountUnits: proof.recipientAmountUnits,
    recipientNotePublicHex: input.keys.senderNotePublicHex,
    recipientX25519PublicHex: input.keys.senderEncryptionPublicHex,
  });
  const prepared = await markMarketEscrowConsolidationPrepared(input.db, {
    marketId: input.marketId,
    adminEmail: input.adminEmail,
    sourceEscrowNoteIds: [first.id, second.id],
    rollupCommitmentHex: proof.recipientNoteCommitmentHex,
    encryptedRollupNoteCiphertext,
    rollupAmountUnits: proof.recipientAmountUnits,
    relayBody: proof.relayBody as unknown as Record<string, unknown>,
  });
  if (!prepared) {
    return NextResponse.json(
      { error: "Consolidation transfer could not be prepared for retry-safe relay" },
      { status: 409 },
    );
  }

  const relayed = await relayWithRetry(proof.relayBody);
  const submitted = await markMarketEscrowConsolidationSubmitted(input.db, {
    marketId: input.marketId,
    adminEmail: input.adminEmail,
    sourceEscrowNoteIds: [first.id, second.id],
    rollupCommitmentHex: proof.recipientNoteCommitmentHex,
    encryptedRollupNoteCiphertext,
    rollupAmountUnits: proof.recipientAmountUnits,
    txHash: relayed.txHash,
  });
  if (!submitted) {
    return NextResponse.json(
      {
        error: "Consolidation transfer was relayed but could not be checkpointed",
        txHash: relayed.txHash,
      },
      { status: 409 },
    );
  }

  return finalizeSubmittedConsolidation({
    db: input.db,
    transfer: {
      ...submitted,
      pool_id: first.pool_id,
      contract_id: first.contract_id,
      deployment_ledger: first.deployment_ledger,
    },
    adminEmail: input.adminEmail,
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ marketId: string }> },
) {
  try {
    await requireMarketAdmin();
    const { marketId } = await context.params;
    const payouts = await listMarketPayoutQueue(getPgPool(), { marketId });

    return NextResponse.json({
      payouts: payouts.map((payout) => ({
        ...serializeMarketPayout(payout),
        userEmail: payout.user_email,
      })),
    });
  } catch (error) {
    return adminError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ marketId: string }> },
) {
  try {
    const session = await requireMarketAdmin();
    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const payoutIds = Array.isArray(payload.payoutIds)
      ? payload.payoutIds.filter((id): id is string => typeof id === "string" && id.trim() !== "")
      : [];
    if (payoutIds.length === 0) {
      return NextResponse.json({ error: "payoutIds are required" }, { status: 400 });
    }

    const { marketId } = await context.params;
    const db = getPgPool();
    const adminEmail = session?.user?.email ?? "abhinavpangaria2003@gmail.com";
    const startingRemainingCount = await countRemainingPayouts(db, marketId);
    if (startingRemainingCount === 0) {
      return NextResponse.json({
        executedCount: 0,
        consolidatedCount: 0,
        remainingCount: 0,
        completed: true,
      });
    }

    const submittedPayout = await getSubmittedMarketPayout(db, { marketId, payoutIds });
    if (submittedPayout) {
      if (!submittedPayout.tx_hash) {
        return submitPreparedPayout({
          db,
          payout: submittedPayout,
          adminEmail,
        });
      }
      return finalizeSubmittedPayout({
        db,
        payout: submittedPayout,
        adminEmail,
      });
    }

    const submittedConsolidation = await getSubmittedMarketEscrowConsolidation(db, { marketId });
    if (submittedConsolidation) {
      if (!submittedConsolidation.tx_hash) {
        return submitPreparedConsolidation({
          db,
          transfer: submittedConsolidation,
          adminEmail,
        });
      }
      return finalizeSubmittedConsolidation({
        db,
        transfer: submittedConsolidation,
        adminEmail,
      });
    }

    const payout = await getExecutableMarketPayout(db, { marketId, payoutIds });
    if (!payout) {
      const consolidation = await executeEscrowConsolidationStep({
        db,
        marketId,
        adminEmail,
        keys: readMarketEscrowKeys(),
      });
      if (consolidation) return consolidation;

      return NextResponse.json(
        {
          error: "No executable payout with a spendable escrow note is available",
          executedCount: 0,
          consolidatedCount: 0,
          remainingCount: await countRemainingPayouts(db, marketId),
          completed: false,
        },
        { status: 409 },
      );
    }

    const keys = readMarketEscrowKeys();
    const sourceNote = await decryptEscrowNote({
      note: payoutSourceNote(payout),
      notePrivateKeyHex: keys.notePrivateKeyHex,
      encryptionPrivateKeyHex: keys.encryptionPrivateKeyHex,
    });
    if (sourceNote.commitmentHex !== payout.source_commitment_hex) {
      return NextResponse.json({ error: "Escrow source note commitment mismatch" }, { status: 409 });
    }
    if (BigInt(sourceNote.amountUnits) < BigInt(payout.amount_units)) {
      return NextResponse.json({ error: "Escrow source note is smaller than payout" }, { status: 409 });
    }

    const proof = await proveTransfer({
      notePrivateKeyHex: keys.notePrivateKeyHex,
      senderEncryptionPublicHex: keys.senderEncryptionPublicHex,
      membershipBlindingHex: keys.membershipBlindingHex,
      noteBlindingHex: sourceNote.blindingHex,
      noteAmountUnits: sourceNote.amountUnits,
      noteLeafIndex: payout.source_leaf_index,
      transferAmountUnits: String(payout.amount_units),
      recipientNotePublicHex: readHex32(
        payout.recipient_bn254_public_hex,
        "recipient bn254 public key",
      ),
      recipientX25519PublicHex: readHex32(
        payout.recipient_x25519_public_hex,
        "recipient x25519 public key",
      ),
      poolId: payout.contract_id,
    });

    const encryptedPayoutNoteCiphertext = encodeEncryptedOutput({
      proof,
      outputIndex: 0,
      commitmentHex: proof.recipientNoteCommitmentHex,
      amountUnits: proof.recipientAmountUnits,
      recipientNotePublicHex: payout.recipient_bn254_public_hex,
      recipientX25519PublicHex: payout.recipient_x25519_public_hex,
    });
    const encryptedChangeNoteCiphertext = BigInt(proof.senderChangeAmountUnits || "0") === BigInt(0)
      ? null
      : encodeEncryptedOutput({
          proof,
          outputIndex: 1,
          commitmentHex: proof.senderChangeCommitmentHex,
          amountUnits: proof.senderChangeAmountUnits,
          recipientNotePublicHex: keys.senderNotePublicHex,
          recipientX25519PublicHex: keys.senderEncryptionPublicHex,
        });
    const prepared = await markMarketPayoutPrepared(db, {
      marketId,
      payoutId: payout.id,
      sourceEscrowNoteId: payout.source_escrow_note_id,
      payoutCommitmentHex: proof.recipientNoteCommitmentHex,
      encryptedPayoutNoteCiphertext,
      changeCommitmentHex: encryptedChangeNoteCiphertext ? proof.senderChangeCommitmentHex : null,
      encryptedChangeNoteCiphertext,
      changeAmountUnits: encryptedChangeNoteCiphertext ? proof.senderChangeAmountUnits : null,
      relayBody: proof.relayBody as unknown as Record<string, unknown>,
    });
    if (!prepared) {
      return NextResponse.json(
        { error: "Payout transfer could not be prepared for retry-safe relay" },
        { status: 409 },
      );
    }

    const relayed = await relayWithRetry(proof.relayBody);
    const submitted = await markMarketPayoutSubmitted(db, {
      marketId,
      payoutId: payout.id,
      sourceEscrowNoteId: payout.source_escrow_note_id,
      payoutCommitmentHex: proof.recipientNoteCommitmentHex,
      encryptedPayoutNoteCiphertext,
      changeCommitmentHex: encryptedChangeNoteCiphertext ? proof.senderChangeCommitmentHex : null,
      encryptedChangeNoteCiphertext,
      changeAmountUnits: encryptedChangeNoteCiphertext ? proof.senderChangeAmountUnits : null,
      txHash: relayed.txHash,
    });
    if (!submitted) {
      await emitMarketPayoutFailedNotification(db, {
        userId: payout.user_id,
        payoutId: payout.id,
        marketId,
        amountUnits: String(payout.amount_units),
        errorMessage: "Payout transfer was relayed but could not be checkpointed",
        txHash: relayed.txHash,
      });
      return NextResponse.json(
        {
          error: "Payout transfer was relayed but could not be checkpointed",
          txHash: relayed.txHash,
        },
        { status: 409 },
      );
    }

    return finalizeSubmittedPayout({
      db,
      adminEmail,
      payout: {
        ...payout,
        status: "submitted",
        tx_hash: relayed.txHash,
        payout_commitment_hex: proof.recipientNoteCommitmentHex,
        encrypted_note_ciphertext: encryptedPayoutNoteCiphertext,
        source_escrow_note_id: payout.source_escrow_note_id,
        change_commitment_hex: encryptedChangeNoteCiphertext ? proof.senderChangeCommitmentHex : null,
        encrypted_change_note_ciphertext: encryptedChangeNoteCiphertext,
        change_amount_units: encryptedChangeNoteCiphertext ? proof.senderChangeAmountUnits : null,
        change_leaf_index: null,
      },
    });
  } catch (error) {
    return adminError(error);
  }
}
