import test from "node:test";
import assert from "node:assert/strict";

import {
  cancelMarket,
  claimMarketPayoutNote,
  closeMarketForResolution,
  cancelPendingMarketBet,
  confirmSubmittedMarketEscrowConsolidationTransfer,
  createPredictionMarketDraft,
  createMarketDepositNote,
  confirmMarketBet,
  createMarketBetIntent,
  executeMarketPayoutBatch,
  executeMarketEscrowConsolidationTransfer,
  executeMarketPayoutTransfer,
  ensureMarketPool,
  getExecutableMarketPayout,
  getMarketEscrowConsolidationPair,
  getSubmittedMarketEscrowConsolidation,
  getSubmittedMarketPayout,
  getSubmittedMarketBetRecovery,
  getMarketBySlug,
  listMarketPayoutQueue,
  listMarkets,
  markMarketEscrowConsolidationSubmitted,
  markMarketEscrowConsolidationPrepared,
  listUserMarketPortfolio,
  markMarketBetSubmitted,
  markMarketBetPrepared,
  markMarketPayoutPrepared,
  markMarketPayoutSubmitted,
  openPredictionMarketDraft,
  recordMarketActivity,
  resolveMarketAndCreateSettlement,
  updatePredictionMarketDraft,
  upsertMarketSeeds,
  upsertMarketUserNote,
  type MarketBetRow,
  type QueryClient,
} from "./marketRepositoryCore";
import { buildInitialMarketSeeds } from "./marketSeeds";

interface RecordedQuery {
  text: string;
  values: unknown[] | undefined;
}

class RecordingDb implements QueryClient {
  readonly queries: RecordedQuery[] = [];

  async query<Row>(text: string, values?: unknown[]) {
    this.queries.push({ text, values });
    return {
      rows: [
        {
          id: "row-1",
          market_id: "market-1",
          user_id: "user-1",
          outcome: "YES",
          amount_units: "100",
        } as Row,
      ],
      rowCount: 1,
    };
  }
}

class ScriptedDb implements QueryClient {
  readonly queries: RecordedQuery[] = [];

  constructor(private readonly rows: Array<Record<string, unknown>[]>) {}

  async query<Row>(text: string, values?: unknown[]) {
    this.queries.push({ text, values });
    return { rows: (this.rows.shift() ?? []) as Row[], rowCount: 1 };
  }
}

