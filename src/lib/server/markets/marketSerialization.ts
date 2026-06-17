import {
  marketOddsForRow,
  type MarketBetRow,
  type MarketPayoutRow,
  type MarketPoolRow,
  type MarketPortfolio,
  type MarketUserNoteRow,
  type PredictionMarketRow,
} from "./marketRepositoryCore";

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toUnits(value: string | number | bigint | null | undefined) {
  return value === null || value === undefined ? "0" : String(value);
}

export function serializeMarket(row: PredictionMarketRow) {
  const odds = marketOddsForRow(row);
  const poolActive = row.pool_status === "active" && Boolean(row.contract_id);
  return {
    id: row.id,
    poolId: row.pool_id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    status: row.status,
    closesAt: toIso(row.closes_at),
    resolvesAt: toIso(row.resolves_at),
    rules: row.rules,
    resolutionSource: row.resolution_source,
    iconName: row.icon_name,
    displayOrder: row.display_order,
    yesTotalUnits: toUnits(row.yes_total_units),
    noTotalUnits: toUnits(row.no_total_units),
    winningOutcome: row.winning_outcome,
    demoOnly: row.demo_only,
    poolStatus: row.pool_status ?? null,
    poolActive,
    contractId: row.contract_id ?? null,
    treeDepth: row.tree_depth ?? null,
    deploymentLedger: row.deployment_ledger ?? null,
    odds,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function serializeMarketPool(row: MarketPoolRow) {
  return {
    id: row.id,
    poolId: row.pool_id,
    contractId: row.contract_id,
    treeDepth: row.tree_depth,
    deploymentLedger: row.deployment_ledger,
    status: row.status,
    metadata: row.metadata,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function serializeMarketUserNote(row: MarketUserNoteRow) {
  return {
    id: row.id,
    userId: row.user_id,
    poolId: row.pool_id,
    commitmentHex: row.commitment_hex,
    encryptedNoteCiphertext: row.encrypted_note_ciphertext,
    assetCode: row.asset_code,
    amountUnits: toUnits(row.amount_units),
    leafIndex: row.leaf_index,
    status: row.status,
    source: row.source,
    txHash: row.tx_hash,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function serializeMarketBet(row: MarketBetRow) {
  return {
    id: row.id,
    userId: row.user_id,
    marketId: row.market_id,
    marketSlug: row.market_slug,
    poolId: row.pool_id,
    noteId: row.note_id,
    idempotencyKey: row.idempotency_key,
    outcome: row.outcome,
    amountUnits: toUnits(row.amount_units),
    status: row.status,
    inputCommitmentHex: row.input_commitment_hex,
    escrowCommitmentHex: row.escrow_commitment_hex,
    changeCommitmentHex: row.change_commitment_hex,
    txHash: row.tx_hash,
    confirmedAt: toIso(row.confirmed_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function serializeMarketPayout(row: MarketPayoutRow) {
  return {
    id: row.id,
    marketId: row.market_id,
    userId: row.user_id,
    amountUnits: toUnits(row.amount_units),
    status: row.status,
    payoutCommitmentHex: row.payout_commitment_hex,
    encryptedNoteCiphertext: row.encrypted_note_ciphertext,
    leafIndex: row.leaf_index,
    txHash: row.tx_hash,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function serializeMarketPortfolio(portfolio: MarketPortfolio) {
  return {
    notes: portfolio.notes.map(serializeMarketUserNote),
    bets: portfolio.bets.map(serializeMarketBet),
    payouts: portfolio.payouts.map(serializeMarketPayout),
  };
}
