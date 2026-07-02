import {
  createNotificationOnce,
  formatUsdcUnits,
  recordActivityEvent,
} from "../walletRepositoryCore";

export type { QueryClient } from "./marketRepositoryCore";
import type { MarketPayoutRow, QueryClient } from "./marketRepositoryCore";

type MarketNotificationType =
  | "market_deposit_confirmed"
  | "market_withdraw_confirmed"
  | "market_bet_confirmed"
  | "market_payout_ready"
  | "market_payout_claimed"
  | "market_payout_failed";

export async function emitMarketUserNotification(
  db: QueryClient,
  input: {
    userId: string;
    eventType: MarketNotificationType;
    marketId?: string | null;
    marketSlug?: string | null;
    payoutId?: string | null;
    betId?: string | null;
    noteId?: string | null;
    entityKind: string;
    entityId?: string | null;
    amountUnits?: string | null;
    title: string;
    body?: string | null;
    actionUrl: string;
    severity?: "info" | "success" | "warning" | "error";
    txHash?: string | null;
    eventData?: Record<string, unknown>;
  },
) {
  const amountText = input.amountUnits ? formatUsdcUnits(input.amountUnits) : null;
  const activity = await recordActivityEvent(db, {
    userId: input.userId,
    eventType: input.eventType,
    eventData: {
      marketId: input.marketId ?? null,
      marketSlug: input.marketSlug ?? null,
      payoutId: input.payoutId ?? null,
      betId: input.betId ?? null,
      noteId: input.noteId ?? null,
      amountUnits: input.amountUnits ?? null,
      ...input.eventData,
    },
    txHash: input.txHash ?? null,
  });
  return createNotificationOnce(db, {
    userId: input.userId,
    activityEventId: activity?.id,
    type: input.eventType,
    severity: input.severity ?? "success",
    entityKind: input.entityKind,
    entityId: input.entityId ?? null,
    title: input.title,
    body: input.body ?? (amountText ? `${amountText} updated in Markets.` : null),
    actionUrl: input.actionUrl,
  });
}

export async function emitMarketPayoutReadyNotification(
  db: QueryClient,
  input: {
    userId: string;
    payoutId: string;
    marketId: string;
    amountUnits: string;
    payoutCommitmentHex?: string | null;
    encryptedNoteCiphertext?: string | null;
    leafIndex?: number | null;
    txHash?: string | null;
  },
) {
  if (
    !input.payoutCommitmentHex ||
    !input.encryptedNoteCiphertext ||
    input.leafIndex === null ||
    input.leafIndex === undefined
  ) {
    throw new Error("Market payout is not ready for notification");
  }
  return emitMarketUserNotification(db, {
    userId: input.userId,
    eventType: "market_payout_ready",
    marketId: input.marketId,
    payoutId: input.payoutId,
    entityKind: "market_payout",
    entityId: input.payoutId,
    amountUnits: input.amountUnits,
    title: "Market payout ready",
    body: `${formatUsdcUnits(input.amountUnits)} is ready to claim into Market Notes.`,
    actionUrl: "/market?view=portfolio&tab=payouts",
    txHash: input.txHash ?? null,
    eventData: {
      leafIndex: input.leafIndex,
      payoutCommitmentHex: input.payoutCommitmentHex,
    },
  });
}

export async function emitMarketPayoutReadyForRow(
  db: QueryClient,
  payout: MarketPayoutRow,
) {
  return emitMarketPayoutReadyNotification(db, {
    userId: payout.user_id,
    payoutId: payout.id,
    marketId: payout.market_id,
    amountUnits: String(payout.amount_units),
    payoutCommitmentHex: payout.payout_commitment_hex,
    encryptedNoteCiphertext: payout.encrypted_note_ciphertext,
    leafIndex: payout.leaf_index,
    txHash: payout.tx_hash,
  });
}

export async function emitMarketPayoutFailedNotification(
  db: QueryClient,
  input: {
    userId: string;
    payoutId: string;
    marketId: string;
    amountUnits: string;
    errorMessage?: string | null;
    txHash?: string | null;
  },
) {
  return emitMarketUserNotification(db, {
    userId: input.userId,
    eventType: "market_payout_failed",
    marketId: input.marketId,
    payoutId: input.payoutId,
    entityKind: "market_payout",
    entityId: input.payoutId,
    amountUnits: input.amountUnits,
    title: "Market payout needs attention",
    body: input.errorMessage
      ? `${formatUsdcUnits(input.amountUnits)} payout failed: ${input.errorMessage}`
      : `${formatUsdcUnits(input.amountUnits)} payout failed and needs retry.`,
    actionUrl: "/market?view=portfolio&tab=payouts",
    severity: "warning",
    txHash: input.txHash ?? null,
  });
}