test("market repository writes every prediction-market table through parameterized SQL", async () => {
  const db = new RecordingDb();
  const [seed] = buildInitialMarketSeeds({ seededAt: new Date("2026-06-30T12:00:00.000Z") });

  await ensureMarketPool(db, {
    poolId: "veil_market_pool_v1",
    contractId: null,
    treeDepth: 15,
    deploymentLedger: 1,
    status: "planned",
  });
  await upsertMarketSeeds(db, { poolId: "veil_market_pool_v1", seeds: [seed] });
  await listMarkets(db, { includeDemo: true });
  await getMarketBySlug(db, { slug: seed.slug });
  await listUserMarketPortfolio(db, { userId: "user-1" });
  await upsertMarketUserNote(db, {
    userId: "user-1",
    poolId: "veil_market_pool_v1",
    commitmentHex: "commitment",
    encryptedNoteCiphertext: "ciphertext",
    amountUnits: "100",
    status: "unspent",
    source: "market_deposit",
  });
  await createMarketBetIntent(db, {
    userId: "user-1",
    marketSlug: seed.slug,
    outcome: "YES",
    amountUnits: "100",
    idempotencyKey: "idem-1",
    noteId: "note-1",
    inputCommitmentHex: "commitment",
  });
  await confirmMarketBet(db, {
    userId: "user-1",
    betId: "bet-1",
    escrowCommitmentHex: "escrow-commitment",
    escrowEncryptedNoteCiphertext: "{\"encryptedOutputKind\":\"spp-x25519-output-note\"}",
    escrowLeafIndex: 77,
    changeCommitmentHex: "change-commitment",
    changeAmountUnits: "25",
    changeLeafIndex: 78,
    encryptedChangeNoteCiphertext: "{\"version\":1}",
    txHash: "tx-bet",
  });
  await recordMarketActivity(db, {
    userId: "user-1",
    marketId: "market-1",
    betId: "bet-1",
    eventType: "market_bet_confirmed",
    eventData: { amountUnits: "100" },
    txHash: "tx-bet",
  });
  await closeMarketForResolution(db, {
    marketId: "market-1",
    adminEmail: "abhinavpangaria2003@gmail.com",
  });
  await cancelMarket(db, {
    marketId: "market-1",
    adminEmail: "abhinavpangaria2003@gmail.com",
    reason: "Bad market data",
  });
  await executeMarketPayoutBatch(db, {
    marketId: "market-1",
    adminEmail: "abhinavpangaria2003@gmail.com",
    payoutIds: ["payout-1"],
    txHash: "tx-payout",
  });
  await claimMarketPayoutNote(db, {
    userId: "user-1",
    payoutId: "payout-1",
    commitmentHex: "payout-commitment",
    encryptedNoteCiphertext: "{\"version\":1}",
  });
  await listMarketPayoutQueue(db, {
    marketId: "market-1",
  });

  const combinedSql = db.queries.map((query) => query.text).join("\n");
  for (const table of [
    "market_pools",
    "prediction_markets",
    "market_user_notes",
    "market_bets",
    "market_escrow_notes",
    "market_payouts",
    "market_settlement_jobs",
    "market_activity_events",
  ]) {
    assert.match(combinedSql, new RegExp(`\\b${table}\\b`, "i"));
  }
  for (const query of db.queries) {
    assert.match(query.text, /\$\d/);
    assert.ok(query.values && query.values.length > 0);
  }
});

test("market admin draft lifecycle creates updates and opens production markets", async () => {
  const db = new RecordingDb();

  await createPredictionMarketDraft(db, {
    poolId: "veil_market_pool_v1",
    slug: "btc-above-120k-july",
    title: "Will Bitcoin close above $120k by July 31?",
    category: "Crypto",
    closesAt: "2026-07-31T20:00:00.000Z",
    resolvesAt: "2026-08-01T20:00:00.000Z",
    rules: "Resolves YES if the selected BTC/USD reference closes above $120k.",
    resolutionSource: "Coinbase BTC-USD reference close",
    iconName: "bitcoin",
    displayOrder: 15,
    adminEmail: "abhinavpangaria2003@gmail.com",
  });
  await updatePredictionMarketDraft(db, {
    marketId: "market-1",
    title: "Will Bitcoin close above $120k before August?",
    category: "Crypto",
    closesAt: "2026-07-31T20:00:00.000Z",
    resolvesAt: "2026-08-01T20:00:00.000Z",
    rules: "Resolves YES if the selected BTC/USD reference closes above $120k.",
    resolutionSource: "Coinbase BTC-USD reference close",
    iconName: "bitcoin",
    displayOrder: 16,
    adminEmail: "abhinavpangaria2003@gmail.com",
  });
  await openPredictionMarketDraft(db, {
    marketId: "market-1",
    adminEmail: "abhinavpangaria2003@gmail.com",
  });

  const combinedSql = db.queries.map((query) => query.text).join("\n");
  assert.match(combinedSql, /insert into prediction_markets/i);
  assert.match(combinedSql, /status, closes_at, resolves_at/i);
  assert.match(combinedSql, /'draft'/i);
  assert.match(combinedSql, /demo_only/i);
  assert.match(combinedSql, /update prediction_markets/i);
  assert.match(combinedSql, /where id = \$1[\s\S]+status = 'draft'/i);
  assert.match(combinedSql, /status = 'open'/i);
  assert.match(combinedSql, /market_admin_draft_created/i);
  assert.match(combinedSql, /market_admin_draft_updated/i);
  assert.match(combinedSql, /market_admin_opened/i);
});

