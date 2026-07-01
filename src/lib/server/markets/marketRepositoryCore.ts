import { computeMarketOdds, computeSettlementPayouts } from "./marketMath";
import type {
  MarketBetStatus,
  MarketOutcome,
  MarketSeed,
  MarketStatus,
} from "./marketTypes";

export interface QueryResult<Row> {
  rows: Row[];
  rowCount?: number | null;
}

export interface QueryClient {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
}

export interface MarketPoolRow {
  id: string;
  pool_id: string;
  contract_id: string | null;
  tree_depth: number;
  deployment_ledger: number;
  status: "planned" | "deploying" | "active" | "paused" | "retired";
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface PredictionMarketRow {
  id: string;
  pool_id: string;
  slug: string;
  title: string;
  category: string;
  status: MarketStatus;
  closes_at: Date;
  resolves_at: Date | null;
  rules: string;
  resolution_source: string;
  icon_name: string;
  display_order: number;
  yes_total_units: string;
  no_total_units: string;
  winning_outcome: MarketOutcome | null;
  demo_only: boolean;
  pool_status?: MarketPoolRow["status"];
  contract_id?: string | null;
  tree_depth?: number;
  deployment_ledger?: number;
  created_at: Date;
  updated_at: Date;
}

export interface MarketUserNoteRow {
  id: string;
  user_id: string;
  pool_id: string;
  commitment_hex: string;
  encrypted_note_ciphertext: string;
  asset_code: string;
  amount_units: string;
  leaf_index: number | null;
  status:
    | "pending_deposit"
    | "unspent"
    | "pending_bet"
    | "escrowed"
    | "spent"
    | "payout_pending"
    | "payout_received"
    | "failed_recovery";
  source: "market_deposit" | "change" | "payout" | "refund";
  tx_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MarketBetRow {
  id: string;
  user_id: string;
  market_id: string;
  market_slug: string;
  pool_id: string;
  note_id: string | null;
  idempotency_key: string;
  outcome: MarketOutcome;
  amount_units: string;
  status: MarketBetStatus;
  input_commitment_hex: string | null;
  escrow_commitment_hex: string | null;
  escrow_encrypted_note_ciphertext: string | null;
  change_commitment_hex: string | null;
  change_amount_units: string | null;
  encrypted_change_note_ciphertext: string | null;
  relay_body: Record<string, unknown> | null;
  tx_hash: string | null;
  confirmed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface MarketResolutionRow {
  id: string;
  market_id: string;
  outcome: MarketOutcome;
  resolver_email: string;
  evidence_text: string | null;
  evidence_url: string | null;
  resolved_at: Date;
  created_at: Date;
}

export interface MarketPayoutRow {
  id: string;
  market_id: string;
  user_id: string;
  amount_units: string;
  status: "pending" | "submitted" | "confirmed" | "failed" | "claimed";
  payout_commitment_hex: string | null;
  encrypted_note_ciphertext: string | null;
  leaf_index: number | null;
  tx_hash: string | null;
  source_escrow_note_id: string | null;
  change_commitment_hex: string | null;
  encrypted_change_note_ciphertext: string | null;
  change_amount_units: string | null;
  change_leaf_index: number | null;
  relay_body: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface AdminMarketPayoutRow extends MarketPayoutRow {
  user_email: string | null;
}

export interface MarketEscrowNoteRow {
  id: string;
  market_id: string;
  bet_id: string | null;
  pool_id: string;
  outcome: MarketOutcome | "POOL";
  commitment_hex: string;
  amount_units: string;
  leaf_index: number | null;
  encrypted_note_ciphertext: string | null;
  status: "escrowed" | "spent" | "refunded" | "settled";
  source: "bet" | "rollup" | "payout_change" | "consolidation_change";
  tx_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MarketEscrowConsolidationPairRow extends MarketEscrowNoteRow {
  contract_id: string;
  deployment_ledger: number;
}

export interface MarketEscrowTransferRow {
  id: string;
  market_id: string;
  payout_id: string | null;
  operation_type: "consolidation" | "payout";
  status: "submitted" | "confirmed" | "failed";
  source_escrow_note_ids: string[];
  output_commitment_hex: string | null;
  output_amount_units: string | null;
  output_encrypted_note_ciphertext: string | null;
  output_leaf_index: number | null;
  change_commitment_hex: string | null;
  change_amount_units: string | null;
  change_leaf_index: number | null;
  relay_body: Record<string, unknown> | null;
  tx_hash: string | null;
  error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SubmittedMarketEscrowConsolidationRow extends MarketEscrowTransferRow {
  pool_id: string;
  contract_id: string;
  deployment_ledger: number;
}

export interface ExecutableMarketPayoutRow extends MarketPayoutRow {
  user_email: string | null;
  pool_id: string;
  contract_id: string;
  deployment_ledger: number;
  recipient_bn254_public_hex: string;
  recipient_x25519_public_hex: string;
  source_escrow_note_id: string;
  source_bet_id: string | null;
  source_outcome: MarketOutcome | "POOL";
  source_source: MarketEscrowNoteRow["source"];
  source_commitment_hex: string;
  source_amount_units: string;
  source_leaf_index: number;
  source_encrypted_note_ciphertext: string;
}

export interface MarketSettlementJobRow {
  id: string;
  market_id: string;
  status: "queued" | "running" | "blocked" | "completed" | "failed";
  winning_outcome: MarketOutcome;
  total_pool_units: string;
  winning_pool_units: string;
  paid_units: string;
  rounding_dust_units: string;
  error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MarketActivityEventRow {
  id: string;
  user_id: string | null;
  market_id: string | null;
  bet_id: string | null;
  payout_id: string | null;
  event_type: string;
  event_data: Record<string, unknown>;
  tx_hash: string | null;
  created_at: Date;
}

export interface MarketPortfolio {
  notes: MarketUserNoteRow[];
  bets: MarketBetRow[];
  payouts: MarketPayoutRow[];
}

export interface MarketPayoutClaimResult {
  payout: MarketPayoutRow;
  note: MarketUserNoteRow;
}

function assertPositiveUnits(value: string, label: string) {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be a positive integer unit value`);
  }
}

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function ensureMarketPool(db: QueryClient, input: {
  poolId: string;
  contractId?: string | null;
  treeDepth?: number;
  deploymentLedger?: number;
  status?: MarketPoolRow["status"];
  metadata?: Record<string, unknown>;
}) {
  const result = await db.query<MarketPoolRow>(
    `insert into market_pools (
       pool_id, contract_id, tree_depth, deployment_ledger, status, metadata
     ) values ($1, $2, $3, $4, $5, $6::jsonb)
     on conflict (pool_id) do update set
       contract_id = excluded.contract_id,
       tree_depth = excluded.tree_depth,
       deployment_ledger = excluded.deployment_ledger,
       status = excluded.status,
       metadata = excluded.metadata,
       updated_at = now()
     returning *`,
    [
      input.poolId,
      input.contractId ?? null,
      input.treeDepth ?? 15,
      input.deploymentLedger ?? 1,
      input.status ?? "planned",
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  return result.rows[0] ?? null;
}

export async function upsertMarketSeeds(db: QueryClient, input: {
  poolId: string;
  seeds: MarketSeed[];
}) {
  const rows: PredictionMarketRow[] = [];
  for (const seed of input.seeds) {
    const result = await db.query<PredictionMarketRow>(
      `insert into prediction_markets (
         pool_id, slug, title, category, status, closes_at, resolves_at,
         rules, resolution_source, icon_name, display_order, demo_only
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (slug) do update set
         pool_id = excluded.pool_id,
         title = excluded.title,
         category = excluded.category,
         status = excluded.status,
         closes_at = excluded.closes_at,
         resolves_at = excluded.resolves_at,
         rules = excluded.rules,
         resolution_source = excluded.resolution_source,
         icon_name = excluded.icon_name,
         display_order = excluded.display_order,
         demo_only = excluded.demo_only,
         updated_at = now()
       returning *`,
      [
        input.poolId,
        seed.slug,
        seed.title,
        seed.category,
        seed.status,
        seed.closesAt,
        seed.resolvesAt,
        seed.rules,
        seed.resolutionSource,
        seed.iconName,
        seed.displayOrder,
        seed.demoOnly,
      ],
    );
    if (result.rows[0]) rows.push(result.rows[0]);
  }
  return rows;
}

export async function createPredictionMarketDraft(db: QueryClient, input: {
  poolId: string;
  slug: string;
  title: string;
  category: string;
  closesAt: string;
  resolvesAt?: string | null;
  rules: string;
  resolutionSource: string;
  iconName?: string | null;
  displayOrder?: number | null;
  adminEmail: string;
}) {
  const slug = normalizeText(input.slug);
  const title = normalizeText(input.title);
  const category = normalizeText(input.category);
  const rules = normalizeText(input.rules);
  const resolutionSource = normalizeText(input.resolutionSource);
  if (!slug) throw new Error("slug is required");
  if (!title) throw new Error("title is required");
  if (!category) throw new Error("category is required");
  if (!rules) throw new Error("rules are required");
  if (!resolutionSource) throw new Error("resolutionSource is required");

  const result = await db.query<PredictionMarketRow>(
    `insert into prediction_markets (
       pool_id, slug, title, category, status, closes_at, resolves_at,
       rules, resolution_source, icon_name, display_order, demo_only
     ) values ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, false)
     returning *`,
    [
      input.poolId,
      slug,
      title,
      category,
      input.closesAt,
      normalizeText(input.resolvesAt),
      rules,
      resolutionSource,
      normalizeText(input.iconName) ?? "circle-dot",
      input.displayOrder ?? 100,
    ],
  );
  const market = result.rows[0] ?? null;
  if (!market) return null;

  await db.query<MarketActivityEventRow>(
    `insert into market_activity_events (
       market_id, event_type, event_data
     ) values ($1, 'market_admin_draft_created', $2::jsonb)
     returning *`,
    [
      market.id,
      JSON.stringify({
        adminEmail: input.adminEmail,
        slug,
      }),
    ],
  );

  return market;
}

export async function updatePredictionMarketDraft(db: QueryClient, input: {
  marketId: string;
  title: string;
  category: string;
  closesAt: string;
  resolvesAt?: string | null;
  rules: string;
  resolutionSource: string;
  iconName?: string | null;
  displayOrder?: number | null;
  adminEmail: string;
}) {
  const title = normalizeText(input.title);
  const category = normalizeText(input.category);
  const rules = normalizeText(input.rules);
  const resolutionSource = normalizeText(input.resolutionSource);
  if (!title) throw new Error("title is required");
  if (!category) throw new Error("category is required");
  if (!rules) throw new Error("rules are required");
  if (!resolutionSource) throw new Error("resolutionSource is required");

  const result = await db.query<PredictionMarketRow>(
    `update prediction_markets set
       title = $2,
       category = $3,
       closes_at = $4,
       resolves_at = $5,
       rules = $6,
       resolution_source = $7,
       icon_name = $8,
       display_order = $9,
       updated_at = now()
     where id = $1
       and status = 'draft'
       and demo_only = false
     returning *`,
    [
      input.marketId,
      title,
      category,
      input.closesAt,
      normalizeText(input.resolvesAt),
      rules,
      resolutionSource,
      normalizeText(input.iconName) ?? "circle-dot",
      input.displayOrder ?? 100,
    ],
  );
  const market = result.rows[0] ?? null;
  if (!market) return null;

  await db.query<MarketActivityEventRow>(
    `insert into market_activity_events (
       market_id, event_type, event_data
     ) values ($1, 'market_admin_draft_updated', $2::jsonb)
     returning *`,
    [
      input.marketId,
      JSON.stringify({
        adminEmail: input.adminEmail,
      }),
    ],
  );

  return market;
}

export async function openPredictionMarketDraft(db: QueryClient, input: {
  marketId: string;
  adminEmail: string;
}) {
  const result = await db.query<PredictionMarketRow>(
    `update prediction_markets set
       status = 'open',
       updated_at = now()
     where id = $1
       and status = 'draft'
       and demo_only = false
     returning *`,
    [input.marketId],
  );
  const market = result.rows[0] ?? null;
  if (!market) return null;

  await db.query<MarketActivityEventRow>(
    `insert into market_activity_events (
       market_id, event_type, event_data
     ) values ($1, 'market_admin_opened', $2::jsonb)
     returning *`,
    [
      input.marketId,
      JSON.stringify({
        adminEmail: input.adminEmail,
      }),
    ],
  );

  return market;
}

export async function listMarkets(db: QueryClient, input: {
  includeClosed?: boolean;
  includeDemo?: boolean;
  includeAdminStatuses?: boolean;
} = {}) {
  const allowedStatuses = input.includeAdminStatuses
    ? ["draft", "open", "closed", "resolved", "cancelled", "settling", "settled"]
    : input.includeClosed
    ? ["open", "closed", "resolved", "settling", "settled"]
    : ["open"];
  const result = await db.query<PredictionMarketRow>(
    `select
       m.*,
       p.status as pool_status,
       p.contract_id,
       p.tree_depth,
       p.deployment_ledger
     from prediction_markets m
     join market_pools p on p.pool_id = m.pool_id
     where m.status = any($1::text[])
       and ($2::boolean or m.demo_only = false)
     order by m.display_order asc, m.closes_at asc`,
    [allowedStatuses, input.includeDemo === true],
  );
  return result.rows;
}

export async function getMarketBySlug(db: QueryClient, input: { slug: string; includeDemo?: boolean }) {
  const result = await db.query<PredictionMarketRow>(
    `select
       m.*,
       p.status as pool_status,
       p.contract_id,
       p.tree_depth,
       p.deployment_ledger
     from prediction_markets m
     join market_pools p on p.pool_id = m.pool_id
     where m.slug = $1
       and ($2::boolean or m.demo_only = false)
     limit 1`,
    [input.slug, input.includeDemo === true],
  );
  return result.rows[0] ?? null;
}

export async function listUserMarketPortfolio(db: QueryClient, input: { userId: string }): Promise<MarketPortfolio> {
  const [notes, bets, payouts] = await Promise.all([
    db.query<MarketUserNoteRow>(
      `select *
       from market_user_notes
       where user_id = $1
       order by created_at desc
       limit 100`,
      [input.userId],
    ),
    db.query<MarketBetRow>(
      `select *
       from market_bets
       where user_id = $1
       order by created_at desc
       limit 100`,
      [input.userId],
    ),
    db.query<MarketPayoutRow>(
      `select *
       from market_payouts
       where user_id = $1
       order by created_at desc
       limit 100`,
      [input.userId],
    ),
  ]);
  return { notes: notes.rows, bets: bets.rows, payouts: payouts.rows };
}

export async function upsertMarketUserNote(db: QueryClient, input: {
  userId: string;
  poolId: string;
  commitmentHex: string;
  encryptedNoteCiphertext: string;
  amountUnits: string;
  assetCode?: string;
  leafIndex?: number | null;
  status: MarketUserNoteRow["status"];
  source: MarketUserNoteRow["source"];
  txHash?: string | null;
}) {
  assertPositiveUnits(input.amountUnits, "amountUnits");
  const result = await db.query<MarketUserNoteRow>(
    `insert into market_user_notes (
       user_id, pool_id, commitment_hex, encrypted_note_ciphertext, asset_code,
       amount_units, leaf_index, status, source, tx_hash
     ) values ($1, $2, $3, $4, $5, $6::numeric, $7, $8, $9, $10)
     on conflict (user_id, pool_id, commitment_hex) do update set
       encrypted_note_ciphertext = excluded.encrypted_note_ciphertext,
       amount_units = excluded.amount_units,
       leaf_index = excluded.leaf_index,
       status = excluded.status,
       source = excluded.source,
       tx_hash = excluded.tx_hash,
       updated_at = now()
     returning *`,
    [
      input.userId,
      input.poolId,
      input.commitmentHex,
      input.encryptedNoteCiphertext,
      input.assetCode ?? "USDC",
      input.amountUnits,
      input.leafIndex ?? null,
      input.status,
      input.source,
      input.txHash ?? null,
    ],
  );
  return result.rows[0] ?? null;
}

export async function createMarketDepositNote(db: QueryClient, input: {
  userId: string;
  poolId: string;
  commitmentHex: string;
  encryptedNoteCiphertext: string;
  amountUnits: string;
  leafIndex?: number | null;
  txHash?: string | null;
  status?: "pending_deposit" | "unspent";
}) {
  assertPositiveUnits(input.amountUnits, "amountUnits");
  const status = input.status ?? (input.leafIndex === null || input.leafIndex === undefined ? "pending_deposit" : "unspent");
  if (status === "unspent" && (input.leafIndex === null || input.leafIndex === undefined || !input.txHash)) {
    throw new Error("A confirmed market deposit requires leafIndex and txHash");
  }
  const result = await db.query<MarketUserNoteRow>(
    `insert into market_user_notes (
       user_id, pool_id, commitment_hex, encrypted_note_ciphertext, asset_code,
       amount_units, leaf_index, status, source, tx_hash
     )
     select
       $1, p.pool_id, $3, $4, 'USDC',
       $5::numeric, $6, $8, 'market_deposit', $7
     from market_pools p
     where p.pool_id = $2
       and p.status = 'active'
       and p.contract_id is not null
     on conflict (user_id, pool_id, commitment_hex) do update set
       encrypted_note_ciphertext = excluded.encrypted_note_ciphertext,
       amount_units = excluded.amount_units,
       leaf_index = excluded.leaf_index,
       status = excluded.status,
       source = 'market_deposit',
       tx_hash = excluded.tx_hash,
       updated_at = now()
     returning *`,
    [
      input.userId,
      input.poolId,
      input.commitmentHex,
      input.encryptedNoteCiphertext,
      input.amountUnits,
      input.leafIndex ?? null,
      input.txHash ?? null,
      status,
    ],
  );
  return result.rows[0] ?? null;
}

export async function createMarketBetIntent(db: QueryClient, input: {
  userId: string;
  marketSlug: string;
  outcome: MarketOutcome;
  amountUnits: string;
  idempotencyKey: string;
  noteId?: string | null;
  inputCommitmentHex?: string | null;
}) {
  assertPositiveUnits(input.amountUnits, "amountUnits");
  if (!normalizeText(input.noteId) || !normalizeText(input.inputCommitmentHex)) {
    throw new Error("A spendable market note is required before placing a bet");
  }
  const result = await db.query<MarketBetRow>(
    `with existing_bet as (
       select *
       from market_bets
       where user_id = $1
         and idempotency_key = $2
     ),
     locked_note as (
       update market_user_notes n set
         status = 'pending_bet',
         updated_at = now()
       from prediction_markets m
       join market_user_notes candidate on candidate.id = $5::uuid
       where n.id = candidate.id
         and n.user_id = $1
         and n.pool_id = m.pool_id
         and n.status = 'unspent'
         and n.commitment_hex = $6
         and n.amount_units >= $4::numeric
         and m.slug = $7
         and m.status = 'open'
         and m.closes_at > now()
         and not exists (select 1 from existing_bet)
       returning n.id, n.commitment_hex, n.pool_id, m.id as market_id, m.slug as market_slug
     ),
     inserted_bet as (
       insert into market_bets (
         user_id, market_id, market_slug, pool_id, note_id, idempotency_key,
         outcome, amount_units, status, input_commitment_hex
       )
       select
         $1, locked_note.market_id, locked_note.market_slug, locked_note.pool_id, locked_note.id, $2,
         $3, $4::numeric, 'pending', locked_note.commitment_hex
       from locked_note
       on conflict (user_id, idempotency_key) do update set
         updated_at = market_bets.updated_at
       returning *
     )
     select * from inserted_bet
     union all
     select * from existing_bet
     limit 1`,
    [
      input.userId,
      input.idempotencyKey,
      input.outcome,
      input.amountUnits,
      input.noteId ?? "",
      input.inputCommitmentHex ?? "",
      input.marketSlug,
    ],
  );
  return result.rows[0] ?? null;
}

export async function markMarketBetSubmitted(db: QueryClient, input: {
  userId: string;
  betId: string;
  escrowCommitmentHex: string;
  escrowEncryptedNoteCiphertext: string;
  changeCommitmentHex?: string | null;
  changeAmountUnits?: string | null;
  encryptedChangeNoteCiphertext?: string | null;
  txHash: string;
}) {
  const result = await db.query<MarketBetRow>(
    `update market_bets set
       status = 'submitted',
       escrow_commitment_hex = $3,
       change_commitment_hex = nullif($4, ''),
       escrow_encrypted_note_ciphertext = nullif($5, ''),
       change_amount_units = nullif($6, '')::numeric,
       encrypted_change_note_ciphertext = nullif($7, ''),
       tx_hash = $8,
       updated_at = now()
     where user_id = $1
       and id = $2
       and status in ('pending', 'submitted')
       and (status <> 'submitted' or tx_hash is null or tx_hash = $8)
     returning *`,
    [
      input.userId,
      input.betId,
      input.escrowCommitmentHex,
      input.changeCommitmentHex ?? "",
      input.escrowEncryptedNoteCiphertext,
      input.changeAmountUnits ?? "",
      input.encryptedChangeNoteCiphertext ?? "",
      input.txHash,
    ],
  );
  return result.rows[0] ?? null;
}

export async function markMarketBetPrepared(db: QueryClient, input: {
  userId: string;
  betId: string;
  escrowCommitmentHex: string;
  escrowEncryptedNoteCiphertext: string;
  changeCommitmentHex?: string | null;
  changeAmountUnits?: string | null;
  encryptedChangeNoteCiphertext?: string | null;
  relayBody: Record<string, unknown>;
}) {
  const result = await db.query<MarketBetRow>(
    `update market_bets set
       status = 'submitted',
       escrow_commitment_hex = $3,
       change_commitment_hex = nullif($4, ''),
       escrow_encrypted_note_ciphertext = nullif($5, ''),
       change_amount_units = nullif($6, '')::numeric,
       encrypted_change_note_ciphertext = nullif($7, ''),
       relay_body = $8::jsonb,
       updated_at = now()
     where user_id = $1
       and id = $2
       and status in ('pending', 'submitted')
       and tx_hash is null
     returning *`,
    [
      input.userId,
      input.betId,
      input.escrowCommitmentHex,
      input.changeCommitmentHex ?? "",
      input.escrowEncryptedNoteCiphertext,
      input.changeAmountUnits ?? "",
      input.encryptedChangeNoteCiphertext ?? "",
      JSON.stringify(input.relayBody),
    ],
  );
  return result.rows[0] ?? null;
}

export async function getSubmittedMarketBetRecovery(db: QueryClient, input: {
  userId: string;
  betId: string;
}) {
  const result = await db.query<MarketBetRow>(
    `select *
       from market_bets
      where user_id = $1
        and id = $2
        and status = 'submitted'
        and tx_hash is not null
      limit 1`,
    [input.userId, input.betId],
  );
  return result.rows[0] ?? null;
}

export async function cancelPendingMarketBet(db: QueryClient, input: {
  userId: string;
  betId: string;
}) {
  const result = await db.query<MarketBetRow>(
    `with cancelled_bet as (
       update market_bets set
         status = 'cancelled',
         updated_at = now()
       where user_id = $1
         and id = $2
         and status = 'pending'
         and tx_hash is null
       returning *
     ),
     released_note as (
       update market_user_notes n set
         status = 'unspent',
         updated_at = now()
       from cancelled_bet b
       where n.user_id = $1
         and n.id = b.note_id
         and n.status = 'pending_bet'
       returning n.id
     )
     select * from cancelled_bet`,
    [input.userId, input.betId],
  );
  return result.rows[0] ?? null;
}

export async function confirmMarketBet(db: QueryClient, input: {
  userId: string;
  betId: string;
  escrowCommitmentHex: string;
  escrowEncryptedNoteCiphertext?: string | null;
  escrowLeafIndex?: number | null;
  changeCommitmentHex?: string | null;
  changeAmountUnits?: string | null;
  changeLeafIndex?: number | null;
  encryptedChangeNoteCiphertext?: string | null;
  txHash: string;
}) {
  const changeAmountUnits = normalizeText(input.changeAmountUnits);
  const hasChangeNote = Boolean(
    normalizeText(input.changeCommitmentHex) &&
      changeAmountUnits &&
      BigInt(changeAmountUnits) > BigInt(0),
  );
  if (hasChangeNote) {
    assertPositiveUnits(changeAmountUnits ?? "", "changeAmountUnits");
    if (!normalizeText(input.encryptedChangeNoteCiphertext)) {
      throw new Error("encryptedChangeNoteCiphertext is required for market bet change notes");
    }
    if (input.changeLeafIndex === null || input.changeLeafIndex === undefined) {
      throw new Error("changeLeafIndex is required for market bet change notes");
    }
  }

  const result = await db.query<MarketBetRow>(
    `update market_bets set
       status = 'confirmed',
       escrow_commitment_hex = $3,
       change_commitment_hex = nullif($4, ''),
       tx_hash = $5,
       confirmed_at = now(),
       updated_at = now()
     where user_id = $1
       and id = $2
       and status in ('pending', 'submitted')
     returning *`,
    [
      input.userId,
      input.betId,
      input.escrowCommitmentHex,
      input.changeCommitmentHex ?? "",
      input.txHash,
    ],
  );
  const bet = result.rows[0] ?? null;
  if (!bet) return null;

  await db.query<PredictionMarketRow>(
    `update prediction_markets set
       yes_total_units = yes_total_units + case when $2 = 'YES' then $3::numeric else 0 end,
       no_total_units = no_total_units + case when $2 = 'NO' then $3::numeric else 0 end,
       updated_at = now()
     where id = $1
     returning *`,
    [bet.market_id, bet.outcome, String(bet.amount_units)],
  );

  await db.query<MarketUserNoteRow>(
    `update market_user_notes set
       status = 'escrowed',
       updated_at = now()
     where user_id = $1
       and id = $2::uuid
       and status = 'pending_bet'
     returning *`,
    [bet.user_id, bet.note_id],
  );

  await db.query(
    `insert into market_escrow_notes (
       market_id, bet_id, pool_id, outcome, commitment_hex, amount_units,
       leaf_index, encrypted_note_ciphertext, status, tx_hash
     ) values ($1, $2, $3, $4, $5, $6::numeric, $7, $8, 'escrowed', $9)
     on conflict (pool_id, commitment_hex) do update set
       leaf_index = excluded.leaf_index,
       encrypted_note_ciphertext = excluded.encrypted_note_ciphertext,
       status = 'escrowed',
       tx_hash = excluded.tx_hash,
       updated_at = now()`,
    [
      bet.market_id,
      bet.id,
      bet.pool_id,
      bet.outcome,
      input.escrowCommitmentHex,
      String(bet.amount_units),
      input.escrowLeafIndex ?? null,
      normalizeText(input.escrowEncryptedNoteCiphertext),
      input.txHash,
    ],
  );

  if (hasChangeNote) {
    await db.query<MarketUserNoteRow>(
      `insert into market_user_notes (
         user_id, pool_id, commitment_hex, encrypted_note_ciphertext, asset_code,
         amount_units, leaf_index, status, source, tx_hash
       ) values ($1, $2, $3, $4, 'USDC', $5::numeric, $6, 'unspent', 'change', $7)
       on conflict (user_id, pool_id, commitment_hex) do update set
         encrypted_note_ciphertext = excluded.encrypted_note_ciphertext,
         amount_units = excluded.amount_units,
         leaf_index = excluded.leaf_index,
         status = 'unspent',
         source = 'change',
         tx_hash = excluded.tx_hash,
         updated_at = now()
       returning *`,
      [
        bet.user_id,
        bet.pool_id,
        input.changeCommitmentHex,
        input.encryptedChangeNoteCiphertext,
        changeAmountUnits,
        input.changeLeafIndex,
        input.txHash,
      ],
    );
  }

  return bet;
}

export async function recordMarketActivity(db: QueryClient, input: {
  userId?: string | null;
  marketId?: string | null;
  betId?: string | null;
  payoutId?: string | null;
  eventType: string;
  eventData?: Record<string, unknown>;
  txHash?: string | null;
}) {
  const result = await db.query<MarketActivityEventRow>(
    `insert into market_activity_events (
       user_id, market_id, bet_id, payout_id, event_type, event_data, tx_hash
     ) values ($1, $2, $3, $4, $5, $6::jsonb, $7)
     returning *`,
    [
      input.userId ?? null,
      input.marketId ?? null,
      input.betId ?? null,
      input.payoutId ?? null,
      input.eventType,
      JSON.stringify(input.eventData ?? {}),
      input.txHash ?? null,
    ],
  );
  return result.rows[0] ?? null;
}

export async function resolveMarketAndCreateSettlement(db: QueryClient, input: {
  marketId: string;
  winningOutcome: MarketOutcome;
  resolverEmail: string;
  evidenceText?: string | null;
  evidenceUrl?: string | null;
}) {
  const bets = await db.query<MarketBetRow>(
    `select *
     from market_bets
     where market_id = $1
       and status = 'confirmed'
     order by confirmed_at asc, created_at asc`,
    [input.marketId],
  );
  const settlement = computeSettlementPayouts({
    winningOutcome: input.winningOutcome,
    bets: bets.rows.map((bet) => ({
      userId: bet.user_id,
      outcome: bet.outcome,
      amountUnits: String(bet.amount_units),
    })),
  });

  const resolution = await db.query<MarketResolutionRow>(
    `insert into market_resolutions (
       market_id, outcome, resolver_email, evidence_text, evidence_url
     ) values ($1, $2, $3, $4, $5)
     returning *`,
    [
      input.marketId,
      input.winningOutcome,
      input.resolverEmail,
      normalizeText(input.evidenceText),
      normalizeText(input.evidenceUrl),
    ],
  );

  await db.query<PredictionMarketRow>(
    `update prediction_markets set
       status = 'settling',
       winning_outcome = $2,
       updated_at = now()
     where id = $1
     returning *`,
    [input.marketId, input.winningOutcome],
  );

  const settlementJob = await db.query<MarketSettlementJobRow>(
    `insert into market_settlement_jobs (
       market_id, status, winning_outcome, total_pool_units,
       winning_pool_units, paid_units, rounding_dust_units
     ) values ($1, 'queued', $2, $3::numeric, $4::numeric, $5::numeric, $6::numeric)
     returning *`,
    [
      input.marketId,
      input.winningOutcome,
      settlement.totalPoolUnits,
      settlement.winningPoolUnits,
      settlement.paidUnits,
      settlement.roundingDustUnits,
    ],
  );

  const payouts: MarketPayoutRow[] = [];
  for (const payout of settlement.payouts) {
    const inserted = await db.query<MarketPayoutRow>(
      `insert into market_payouts (
         market_id, user_id, amount_units, status
       ) values ($1, $2, $3::numeric, 'pending')
       on conflict (market_id, user_id) do update set
         amount_units = excluded.amount_units,
         status = 'pending',
         updated_at = now()
       returning *`,
      [input.marketId, payout.userId, payout.amountUnits],
    );
    if (inserted.rows[0]) payouts.push(inserted.rows[0]);
  }

  return {
    resolution: resolution.rows[0] ?? null,
    settlementJob: settlementJob.rows[0] ?? null,
    payouts,
    settlement,
  };
}

export async function getMarketEscrowConsolidationPair(db: QueryClient, input: {
  marketId: string;
}) {
  const result = await db.query<MarketEscrowConsolidationPairRow>(
    `select
       e.*,
       pool.contract_id as contract_id,
       pool.deployment_ledger as deployment_ledger
     from market_escrow_notes e
     join prediction_markets m on m.id = e.market_id
     join market_pools pool on pool.pool_id = e.pool_id
     where e.market_id = $1
       and e.pool_id = m.pool_id
       and e.status = 'escrowed'
       and e.amount_units > 0
       and e.leaf_index is not null
       and e.encrypted_note_ciphertext is not null
       and pool.status = 'active'
       and pool.contract_id is not null
     order by e.amount_units asc, e.created_at asc
     limit 2`,
    [input.marketId],
  );

  return result.rows.length === 2 ? result.rows : [];
}

export async function markMarketEscrowConsolidationPrepared(db: QueryClient, input: {
  marketId: string;
  adminEmail: string;
  sourceEscrowNoteIds: string[];
  rollupCommitmentHex: string;
  encryptedRollupNoteCiphertext: string;
  rollupAmountUnits: string;
  relayBody: Record<string, unknown>;
}) {
  const sourceEscrowNoteIds = input.sourceEscrowNoteIds.filter((id) => normalizeText(id));
  if (sourceEscrowNoteIds.length !== 2) {
    throw new Error("exactly two source escrow notes are required for consolidation");
  }
  const rollupCommitmentHex = normalizeText(input.rollupCommitmentHex);
  const encryptedRollupNoteCiphertext = normalizeText(input.encryptedRollupNoteCiphertext);
  const rollupAmountUnits = normalizeText(input.rollupAmountUnits);
  if (!rollupCommitmentHex) throw new Error("rollupCommitmentHex is required");
  if (!encryptedRollupNoteCiphertext) throw new Error("encryptedRollupNoteCiphertext is required");
  if (!rollupAmountUnits) throw new Error("rollupAmountUnits is required");
  assertPositiveUnits(rollupAmountUnits, "rollupAmountUnits");

  const prepared = await db.query<MarketEscrowTransferRow>(
    `with source_notes as (
       update market_escrow_notes set
         status = 'spent',
         updated_at = now()
       where market_id = $1
         and id = any($2::uuid[])
         and status in ('escrowed', 'spent')
         and (status = 'escrowed' or tx_hash is null)
       returning *
     ),
     source_summary as (
       select count(*) as source_count
       from source_notes
     ),
     prepared_transfer as (
       insert into market_escrow_transfers (
         market_id, operation_type, status, source_escrow_note_ids,
         output_commitment_hex, output_amount_units, output_encrypted_note_ciphertext,
         relay_body
       )
       select
         $1, 'consolidation', 'submitted', $2::uuid[],
         $3, $4::numeric, $5, $6::jsonb
       from source_summary
       where source_summary.source_count = cardinality($2::uuid[])
       returning *
     )
     select * from prepared_transfer`,
    [
      input.marketId,
      sourceEscrowNoteIds,
      rollupCommitmentHex,
      rollupAmountUnits,
      encryptedRollupNoteCiphertext,
      JSON.stringify(input.relayBody),
    ],
  );

  const transfer = prepared.rows[0] ?? null;
  if (transfer) {
    await db.query<MarketActivityEventRow>(
      `insert into market_activity_events (
         market_id, event_type, event_data
       ) values ($1, 'market_escrow_consolidation_prepared', $2::jsonb)
       returning *`,
      [
        input.marketId,
        JSON.stringify({
          adminEmail: input.adminEmail,
          sourceEscrowNoteIds,
          rollupCommitmentHex,
          rollupAmountUnits,
        }),
      ],
    );
  }

  return transfer;
}

export async function markMarketEscrowConsolidationSubmitted(db: QueryClient, input: {
  marketId: string;
  adminEmail: string;
  sourceEscrowNoteIds: string[];
  rollupCommitmentHex: string;
  encryptedRollupNoteCiphertext: string;
  rollupAmountUnits: string;
  txHash: string;
}) {
  const sourceEscrowNoteIds = input.sourceEscrowNoteIds.filter((id) => normalizeText(id));
  if (sourceEscrowNoteIds.length !== 2) {
    throw new Error("exactly two source escrow notes are required for consolidation");
  }
  const rollupCommitmentHex = normalizeText(input.rollupCommitmentHex);
  const encryptedRollupNoteCiphertext = normalizeText(input.encryptedRollupNoteCiphertext);
  const rollupAmountUnits = normalizeText(input.rollupAmountUnits);
  const txHash = normalizeText(input.txHash);
  if (!rollupCommitmentHex) throw new Error("rollupCommitmentHex is required");
  if (!encryptedRollupNoteCiphertext) throw new Error("encryptedRollupNoteCiphertext is required");
  if (!rollupAmountUnits) throw new Error("rollupAmountUnits is required");
  assertPositiveUnits(rollupAmountUnits, "rollupAmountUnits");
  if (!txHash) throw new Error("txHash is required to submit market escrow consolidation");

  const submitted = await db.query<MarketEscrowTransferRow>(
    `with source_notes as (
       update market_escrow_notes set
         status = 'spent',
         tx_hash = $6,
         updated_at = now()
       where market_id = $1
         and id = any($2::uuid[])
         and status in ('escrowed', 'spent')
        and (
          status = 'escrowed'
          or tx_hash = $6
          or tx_hash is null
          or exists (
            select 1
            from market_escrow_transfers prepared_transfer
            where prepared_transfer.market_id = $1
              and prepared_transfer.operation_type = 'consolidation'
              and prepared_transfer.status = 'submitted'
              and prepared_transfer.tx_hash is null
              and prepared_transfer.source_escrow_note_ids = $2::uuid[]
              and prepared_transfer.output_commitment_hex = $3
              and prepared_transfer.output_amount_units = $4::numeric
              and prepared_transfer.output_encrypted_note_ciphertext = $5
              and prepared_transfer.relay_body is not null
          )
        )
       returning *
     ),
     source_summary as (
       select
         count(*) as source_count
       from source_notes
     ),
     existing_transfer as (
       update market_escrow_transfers set
         tx_hash = $6,
         error = null,
         updated_at = now()
       where market_id = $1
         and operation_type = 'consolidation'
         and status = 'submitted'
         and tx_hash is null
         and source_escrow_note_ids = $2::uuid[]
       returning *
     ),
     inserted_transfer as (
       insert into market_escrow_transfers (
         market_id, operation_type, status, source_escrow_note_ids,
         output_commitment_hex, output_amount_units, output_encrypted_note_ciphertext, tx_hash
       )
       select
         $1, 'consolidation', 'submitted', $2::uuid[],
         $3, $4::numeric, $5, $6
       from source_summary
       where source_summary.source_count = cardinality($2::uuid[])
         and not exists (select 1 from existing_transfer)
       returning *
     )
     select * from existing_transfer
     union all
     select * from inserted_transfer`,
    [
      input.marketId,
      sourceEscrowNoteIds,
      rollupCommitmentHex,
      rollupAmountUnits,
      encryptedRollupNoteCiphertext,
      txHash,
    ],
  );

  const transfer = submitted.rows[0] ?? null;
  if (transfer) {
    await db.query<MarketActivityEventRow>(
      `insert into market_activity_events (
         market_id, event_type, event_data, tx_hash
       ) values ($1, 'market_escrow_consolidation_submitted', $2::jsonb, $3)
       returning *`,
      [
        input.marketId,
        JSON.stringify({
          adminEmail: input.adminEmail,
          sourceEscrowNoteIds,
          rollupCommitmentHex,
          rollupAmountUnits,
        }),
        txHash,
      ],
    );
  }

  return transfer;
}

export async function getSubmittedMarketEscrowConsolidation(db: QueryClient, input: {
  marketId: string;
}) {
  const result = await db.query<SubmittedMarketEscrowConsolidationRow>(
    `select
       transfer.*,
       m.pool_id,
       pool.contract_id as contract_id,
       pool.deployment_ledger as deployment_ledger
     from market_escrow_transfers transfer
     join prediction_markets m on m.id = transfer.market_id
     join market_pools pool on pool.pool_id = m.pool_id
     where transfer.market_id = $1
       and transfer.operation_type = 'consolidation'
       and transfer.status = 'submitted'
       and transfer.output_commitment_hex is not null
       and transfer.output_amount_units is not null
       and transfer.output_encrypted_note_ciphertext is not null
       and (transfer.tx_hash is not null or transfer.relay_body is not null)
       and pool.status = 'active'
       and pool.contract_id is not null
     order by transfer.updated_at asc
     limit 1`,
    [input.marketId],
  );

  return result.rows[0] ?? null;
}

export async function confirmSubmittedMarketEscrowConsolidationTransfer(db: QueryClient, input: {
  marketId: string;
  adminEmail: string;
  transferId: string;
  rollupCommitmentHex: string;
  encryptedRollupNoteCiphertext: string;
  rollupAmountUnits: string;
  rollupLeafIndex: number;
  txHash: string;
}) {
  const rollupCommitmentHex = normalizeText(input.rollupCommitmentHex);
  const encryptedRollupNoteCiphertext = normalizeText(input.encryptedRollupNoteCiphertext);
  const rollupAmountUnits = normalizeText(input.rollupAmountUnits);
  const txHash = normalizeText(input.txHash);
  if (!rollupCommitmentHex) throw new Error("rollupCommitmentHex is required");
  if (!encryptedRollupNoteCiphertext) throw new Error("encryptedRollupNoteCiphertext is required");
  if (!rollupAmountUnits) throw new Error("rollupAmountUnits is required");
  assertPositiveUnits(rollupAmountUnits, "rollupAmountUnits");
  if (!Number.isInteger(input.rollupLeafIndex) || input.rollupLeafIndex < 0) {
    throw new Error("rollupLeafIndex must be a non-negative integer");
  }
  if (!txHash) throw new Error("txHash is required to confirm market escrow consolidation");

  const confirmed = await db.query<{
    transfer: MarketEscrowTransferRow;
    rollup_note: MarketEscrowNoteRow;
  }>(
    `with transfer_row as (
       update market_escrow_transfers set
         status = 'confirmed',
         output_commitment_hex = $3,
         output_amount_units = $4::numeric,
         output_encrypted_note_ciphertext = $5,
         output_leaf_index = $6,
         tx_hash = $7,
         error = null,
         updated_at = now()
       where id = $2::uuid
         and market_id = $1
         and operation_type = 'consolidation'
         and status in ('submitted', 'confirmed')
         and tx_hash = $7
       returning *
     ),
     source_notes as (
       update market_escrow_notes e set
         status = 'spent',
         tx_hash = $7,
         updated_at = now()
       from transfer_row transfer
       where e.market_id = $1
         and e.id = any(transfer.source_escrow_note_ids)
         and e.status in ('escrowed', 'spent')
         and (
           e.status = 'escrowed'
           or e.tx_hash = $7
           or e.tx_hash is null
           or transfer.tx_hash = $7
         )
       returning e.*
     ),
     source_summary as (
       select
         count(*) as source_count,
         min(e.pool_id) as pool_id
       from source_notes e
     ),
     inserted_rollup as (
       insert into market_escrow_notes (
         market_id, bet_id, pool_id, outcome, commitment_hex, amount_units,
         leaf_index, encrypted_note_ciphertext, status, source, tx_hash
       )
       select
         $1, null, source_summary.pool_id, 'POOL', $3, $4::numeric,
         $6, $5, 'escrowed', 'rollup', $7
       from source_summary
       join transfer_row on source_summary.source_count = cardinality(transfer_row.source_escrow_note_ids)
       on conflict (pool_id, commitment_hex) do update set
         amount_units = excluded.amount_units,
         leaf_index = excluded.leaf_index,
         encrypted_note_ciphertext = excluded.encrypted_note_ciphertext,
         status = 'escrowed',
         source = 'rollup',
         tx_hash = excluded.tx_hash,
         updated_at = now()
       returning *
     )
     select
       to_jsonb(transfer_row.*) as transfer,
       to_jsonb(inserted_rollup.*) as rollup_note
     from transfer_row
     join inserted_rollup on true`,
    [
      input.marketId,
      input.transferId,
      rollupCommitmentHex,
      rollupAmountUnits,
      encryptedRollupNoteCiphertext,
      input.rollupLeafIndex,
      txHash,
    ],
  );

  const firstRow = confirmed.rows[0] as
    | { transfer?: MarketEscrowTransferRow; rollup_note?: MarketEscrowNoteRow }
    | undefined;
  const transfer = firstRow?.transfer ?? null;
  const rollupNote = firstRow?.rollup_note ?? null;
  if (transfer && rollupNote) {
    await db.query<MarketActivityEventRow>(
      `insert into market_activity_events (
         market_id, event_type, event_data, tx_hash
       ) values ($1, 'market_escrow_consolidated', $2::jsonb, $3)
       returning *`,
      [
        input.marketId,
        JSON.stringify({
          adminEmail: input.adminEmail,
          sourceEscrowNoteIds: transfer.source_escrow_note_ids,
          rollupCommitmentHex,
          rollupAmountUnits,
          rollupLeafIndex: input.rollupLeafIndex,
        }),
        txHash,
      ],
    );
  }

  return {
    transfer,
    rollupNote,
  };
}

export async function executeMarketEscrowConsolidationTransfer(db: QueryClient, input: {
  marketId: string;
  adminEmail: string;
  sourceEscrowNoteIds: string[];
  rollupCommitmentHex: string;
  encryptedRollupNoteCiphertext: string;
  rollupAmountUnits: string;
  rollupLeafIndex: number;
  txHash: string;
}) {
  const sourceEscrowNoteIds = input.sourceEscrowNoteIds.filter((id) => normalizeText(id));
  if (sourceEscrowNoteIds.length !== 2) {
    throw new Error("exactly two source escrow notes are required for consolidation");
  }
  const rollupCommitmentHex = normalizeText(input.rollupCommitmentHex);
  const encryptedRollupNoteCiphertext = normalizeText(input.encryptedRollupNoteCiphertext);
  const rollupAmountUnits = normalizeText(input.rollupAmountUnits);
  const txHash = normalizeText(input.txHash);
  if (!rollupCommitmentHex) throw new Error("rollupCommitmentHex is required");
  if (!encryptedRollupNoteCiphertext) throw new Error("encryptedRollupNoteCiphertext is required");
  if (!rollupAmountUnits) throw new Error("rollupAmountUnits is required");
  assertPositiveUnits(rollupAmountUnits, "rollupAmountUnits");
  if (!Number.isInteger(input.rollupLeafIndex) || input.rollupLeafIndex < 0) {
    throw new Error("rollupLeafIndex must be a non-negative integer");
  }
  if (!txHash) throw new Error("txHash is required to consolidate market escrow");

  const transfer = await db.query<{ rollup_note: MarketEscrowNoteRow }>(
    `with source_notes as (
       update market_escrow_notes set
         status = 'spent',
         tx_hash = $7,
         updated_at = now()
       where market_id = $1
         and id = any($2::uuid[])
         and status in ('escrowed', 'spent')
        and (
          status = 'escrowed'
          or tx_hash = $7
          or exists (
            select 1
            from market_escrow_transfers submitted_transfer
            where submitted_transfer.market_id = $1
              and submitted_transfer.operation_type = 'consolidation'
              and submitted_transfer.status in ('submitted', 'confirmed')
              and submitted_transfer.tx_hash = $7
              and submitted_transfer.source_escrow_note_ids = $2::uuid[]
          )
        )
       returning *
     ),
     source_summary as (
       select
         count(*) as source_count,
         min(pool_id) as pool_id
       from source_notes
     ),
     inserted_rollup as (
       insert into market_escrow_notes (
         market_id, bet_id, pool_id, outcome, commitment_hex, amount_units,
         leaf_index, encrypted_note_ciphertext, status, source, tx_hash
       )
       select
         $1, null, source_summary.pool_id, 'POOL', $3, $4::numeric,
         $5, $6, 'escrowed', 'rollup', $7
       from source_summary
       where source_summary.source_count = cardinality($2::uuid[])
       on conflict (pool_id, commitment_hex) do update set
         amount_units = excluded.amount_units,
         leaf_index = excluded.leaf_index,
         encrypted_note_ciphertext = excluded.encrypted_note_ciphertext,
         status = 'escrowed',
         source = 'rollup',
         tx_hash = excluded.tx_hash,
         updated_at = now()
       returning *
     ),
     transfer_log as (
       insert into market_escrow_transfers (
         market_id, operation_type, status, source_escrow_note_ids,
         output_commitment_hex, output_amount_units, output_encrypted_note_ciphertext,
         output_leaf_index, tx_hash
       )
       select
         $1, 'consolidation', 'confirmed', $2::uuid[],
         $3, $4::numeric, $6, $5, $7
       from inserted_rollup
       returning *
     )
     select to_jsonb(inserted_rollup.*) as rollup_note
     from inserted_rollup
     join transfer_log on true`,
    [
      input.marketId,
      sourceEscrowNoteIds,
      rollupCommitmentHex,
      rollupAmountUnits,
      input.rollupLeafIndex,
      encryptedRollupNoteCiphertext,
      txHash,
    ],
  );

  const firstRow = transfer.rows[0] as
    | { rollup_note?: MarketEscrowNoteRow | null }
    | MarketEscrowNoteRow
    | undefined;
  const rollupNote = firstRow && "rollup_note" in firstRow
    ? firstRow.rollup_note ?? null
    : (firstRow as MarketEscrowNoteRow | undefined) ?? null;
  if (rollupNote) {
    await db.query<MarketActivityEventRow>(
      `insert into market_activity_events (
         market_id, event_type, event_data, tx_hash
       ) values ($1, 'market_escrow_consolidated', $2::jsonb, $3)
       returning *`,
      [
        input.marketId,
        JSON.stringify({
          adminEmail: input.adminEmail,
          sourceEscrowNoteIds,
          rollupCommitmentHex,
          rollupAmountUnits,
          rollupLeafIndex: input.rollupLeafIndex,
        }),
        txHash,
      ],
    );
  }

  return rollupNote;
}

export async function closeMarketForResolution(db: QueryClient, input: {
  marketId: string;
  adminEmail: string;
}) {
  const result = await db.query<PredictionMarketRow>(
    `update prediction_markets set
       status = 'closed',
       updated_at = now()
     where id = $1
       and status in ('draft', 'open')
     returning *`,
    [input.marketId],
  );
  const market = result.rows[0] ?? null;
  if (!market) return null;

  await db.query<MarketActivityEventRow>(
    `insert into market_activity_events (
       market_id, event_type, event_data
     ) values ($1, 'market_admin_closed', $2::jsonb)
     returning *`,
    [
      input.marketId,
      JSON.stringify({
        adminEmail: input.adminEmail,
        closedFor: "resolution",
      }),
    ],
  );

  return market;
}

export async function cancelMarket(db: QueryClient, input: {
  marketId: string;
  adminEmail: string;
  reason?: string | null;
}) {
  const result = await db.query<PredictionMarketRow>(
    `update prediction_markets set
       status = 'cancelled',
       updated_at = now()
     where id = $1
       and status in ('draft', 'open', 'closed')
     returning *`,
    [input.marketId],
  );
  const market = result.rows[0] ?? null;
  if (!market) return null;

  await db.query<MarketBetRow>(
    `update market_bets set
       status = 'cancelled',
       updated_at = now()
     where market_id = $1
       and status in ('pending', 'submitted', 'confirmed')
     returning *`,
    [input.marketId],
  );

  await db.query<MarketActivityEventRow>(
    `insert into market_activity_events (
       market_id, event_type, event_data
     ) values ($1, 'market_admin_cancelled', $2::jsonb)
     returning *`,
    [
      input.marketId,
      JSON.stringify({
        adminEmail: input.adminEmail,
        reason: normalizeText(input.reason) ?? "Admin cancelled market",
      }),
    ],
  );

  return market;
}

export async function executeMarketPayoutBatch(db: QueryClient, input: {
  marketId: string;
  adminEmail: string;
  payoutIds: string[];
  txHash: string;
}) {
  const payoutIds = input.payoutIds.filter((id) => normalizeText(id));
  if (payoutIds.length === 0) {
    throw new Error("At least one payout id is required");
  }
  const txHash = normalizeText(input.txHash);
  if (!txHash) {
    throw new Error("txHash is required to execute market payouts");
  }

  const payouts = await db.query<MarketPayoutRow>(
    `update market_payouts set
       status = 'confirmed',
       tx_hash = $3,
       updated_at = now()
     where market_id = $1
       and id = any($2::uuid[])
       and status in ('pending', 'submitted')
     returning *`,
    [input.marketId, payoutIds, txHash],
  );

  const settlementJob = await db.query<MarketSettlementJobRow>(
    `update market_settlement_jobs set
       status = case
         when not exists (
           select 1 from market_payouts
           where market_id = $1
             and status in ('pending', 'submitted', 'failed')
         ) then 'completed'
         else status
       end,
       paid_units = (
         select coalesce(sum(amount_units), 0)
         from market_payouts
         where market_id = $1
           and status = 'confirmed'
       ),
       updated_at = now()
     where market_id = $1
       and status in ('queued', 'running', 'blocked')
     returning *`,
    [input.marketId],
  );

  await db.query<PredictionMarketRow>(
    `update prediction_markets set
       status = 'settled',
       updated_at = now()
     where id = $1
       and status in ('settling', 'resolved')
       and not exists (
         select 1 from market_payouts
         where market_id = $1
           and status in ('pending', 'submitted', 'failed')
       )
     returning *`,
    [input.marketId],
  );

  await db.query<MarketActivityEventRow>(
    `insert into market_activity_events (
       market_id, event_type, event_data, tx_hash
     ) values ($1, 'market_payout_batch_executed', $2::jsonb, $3)
     returning *`,
    [
      input.marketId,
      JSON.stringify({
        adminEmail: input.adminEmail,
        payoutIds,
        payoutCount: payouts.rows.length,
      }),
      txHash,
    ],
  );

  return {
    payouts: payouts.rows,
    settlementJob: settlementJob.rows[0] ?? null,
  };
}

export async function getExecutableMarketPayout(db: QueryClient, input: {
  marketId: string;
  payoutIds: string[];
}) {
  const payoutIds = input.payoutIds.filter((id) => normalizeText(id));
  if (payoutIds.length === 0) {
    throw new Error("At least one payout id is required");
  }

  const result = await db.query<ExecutableMarketPayoutRow>(
    `select
       p.*,
       u.email as user_email,
       m.pool_id,
       pool.contract_id as contract_id,
       pool.deployment_ledger,
       recipient_profile.bn254_public_hex as recipient_bn254_public_hex,
       recipient_profile.x25519_public_hex as recipient_x25519_public_hex,
       source.id as source_escrow_note_id,
       source.bet_id as source_bet_id,
       source.outcome as source_outcome,
       source.source as source_source,
       source.commitment_hex as source_commitment_hex,
       source.amount_units as source_amount_units,
       source.leaf_index as source_leaf_index,
       source.encrypted_note_ciphertext as source_encrypted_note_ciphertext
     from market_payouts p
     join prediction_markets m on m.id = p.market_id
     join market_pools pool on pool.pool_id = m.pool_id
     join wallet_profiles recipient_profile on recipient_profile.user_id = p.user_id
     left join users u on u.id = p.user_id
     join lateral (
       select e.*
       from market_escrow_notes e
       where e.market_id = p.market_id
         and e.pool_id = m.pool_id
         and e.status = 'escrowed'
         and e.leaf_index is not null
         and e.encrypted_note_ciphertext is not null
         and e.amount_units >= p.amount_units
       order by e.amount_units asc, e.created_at asc
       limit 1
     ) source on true
     where p.market_id = $1
       and p.id = any($2::uuid[])
       and p.status in ('pending', 'failed')
       and pool.status = 'active'
       and pool.contract_id is not null
       and recipient_profile.bn254_public_hex is not null
       and recipient_profile.x25519_public_hex is not null
     order by p.created_at asc
     limit 1`,
    [input.marketId, payoutIds],
  );

  return result.rows[0] ?? null;
}

export async function getSubmittedMarketPayout(db: QueryClient, input: {
  marketId: string;
  payoutIds: string[];
}) {
  const payoutIds = input.payoutIds.filter((id) => normalizeText(id));
  if (payoutIds.length === 0) {
    throw new Error("At least one payout id is required");
  }

  const result = await db.query<ExecutableMarketPayoutRow>(
    `select
       p.*,
       u.email as user_email,
       m.pool_id,
       pool.contract_id as contract_id,
       pool.deployment_ledger,
       recipient_profile.bn254_public_hex as recipient_bn254_public_hex,
       recipient_profile.x25519_public_hex as recipient_x25519_public_hex,
       source.id as source_escrow_note_id,
       source.bet_id as source_bet_id,
       source.outcome as source_outcome,
       source.source as source_source,
       source.commitment_hex as source_commitment_hex,
       source.amount_units as source_amount_units,
       source.leaf_index as source_leaf_index,
       source.encrypted_note_ciphertext as source_encrypted_note_ciphertext
     from market_payouts p
     join prediction_markets m on m.id = p.market_id
     join market_pools pool on pool.pool_id = m.pool_id
     join wallet_profiles recipient_profile on recipient_profile.user_id = p.user_id
     left join users u on u.id = p.user_id
     join market_escrow_notes source on source.id = p.source_escrow_note_id
     where p.market_id = $1
       and p.id = any($2::uuid[])
       and p.status = 'submitted'
       and p.source_escrow_note_id is not null
       and p.payout_commitment_hex is not null
       and p.encrypted_note_ciphertext is not null
       and source.status = 'spent'
       and (p.tx_hash is not null or p.relay_body is not null)
       and pool.status = 'active'
       and pool.contract_id is not null
       and recipient_profile.bn254_public_hex is not null
       and recipient_profile.x25519_public_hex is not null
     order by p.updated_at asc
     limit 1`,
    [input.marketId, payoutIds],
  );

  return result.rows[0] ?? null;
}

export async function markMarketPayoutPrepared(db: QueryClient, input: {
  marketId: string;
  payoutId: string;
  sourceEscrowNoteId: string;
  payoutCommitmentHex: string;
  encryptedPayoutNoteCiphertext: string;
  changeCommitmentHex?: string | null;
  encryptedChangeNoteCiphertext?: string | null;
  changeAmountUnits?: string | null;
  relayBody: Record<string, unknown>;
}) {
  const payoutCommitmentHex = normalizeText(input.payoutCommitmentHex);
  const encryptedPayoutNoteCiphertext = normalizeText(input.encryptedPayoutNoteCiphertext);
  const changeCommitmentHex = normalizeText(input.changeCommitmentHex);
  const encryptedChangeNoteCiphertext = normalizeText(input.encryptedChangeNoteCiphertext);
  const changeAmountUnits = normalizeText(input.changeAmountUnits);
  if (!payoutCommitmentHex) throw new Error("payoutCommitmentHex is required");
  if (!encryptedPayoutNoteCiphertext) throw new Error("encryptedPayoutNoteCiphertext is required");
  if (changeAmountUnits) assertPositiveUnits(changeAmountUnits, "changeAmountUnits");

  const result = await db.query<MarketPayoutRow>(
    `with source_note as (
       update market_escrow_notes set
         status = 'spent',
         updated_at = now()
       where id = $3::uuid
         and market_id = $1
         and status in ('escrowed', 'spent')
         and (status = 'escrowed' or tx_hash is null)
       returning *
     ),
     prepared_payout as (
       update market_payouts p set
         status = 'submitted',
         source_escrow_note_id = $3,
         payout_commitment_hex = $4,
         encrypted_note_ciphertext = $5,
         change_commitment_hex = $6,
         encrypted_change_note_ciphertext = $7,
         change_amount_units = $8::numeric,
         change_leaf_index = null,
         relay_body = $9::jsonb,
         updated_at = now()
       where p.id = $2::uuid
         and p.market_id = $1
         and p.status in ('pending', 'failed', 'submitted')
         and p.tx_hash is null
         and exists (select 1 from source_note)
       returning p.*
     )
     select * from prepared_payout`,
    [
      input.marketId,
      input.payoutId,
      input.sourceEscrowNoteId,
      payoutCommitmentHex,
      encryptedPayoutNoteCiphertext,
      changeCommitmentHex,
      encryptedChangeNoteCiphertext,
      changeAmountUnits,
      JSON.stringify(input.relayBody),
    ],
  );

  const payout = result.rows[0] ?? null;
  if (payout) {
    await db.query<MarketActivityEventRow>(
      `insert into market_activity_events (
         market_id, payout_id, event_type, event_data
       ) values ($1, $2::uuid, 'market_payout_prepared', $3::jsonb)
       returning *`,
      [
        input.marketId,
        input.payoutId,
        JSON.stringify({
          sourceEscrowNoteId: input.sourceEscrowNoteId,
          payoutCommitmentHex,
          changeCommitmentHex,
        }),
      ],
    );
  }

  return payout;
}

export async function markMarketPayoutSubmitted(db: QueryClient, input: {
  marketId: string;
  payoutId: string;
  sourceEscrowNoteId: string;
  payoutCommitmentHex: string;
  encryptedPayoutNoteCiphertext: string;
  changeCommitmentHex?: string | null;
  encryptedChangeNoteCiphertext?: string | null;
  changeAmountUnits?: string | null;
  txHash: string;
}) {
  const payoutCommitmentHex = normalizeText(input.payoutCommitmentHex);
  const encryptedPayoutNoteCiphertext = normalizeText(input.encryptedPayoutNoteCiphertext);
  const txHash = normalizeText(input.txHash);
  const changeCommitmentHex = normalizeText(input.changeCommitmentHex);
  const encryptedChangeNoteCiphertext = normalizeText(input.encryptedChangeNoteCiphertext);
  const changeAmountUnits = normalizeText(input.changeAmountUnits);
  if (!payoutCommitmentHex) throw new Error("payoutCommitmentHex is required");
  if (!encryptedPayoutNoteCiphertext) throw new Error("encryptedPayoutNoteCiphertext is required");
  if (!txHash) throw new Error("txHash is required to submit market payout");
  if (changeAmountUnits) assertPositiveUnits(changeAmountUnits, "changeAmountUnits");

  const result = await db.query<MarketPayoutRow>(
    `with source_note as (
       update market_escrow_notes set
         status = 'spent',
         tx_hash = $6,
         updated_at = now()
       where id = $3::uuid
         and market_id = $1
         and status in ('escrowed', 'spent')
        and (
          status = 'escrowed'
          or tx_hash = $6
          or tx_hash is null
          or exists (
            select 1
            from market_payouts prepared_payout
            where prepared_payout.id = $2::uuid
              and prepared_payout.market_id = $1
              and prepared_payout.source_escrow_note_id = $3::uuid
              and prepared_payout.status = 'submitted'
              and prepared_payout.tx_hash is null
              and prepared_payout.payout_commitment_hex = $4
              and prepared_payout.encrypted_note_ciphertext = $5
              and prepared_payout.relay_body is not null
          )
        )
       returning *
     ),
     submitted_payout as (
       update market_payouts p set
         status = 'submitted',
         source_escrow_note_id = $3,
         payout_commitment_hex = $4,
         encrypted_note_ciphertext = $5,
         tx_hash = $6,
         change_commitment_hex = $7,
         encrypted_change_note_ciphertext = $8,
         change_amount_units = $9::numeric,
         change_leaf_index = null,
         relay_body = coalesce(relay_body, $10::jsonb),
         updated_at = now()
       where p.id = $2::uuid
         and p.market_id = $1
         and p.status in ('pending', 'failed', 'submitted')
         and (p.status <> 'submitted' or p.tx_hash is null or p.tx_hash = $6)
         and exists (select 1 from source_note)
       returning p.*
     )
     select * from submitted_payout`,
    [
      input.marketId,
      input.payoutId,
      input.sourceEscrowNoteId,
      payoutCommitmentHex,
      encryptedPayoutNoteCiphertext,
      txHash,
      changeCommitmentHex,
      encryptedChangeNoteCiphertext,
      changeAmountUnits,
      null,
    ],
  );

  const payout = result.rows[0] ?? null;
  if (payout) {
    await db.query<MarketActivityEventRow>(
      `insert into market_activity_events (
         market_id, payout_id, event_type, event_data, tx_hash
       ) values ($1, $2::uuid, 'market_payout_submitted', $3::jsonb, $4)
       returning *`,
      [
        input.marketId,
        input.payoutId,
        JSON.stringify({
          sourceEscrowNoteId: input.sourceEscrowNoteId,
          payoutCommitmentHex,
          changeCommitmentHex,
        }),
        txHash,
      ],
    );
  }

  return payout;
}

export async function executeMarketPayoutTransfer(db: QueryClient, input: {
  marketId: string;
  adminEmail: string;
  payoutId: string;
  sourceEscrowNoteId: string;
  payoutCommitmentHex: string;
  encryptedPayoutNoteCiphertext: string;
  payoutLeafIndex: number;
  changeCommitmentHex?: string | null;
  encryptedChangeNoteCiphertext?: string | null;
  changeAmountUnits?: string | null;
  changeLeafIndex?: number | null;
  txHash: string;
}) {
  const payoutCommitmentHex = normalizeText(input.payoutCommitmentHex);
  const encryptedPayoutNoteCiphertext = normalizeText(input.encryptedPayoutNoteCiphertext);
  const txHash = normalizeText(input.txHash);
  const changeCommitmentHex = normalizeText(input.changeCommitmentHex);
  const encryptedChangeNoteCiphertext = normalizeText(input.encryptedChangeNoteCiphertext);
  const changeAmountUnits = normalizeText(input.changeAmountUnits);
  const hasChange = Boolean(changeCommitmentHex || encryptedChangeNoteCiphertext || changeAmountUnits);
  if (!payoutCommitmentHex) throw new Error("payoutCommitmentHex is required");
  if (!encryptedPayoutNoteCiphertext) throw new Error("encryptedPayoutNoteCiphertext is required");
  if (!Number.isInteger(input.payoutLeafIndex) || input.payoutLeafIndex < 0) {
    throw new Error("payoutLeafIndex must be a non-negative integer");
  }
  if (!txHash) throw new Error("txHash is required to execute market payout transfer");
  if (hasChange) {
    if (!changeCommitmentHex) throw new Error("changeCommitmentHex is required for escrow change");
    if (!encryptedChangeNoteCiphertext) throw new Error("encryptedChangeNoteCiphertext is required for escrow change");
    if (!changeAmountUnits) throw new Error("changeAmountUnits is required for escrow change");
    assertPositiveUnits(changeAmountUnits, "changeAmountUnits");
    if (!Number.isInteger(input.changeLeafIndex) || Number(input.changeLeafIndex) < 0) {
      throw new Error("changeLeafIndex must be a non-negative integer for escrow change");
    }
  }

  const transfer = await db.query<{
    payout: MarketPayoutRow;
    change_note: MarketEscrowNoteRow | null;
  }>(
    `with source_note as (
       update market_escrow_notes set
         status = 'spent',
         tx_hash = $7,
         updated_at = now()
       where id = $3::uuid
         and market_id = $1
         and status in ('escrowed', 'spent')
        and (
          status = 'escrowed'
          or tx_hash = $7
          or exists (
            select 1
            from market_payouts submitted_payout
            where submitted_payout.id = $2::uuid
              and submitted_payout.market_id = $1
              and submitted_payout.source_escrow_note_id = $3::uuid
              and submitted_payout.status in ('submitted', 'confirmed')
              and submitted_payout.tx_hash = $7
          )
        )
       returning *
     ),
     confirmed_payout as (
       update market_payouts p set
         status = 'confirmed',
         payout_commitment_hex = $4,
         encrypted_note_ciphertext = $5,
         leaf_index = $6,
         tx_hash = $7,
         source_escrow_note_id = $3,
         change_commitment_hex = $8,
         encrypted_change_note_ciphertext = $9,
         change_amount_units = $10::numeric,
         change_leaf_index = $11,
         updated_at = now()
       where p.id = $2::uuid
         and p.market_id = $1
         and p.status in ('pending', 'submitted', 'failed')
         and exists (select 1 from source_note)
       returning p.*
     ),
     inserted_change as (
       insert into market_escrow_notes (
         market_id, bet_id, pool_id, outcome, commitment_hex, amount_units,
         leaf_index, encrypted_note_ciphertext, status, source, tx_hash
       )
       select
         s.market_id, s.bet_id, s.pool_id, s.outcome, $8, $10::numeric,
         $11, $9, 'escrowed', 'payout_change', $7
       from source_note s
       where $8 is not null
         and $9 is not null
         and $10::numeric > 0
         and $11 is not null
       on conflict (pool_id, commitment_hex) do update set
         amount_units = excluded.amount_units,
         leaf_index = excluded.leaf_index,
         encrypted_note_ciphertext = excluded.encrypted_note_ciphertext,
         status = 'escrowed',
         tx_hash = excluded.tx_hash,
         updated_at = now()
       returning *
     )
     select
       to_jsonb(confirmed_payout.*) as payout,
       to_jsonb(inserted_change.*) as change_note
     from confirmed_payout
     left join inserted_change on true`,
    [
      input.marketId,
      input.payoutId,
      input.sourceEscrowNoteId,
      payoutCommitmentHex,
      encryptedPayoutNoteCiphertext,
      input.payoutLeafIndex,
      txHash,
      changeCommitmentHex,
      encryptedChangeNoteCiphertext,
      changeAmountUnits,
      input.changeLeafIndex ?? null,
    ],
  );

  const firstRow = transfer.rows[0] as
    | { payout?: MarketPayoutRow; change_note?: MarketEscrowNoteRow | null }
    | MarketPayoutRow
    | undefined;
  const payout = firstRow && "payout" in firstRow
    ? firstRow.payout ?? null
    : (firstRow as MarketPayoutRow | undefined) ?? null;

  const settlementJob = await db.query<MarketSettlementJobRow>(
    `update market_settlement_jobs set
       status = case
         when not exists (
           select 1 from market_payouts
           where market_id = $1
             and status in ('pending', 'submitted', 'failed')
         ) then 'completed'
         else status
       end,
       paid_units = (
         select coalesce(sum(amount_units), 0)
         from market_payouts
         where market_id = $1
           and status = 'confirmed'
       ),
       updated_at = now()
     where market_id = $1
       and status in ('queued', 'running', 'blocked')
     returning *`,
    [input.marketId],
  );

  await db.query<PredictionMarketRow>(
    `update prediction_markets set
       status = 'settled',
       updated_at = now()
     where id = $1
       and status in ('settling', 'resolved')
       and not exists (
         select 1 from market_payouts
         where market_id = $1
           and status in ('pending', 'submitted', 'failed')
       )
     returning *`,
    [input.marketId],
  );

  await db.query<MarketActivityEventRow>(
    `insert into market_activity_events (
       market_id, payout_id, event_type, event_data, tx_hash
     ) values ($1, $2::uuid, 'market_payout_executed', $3::jsonb, $4)
     returning *`,
    [
      input.marketId,
      input.payoutId,
      JSON.stringify({
        adminEmail: input.adminEmail,
        sourceEscrowNoteId: input.sourceEscrowNoteId,
        payoutCommitmentHex,
        payoutLeafIndex: input.payoutLeafIndex,
        changeCommitmentHex,
        changeLeafIndex: input.changeLeafIndex ?? null,
      }),
      txHash,
    ],
  );

  return {
    payout,
    settlementJob: settlementJob.rows[0] ?? null,
  };
}

export async function claimMarketPayoutNote(db: QueryClient, input: {
  userId: string;
  payoutId: string;
  commitmentHex: string;
  encryptedNoteCiphertext: string;
}): Promise<MarketPayoutClaimResult | null> {
  const commitmentHex = normalizeText(input.commitmentHex);
  const encryptedNoteCiphertext = normalizeText(input.encryptedNoteCiphertext);
  if (!commitmentHex) {
    throw new Error("commitmentHex is required");
  }
  if (!encryptedNoteCiphertext) {
    throw new Error("encryptedNoteCiphertext is required");
  }

  const result = await db.query<{
    payout: MarketPayoutRow;
    note: MarketUserNoteRow;
  }>(
    `with claimable_payout as (
       select
         p.*,
         m.pool_id
       from market_payouts p
       join prediction_markets m on m.id = p.market_id
       where p.user_id = $1
         and p.id = $2::uuid
         and p.status = 'confirmed'
         and p.payout_commitment_hex = $3
         and p.encrypted_note_ciphertext is not null
         and p.leaf_index is not null
         and p.tx_hash is not null
       limit 1
     ),
     claimed_payout as (
       update market_payouts p set
         status = 'claimed',
         encrypted_note_ciphertext = $4,
         updated_at = now()
       from claimable_payout c
       where p.id = c.id
       returning p.*
     ),
     inserted_note as (
       insert into market_user_notes (
         user_id, pool_id, commitment_hex, encrypted_note_ciphertext, asset_code,
         amount_units, leaf_index, status, source, tx_hash
       )
       select
         c.user_id, c.pool_id, c.payout_commitment_hex, $4, 'USDC',
         c.amount_units, c.leaf_index, 'unspent', 'payout', c.tx_hash
       from claimable_payout c
       on conflict (user_id, pool_id, commitment_hex) do update set
         encrypted_note_ciphertext = excluded.encrypted_note_ciphertext,
         amount_units = excluded.amount_units,
         leaf_index = excluded.leaf_index,
         status = 'unspent',
         source = 'payout',
         tx_hash = excluded.tx_hash,
         updated_at = now()
       returning *
     )
     select
       to_jsonb(claimed_payout.*) as payout,
       to_jsonb(inserted_note.*) as note
     from claimed_payout
     cross join inserted_note`,
    [
      input.userId,
      input.payoutId,
      commitmentHex,
      encryptedNoteCiphertext,
    ],
  );

  const row = result.rows[0];
  return row ? { payout: row.payout, note: row.note } : null;
}

export async function listMarketPayoutQueue(db: QueryClient, input: {
  marketId: string;
}) {
  const result = await db.query<AdminMarketPayoutRow>(
    `select
       p.*,
       u.email as user_email
     from market_payouts p
     left join users u on u.id = p.user_id
     where p.market_id = $1
       and p.status in ('pending', 'submitted', 'failed')
     order by
       case p.status
         when 'failed' then 0
         when 'pending' then 1
         else 2
       end,
       p.created_at asc
     limit 250`,
    [input.marketId],
  );
  return result.rows;
}

export function marketOddsForRow(row: Pick<PredictionMarketRow, "yes_total_units" | "no_total_units">) {
  return computeMarketOdds({
    yesTotal: String(row.yes_total_units),
    noTotal: String(row.no_total_units),
  });
}
