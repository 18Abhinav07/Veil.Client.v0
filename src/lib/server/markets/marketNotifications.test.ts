import test from "node:test";
import assert from "node:assert/strict";

import {
  emitMarketPayoutReadyNotification,
  emitMarketUserNotification,
  type QueryClient,
} from "./marketNotifications";

interface RecordedQuery {
  text: string;
  values: unknown[] | undefined;
}

class RecordingDb implements QueryClient {
  readonly queries: RecordedQuery[] = [];

  async query<Row>(text: string, values?: unknown[]) {
    this.queries.push({ text, values });
    return { rows: [{ id: "row-1" } as Row], rowCount: 1 };
  }

  combinedSql() {
    return this.queries.map((query) => query.text).join("\n");
  }
}

test("market user notifications write wallet activity and deduped notification rows", async () => {
  const db = new RecordingDb();

  await emitMarketUserNotification(db, {
    userId: "user-1",
    eventType: "market_bet_confirmed",
    marketId: "market-1",
    marketSlug: "btc-above-60k",
    entityKind: "market_bet",
    entityId: "bet-1",
    amountUnits: "100000000",
    title: "Market bet confirmed",
    actionUrl: "/market/btc-above-60k",
    txHash: "tx-bet",
  });

  const sql = db.combinedSql();
  assert.match(sql, /insert into activity_events/i);
  assert.match(sql, /insert into notification_inbox/i);
  assert.match(sql, /where not exists/i);
  assert.ok(
    db.queries.some((query) => query.values?.includes("market_bet_confirmed")),
    "expected market event type to be written",
  );
  assert.ok(
    db.queries.some((query) =>
      query.values?.some(
        (value) => typeof value === "string" && value.includes("10.00 USDC"),
      ),
    ),
    "expected market notification body to use formatted USDC units",
  );
});

test("market payout ready notification is emitted only for executable payout notes", async () => {
  const db = new RecordingDb();

  await emitMarketPayoutReadyNotification(db, {
    userId: "user-1",
    payoutId: "payout-1",
    marketId: "market-1",
    amountUnits: "2500000000",
    payoutCommitmentHex: "commitment",
    encryptedNoteCiphertext: "ciphertext",
    leafIndex: 42,
    txHash: "tx-payout",
  });

  assert.ok(
    db.queries.some((query) => query.values?.includes("market_payout_ready")),
    "expected ready payout notification type",
  );
  assert.ok(
    db.queries.some((query) => query.values?.includes("/market?view=portfolio&tab=payouts")),
    "expected payout action to point to Portfolio Payouts",
  );
  assert.rejects(
    () =>
      emitMarketPayoutReadyNotification(db, {
        userId: "user-1",
        payoutId: "payout-2",
        marketId: "market-1",
        amountUnits: "2500000000",
        payoutCommitmentHex: "commitment",
        encryptedNoteCiphertext: null,
        leafIndex: 42,
        txHash: "tx-payout",
      }),
    /not ready/i,
  );
});