test("market admin payout queue lists actionable payouts before execution", async () => {
  const db = new RecordingDb();

  await listMarketPayoutQueue(db, {
    marketId: "market-1",
  });

  const query = db.queries.at(-1);
  assert.match(query?.text ?? "", /from market_payouts/i);
  assert.match(query?.text ?? "", /where p\.market_id = \$1/i);
  assert.match(query?.text ?? "", /p\.status in \('pending', 'submitted', 'failed'\)/i);
  assert.match(query?.text ?? "", /left join users/i);
});

test("market admin lifecycle closes, cancels, and executes payout batches with audit events", async () => {
  const db = new RecordingDb();

  await closeMarketForResolution(db, {
    marketId: "market-1",
    adminEmail: "abhinavpangaria2003@gmail.com",
  });
  await cancelMarket(db, {
    marketId: "market-1",
    adminEmail: "abhinavpangaria2003@gmail.com",
    reason: "Resolution source unavailable",
  });
  await executeMarketPayoutBatch(db, {
    marketId: "market-1",
    adminEmail: "abhinavpangaria2003@gmail.com",
    payoutIds: ["payout-1", "payout-2"],
    txHash: "tx-payout",
  });

  const combinedSql = db.queries.map((query) => query.text).join("\n");
  assert.match(combinedSql, /status = 'closed'/i);
  assert.match(combinedSql, /status = 'cancelled'/i);
  assert.match(combinedSql, /status = 'confirmed'/i);
  assert.match(combinedSql, /market_admin_closed/i);
  assert.match(combinedSql, /market_admin_cancelled/i);
  assert.match(combinedSql, /market_payout_batch_executed/i);
  assert.match(combinedSql, /where market_id = \$1/i);
});

test("market admin payout execution selects escrow source notes and records payout transfer outputs", async () => {
  const db = new RecordingDb();

  await getExecutableMarketPayout(db, {
    marketId: "market-1",
    payoutIds: ["payout-1"],
  });
  await executeMarketPayoutTransfer(db, {
    marketId: "market-1",
    adminEmail: "abhinavpangaria2003@gmail.com",
    payoutId: "payout-1",
    sourceEscrowNoteId: "escrow-note-1",
    payoutCommitmentHex: "payout-commitment",
    encryptedPayoutNoteCiphertext: "{\"encryptedOutputKind\":\"spp-x25519-output-note\"}",
    payoutLeafIndex: 91,
    changeCommitmentHex: "escrow-change",
    encryptedChangeNoteCiphertext: "{\"encryptedOutputKind\":\"spp-x25519-output-note\",\"outputIndex\":1}",
    changeAmountUnits: "25",
    changeLeafIndex: 92,
    txHash: "tx-payout",
  });

  const combinedSql = db.queries.map((query) => query.text).join("\n");
  assert.match(combinedSql, /from market_payouts p/i);
  assert.match(combinedSql, /join prediction_markets m on m\.id = p\.market_id/i);
  assert.match(combinedSql, /join market_pools pool on pool\.pool_id = m\.pool_id/i);
  assert.match(combinedSql, /join wallet_profiles recipient_profile/i);
  assert.match(combinedSql, /join lateral/i);
  assert.match(combinedSql, /from market_escrow_notes e/i);
  assert.match(combinedSql, /e\.status = 'escrowed'/i);
  assert.match(combinedSql, /e\.amount_units >= p\.amount_units/i);
  assert.match(combinedSql, /recipient_profile\.bn254_public_hex is not null/i);
  assert.match(combinedSql, /recipient_profile\.x25519_public_hex is not null/i);
  assert.match(combinedSql, /update market_escrow_notes/i);
  assert.match(combinedSql, /status = 'spent'/i);
  assert.match(combinedSql, /submitted_payout\.tx_hash = \$7/i);
  assert.match(combinedSql, /insert into market_escrow_notes/i);
  assert.match(combinedSql, /encrypted_note_ciphertext/i);
  assert.match(combinedSql, /update market_payouts/i);
  assert.match(combinedSql, /payout_commitment_hex = \$4/i);
  assert.match(combinedSql, /encrypted_note_ciphertext = \$5/i);
  assert.match(combinedSql, /leaf_index = \$6/i);
  assert.match(combinedSql, /market_payout_executed/i);
});

test("market escrow consolidation selects two smallest spendable notes and records a rollup note", async () => {
  const db = new RecordingDb();

  await getMarketEscrowConsolidationPair(db, {
    marketId: "market-1",
  });
  await executeMarketEscrowConsolidationTransfer(db, {
    marketId: "market-1",
    adminEmail: "abhinavpangaria2003@gmail.com",
    sourceEscrowNoteIds: ["escrow-small-1", "escrow-small-2"],
    rollupCommitmentHex: "rollup-commitment",
    encryptedRollupNoteCiphertext: "{\"encryptedOutputKind\":\"spp-x25519-output-note\"}",
    rollupAmountUnits: "322608696",
    rollupLeafIndex: 93,
    txHash: "tx-consolidate",
  });
  await markMarketEscrowConsolidationSubmitted(db, {
    marketId: "market-1",
    adminEmail: "abhinavpangaria2003@gmail.com",
    sourceEscrowNoteIds: ["escrow-small-1", "escrow-small-2"],
    rollupCommitmentHex: "rollup-commitment",
    encryptedRollupNoteCiphertext: "{\"encryptedOutputKind\":\"spp-x25519-output-note\"}",
    rollupAmountUnits: "322608696",
    txHash: "tx-consolidate-submitted",
  });
  await getSubmittedMarketEscrowConsolidation(db, {
    marketId: "market-1",
  });
  await markMarketEscrowConsolidationPrepared(db, {
    marketId: "market-1",
    adminEmail: "abhinavpangaria2003@gmail.com",
    sourceEscrowNoteIds: ["escrow-small-1", "escrow-small-2"],
    rollupCommitmentHex: "prepared-rollup-commitment",
    encryptedRollupNoteCiphertext: "{\"encryptedOutputKind\":\"spp-x25519-output-note\"}",
    rollupAmountUnits: "322608696",
    relayBody: { poolId: "market-pool", public: { inputNullifiers: ["1", "2"] } },
  });
  await confirmSubmittedMarketEscrowConsolidationTransfer(db, {
    marketId: "market-1",
    adminEmail: "abhinavpangaria2003@gmail.com",
    transferId: "transfer-1",
    rollupCommitmentHex: "rollup-commitment",
    encryptedRollupNoteCiphertext: "{\"encryptedOutputKind\":\"spp-x25519-output-note\"}",
    rollupAmountUnits: "322608696",
    rollupLeafIndex: 93,
    txHash: "tx-consolidate-submitted",
  });

  const combinedSql = db.queries.map((query) => query.text).join("\n");
  assert.match(combinedSql, /from market_escrow_notes e/i);
  assert.match(combinedSql, /e\.status = 'escrowed'/i);
  assert.match(combinedSql, /e\.leaf_index is not null/i);
  assert.match(combinedSql, /order by e\.amount_units asc/i);
  assert.match(combinedSql, /limit 2/i);
  assert.match(combinedSql, /update market_escrow_notes/i);
  assert.match(combinedSql, /id = any\(\$2::uuid\[\]\)/i);
  assert.match(combinedSql, /prepared_transfer\.relay_body is not null/i);
  assert.match(combinedSql, /submitted_transfer\.tx_hash = \$7/i);
  assert.match(combinedSql, /from source_notes e/i);
  assert.match(combinedSql, /insert into market_escrow_notes/i);
  assert.match(combinedSql, /null, .*'POOL'/i);
  assert.match(combinedSql, /'rollup'/i);
  assert.match(combinedSql, /insert into market_escrow_transfers/i);
  assert.match(combinedSql, /output_encrypted_note_ciphertext/i);
  assert.match(combinedSql, /relay_body/i);
  assert.match(combinedSql, /status = 'submitted'/i);
  assert.match(combinedSql, /market_escrow_consolidation_submitted/i);
  assert.match(combinedSql, /market_escrow_consolidated/i);
});

test("market admin payout submission checkpoints relayed outputs for finalize recovery", async () => {
  const db = new RecordingDb();

  await markMarketPayoutSubmitted(db, {
    marketId: "market-1",
    payoutId: "payout-1",
    sourceEscrowNoteId: "escrow-note-1",
    payoutCommitmentHex: "payout-commitment",
    encryptedPayoutNoteCiphertext: "{\"encryptedOutputKind\":\"spp-x25519-output-note\"}",
    changeCommitmentHex: "escrow-change",
    encryptedChangeNoteCiphertext: "{\"encryptedOutputKind\":\"spp-x25519-output-note\",\"outputIndex\":1}",
    changeAmountUnits: "25",
    txHash: "tx-payout",
  });
  await markMarketPayoutPrepared(db, {
    marketId: "market-1",
    payoutId: "payout-1",
    sourceEscrowNoteId: "escrow-note-1",
    payoutCommitmentHex: "prepared-payout-commitment",
    encryptedPayoutNoteCiphertext: "{\"encryptedOutputKind\":\"spp-x25519-output-note\"}",
    changeCommitmentHex: "prepared-escrow-change",
    encryptedChangeNoteCiphertext: "{\"encryptedOutputKind\":\"spp-x25519-output-note\",\"outputIndex\":1}",
    changeAmountUnits: "25",
    relayBody: { poolId: "market-pool", public: { inputNullifiers: ["1", "2"] } },
  });
  await getSubmittedMarketPayout(db, {
    marketId: "market-1",
    payoutIds: ["payout-1"],
  });

  const combinedSql = db.queries.map((query) => query.text).join("\n");
  assert.match(combinedSql, /update market_escrow_notes/i);
  assert.match(combinedSql, /status = 'spent'/i);
  assert.match(combinedSql, /update market_payouts/i);
  assert.match(combinedSql, /status = 'submitted'/i);
  assert.match(combinedSql, /source_escrow_note_id = \$3/i);
  assert.match(combinedSql, /change_commitment_hex = \$7/i);
  assert.match(combinedSql, /encrypted_change_note_ciphertext = \$8/i);
  assert.match(combinedSql, /change_amount_units = \$9::numeric/i);
  assert.match(combinedSql, /relay_body/i);
  assert.match(combinedSql, /prepared_payout\.relay_body is not null/i);
  assert.match(combinedSql, /market_payout_submitted/i);
  assert.match(combinedSql, /p\.status = 'submitted'/i);
  assert.match(combinedSql, /p\.source_escrow_note_id is not null/i);
  assert.match(combinedSql, /source\.status = 'spent'/i);
});

test("market repository settlement uses confirmed bets and persists explicit payout rows", async () => {
  const db = new ScriptedDb([
    [
      { user_id: "alice", outcome: "YES", amount_units: "150" },
      { user_id: "bob", outcome: "YES", amount_units: "50" },
      { user_id: "carol", outcome: "NO", amount_units: "101" },
    ] satisfies Partial<MarketBetRow>[],
    [{ id: "resolution-1", market_id: "market-1", outcome: "YES" }],
    [{ id: "market-1", status: "settling", winning_outcome: "YES" }],
    [{ id: "settlement-1", market_id: "market-1", rounding_dust_units: "1" }],
    [{ id: "payout-alice", user_id: "alice", amount_units: "225" }],
    [{ id: "payout-bob", user_id: "bob", amount_units: "75" }],
  ]);

  const result = await resolveMarketAndCreateSettlement(db, {
    marketId: "market-1",
    winningOutcome: "YES",
    resolverEmail: "abhinavpangaria2003@gmail.com",
    evidenceText: "Official source resolved YES.",
    evidenceUrl: "https://example.com/resolution",
  });

  assert.equal(result.settlement.totalPoolUnits, "301");
  assert.equal(result.settlement.winningPoolUnits, "200");
  assert.equal(result.settlement.roundingDustUnits, "1");
  assert.deepEqual(result.settlement.payouts, [
    { userId: "alice", amountUnits: "225" },
    { userId: "bob", amountUnits: "75" },
  ]);
  assert.equal(result.payouts.length, 2);
  assert.match(
    db.queries.map((query) => query.text).join("\n"),
    /from market_bets[\s\S]+status = 'confirmed'/i,
  );
});

test("market bet intents require a spendable market note owned by the user", async () => {
  const db = new RecordingDb();
  await assert.rejects(
    () =>
      createMarketBetIntent(db, {
        userId: "user-1",
        marketSlug: "btc-higher-after-21d",
        outcome: "YES",
        amountUnits: "100",
        idempotencyKey: "idem-1",
      }),
    /market note/i,
  );

  await createMarketBetIntent(db, {
    userId: "user-1",
    marketSlug: "btc-higher-after-21d",
    outcome: "YES",
    amountUnits: "100",
    idempotencyKey: "idem-2",
    noteId: "note-1",
    inputCommitmentHex: "commitment",
  });

  const intentSql = db.queries.at(-1)?.text ?? "";
  assert.match(intentSql, /join market_user_notes/i);
  assert.match(intentSql, /n\.status = 'unspent'/i);
  assert.match(intentSql, /n\.amount_units >= \$4::numeric/i);
  assert.match(intentSql, /with existing_bet as/i);
  assert.match(intentSql, /update market_user_notes n[\s\S]+status = 'pending_bet'/i);
  assert.match(intentSql, /not exists \(select 1 from existing_bet\)/i);
  assert.match(intentSql, /select \* from inserted_bet[\s\S]+union all[\s\S]+select \* from existing_bet/i);
});

test("market bet confirmation creates an escrow note and only consumes a locked bet note", async () => {
  const db = new RecordingDb();

  await confirmMarketBet(db, {
    userId: "user-1",
    betId: "bet-1",
    escrowCommitmentHex: "escrow-commitment",
    escrowEncryptedNoteCiphertext: "{\"encryptedOutputKind\":\"spp-x25519-output-note\"}",
    escrowLeafIndex: 77,
    changeCommitmentHex: "change-commitment",
    changeAmountUnits: "25",
    changeLeafIndex: 78,
    encryptedChangeNoteCiphertext: "{\"version\":1}",
    txHash: "tx-bet",
  });

  const combinedSql = db.queries.map((query) => query.text).join("\n");
  assert.match(combinedSql, /status in \('pending', 'submitted'\)/i);
  assert.match(combinedSql, /update market_user_notes set[\s\S]+status = 'escrowed'/i);
  assert.match(combinedSql, /and status = 'pending_bet'/i);
  assert.match(combinedSql, /insert into market_escrow_notes/i);
  assert.match(combinedSql, /leaf_index,[\s\S]+encrypted_note_ciphertext/i);
  assert.match(combinedSql, /insert into market_user_notes[\s\S]+'change'/i);
  assert.match(combinedSql, /status = 'unspent'/i);
  assert.match(combinedSql, /on conflict \(pool_id, commitment_hex\) do update/i);
});

test("market bet submission checkpoints tx hash before escrow indexing can lag", async () => {
  const db = new RecordingDb();

  await markMarketBetPrepared(db, {
    userId: "user-1",
    betId: "bet-1",
    escrowCommitmentHex: "escrow-commitment",
    escrowEncryptedNoteCiphertext: "{\"encryptedOutputKind\":\"spp-x25519-output-note\"}",
    changeCommitmentHex: "change-commitment",
    changeAmountUnits: "25",
    encryptedChangeNoteCiphertext: "{\"version\":1}",
    relayBody: { poolId: "market-pool", public: { inputNullifiers: ["1", "2"] } },
  });
  await markMarketBetSubmitted(db, {
    userId: "user-1",
    betId: "bet-1",
    escrowCommitmentHex: "escrow-commitment",
    escrowEncryptedNoteCiphertext: "{\"encryptedOutputKind\":\"spp-x25519-output-note\"}",
    changeCommitmentHex: "change-commitment",
    changeAmountUnits: "25",
    encryptedChangeNoteCiphertext: "{\"version\":1}",
    txHash: "tx-bet",
  });

  const submitSql = db.queries.map((query) => query.text).join("\n");
  assert.match(submitSql, /update market_bets set/i);
  assert.match(submitSql, /status = 'submitted'/i);
  assert.match(submitSql, /escrow_encrypted_note_ciphertext = nullif\(\$5, ''\)/i);
  assert.match(submitSql, /encrypted_change_note_ciphertext = nullif\(\$7, ''\)/i);
  assert.match(submitSql, /change_amount_units = nullif\(\$6, ''\)::numeric/i);
  assert.match(submitSql, /relay_body = \$8::jsonb/i);
  assert.match(submitSql, /tx_hash = \$8/i);
  assert.match(submitSql, /status in \('pending', 'submitted'\)/i);
});

test("submitted market bet recovery loads only tx-submitted checkpoints", async () => {
  const db = new RecordingDb();

  await getSubmittedMarketBetRecovery(db, {
    userId: "user-1",
    betId: "bet-1",
  });

  const query = db.queries.at(-1)?.text ?? "";
  assert.match(query, /from market_bets/i);
  assert.match(query, /status = 'submitted'/i);
  assert.match(query, /tx_hash is not null/i);
  assert.match(query, /user_id = \$1/i);
  assert.match(query, /id = \$2/i);
});

test("market bet cancellation releases tx-less pending bet notes", async () => {
  const db = new RecordingDb();

  await cancelPendingMarketBet(db, {
    userId: "user-1",
    betId: "bet-1",
  });

  const combinedSql = db.queries.map((query) => query.text).join("\n");
  assert.match(combinedSql, /update market_bets/i);
  assert.match(combinedSql, /status = 'cancelled'/i);
  assert.match(combinedSql, /and status = 'pending'/i);
  assert.match(combinedSql, /and tx_hash is null/i);
  assert.match(combinedSql, /update market_user_notes/i);
  assert.match(combinedSql, /status = 'unspent'/i);
  assert.match(combinedSql, /status = 'pending_bet'/i);
});

test("market deposits only create notes for active deployed market pools", async () => {
  const db = new RecordingDb();

  await createMarketDepositNote(db, {
    userId: "user-1",
    poolId: "veil_market_pool_v1",
    commitmentHex: "0xabc",
    encryptedNoteCiphertext: "{\"version\":1}",
    amountUnits: "100",
    leafIndex: 12,
    txHash: "tx-deposit",
  });

  const depositSql = db.queries.at(-1)?.text ?? "";
  assert.match(depositSql, /insert into market_user_notes/i);
  assert.match(depositSql, /from market_pools p/i);
  assert.match(depositSql, /p\.status = 'active'/i);
  assert.match(depositSql, /p\.contract_id is not null/i);
  assert.match(depositSql, /'market_deposit'/i);
});

test("market payout claim only converts a confirmed committed payout into a spendable market note", async () => {
  const db = new RecordingDb();

  await claimMarketPayoutNote(db, {
    userId: "user-1",
    payoutId: "payout-1",
    commitmentHex: "0xpayout",
    encryptedNoteCiphertext: "{\"version\":1}",
  });

  const claimSql = db.queries.at(-1)?.text ?? "";
  assert.match(claimSql, /with claimable_payout as/i);
  assert.match(claimSql, /from market_payouts p/i);
  assert.match(claimSql, /p\.user_id = \$1/i);
  assert.match(claimSql, /p\.status = 'confirmed'/i);
  assert.match(claimSql, /p\.payout_commitment_hex = \$3/i);
  assert.match(claimSql, /p\.leaf_index is not null/i);
  assert.match(claimSql, /p\.tx_hash is not null/i);
  assert.match(claimSql, /update market_payouts/i);
  assert.match(claimSql, /status = 'claimed'/i);
  assert.match(claimSql, /insert into market_user_notes/i);
  assert.match(claimSql, /'unspent'/i);
  assert.match(claimSql, /'payout'/i);
  assert.match(claimSql, /on conflict \(user_id, pool_id, commitment_hex\) do update/i);
});
