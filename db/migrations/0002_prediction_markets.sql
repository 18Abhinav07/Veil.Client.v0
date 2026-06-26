create table if not exists market_pools (
  id uuid primary key default gen_random_uuid(),
  pool_id text not null unique,
  contract_id text,
  tree_depth integer not null default 15,
  deployment_ledger integer not null default 1,
  status text not null default 'planned' check (status in ('planned', 'deploying', 'active', 'paused', 'retired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists prediction_markets (
  id uuid primary key default gen_random_uuid(),
  pool_id text not null references market_pools(pool_id),
  slug text not null unique,
  title text not null,
  category text not null,
  status text not null check (status in ('draft', 'open', 'closed', 'resolved', 'cancelled', 'settling', 'settled')),
  closes_at timestamptz not null,
  resolves_at timestamptz,
  rules text not null,
  resolution_source text not null,
  icon_name text not null,
  display_order integer not null default 100,
  yes_total_units numeric(40, 0) not null default 0,
  no_total_units numeric(40, 0) not null default 0,
  winning_outcome text check (winning_outcome in ('YES', 'NO')),
  demo_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists market_user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  pool_id text not null references market_pools(pool_id),
  commitment_hex text not null,
  encrypted_note_ciphertext text not null,
  asset_code text not null default 'USDC',
  amount_units numeric(40, 0) not null,
  leaf_index integer,
  status text not null default 'unspent' check (status in ('pending_deposit', 'unspent', 'pending_bet', 'escrowed', 'spent', 'payout_pending', 'payout_received', 'failed_recovery')),
  source text not null default 'market_deposit' check (source in ('market_deposit', 'change', 'payout', 'refund')),
  tx_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, pool_id, commitment_hex)
);

alter table market_user_notes drop constraint if exists market_user_notes_status_check;
alter table market_user_notes add constraint market_user_notes_status_check
  check (status in ('pending_deposit', 'unspent', 'pending_bet', 'escrowed', 'spent', 'payout_pending', 'payout_received', 'failed_recovery'));

create table if not exists market_bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  market_id uuid not null references prediction_markets(id) on delete cascade,
  market_slug text not null,
  pool_id text not null references market_pools(pool_id),
  note_id uuid references market_user_notes(id),
  idempotency_key text not null,
  outcome text not null check (outcome in ('YES', 'NO')),
  amount_units numeric(40, 0) not null,
  status text not null default 'pending' check (status in ('pending', 'submitted', 'confirmed', 'expired', 'cancelled', 'settled')),
  input_commitment_hex text,
  escrow_commitment_hex text,
  change_commitment_hex text,
  tx_hash text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists market_escrow_notes (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references prediction_markets(id) on delete cascade,
  bet_id uuid references market_bets(id) on delete cascade,
  pool_id text not null references market_pools(pool_id),
  outcome text not null check (outcome in ('YES', 'NO', 'POOL')),
  commitment_hex text not null,
  amount_units numeric(40, 0) not null,
  leaf_index integer,
  encrypted_note_ciphertext text,
  status text not null default 'escrowed' check (status in ('escrowed', 'spent', 'refunded', 'settled')),
  source text not null default 'bet' check (source in ('bet', 'rollup', 'payout_change', 'consolidation_change')),
  tx_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pool_id, commitment_hex)
);

alter table market_escrow_notes alter column bet_id drop not null;
alter table market_escrow_notes drop constraint if exists market_escrow_notes_outcome_check;
alter table market_escrow_notes add constraint market_escrow_notes_outcome_check
  check (outcome in ('YES', 'NO', 'POOL'));
alter table market_escrow_notes add column if not exists source text not null default 'bet';
alter table market_escrow_notes drop constraint if exists market_escrow_notes_source_check;
alter table market_escrow_notes add constraint market_escrow_notes_source_check
  check (source in ('bet', 'rollup', 'payout_change', 'consolidation_change'));

create table if not exists market_resolutions (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references prediction_markets(id) on delete cascade,
  outcome text not null check (outcome in ('YES', 'NO')),
  resolver_email text not null,
  evidence_text text,
  evidence_url text,
  resolved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists market_payouts (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references prediction_markets(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  amount_units numeric(40, 0) not null,
  status text not null default 'pending' check (status in ('pending', 'submitted', 'confirmed', 'failed', 'claimed')),
  payout_commitment_hex text,
  encrypted_note_ciphertext text,
  leaf_index integer,
  tx_hash text,
  source_escrow_note_id uuid references market_escrow_notes(id),
  change_commitment_hex text,
  encrypted_change_note_ciphertext text,
  change_amount_units numeric(40, 0),
  change_leaf_index integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market_id, user_id)
);

alter table market_payouts add column if not exists leaf_index integer;
alter table market_payouts add column if not exists source_escrow_note_id uuid references market_escrow_notes(id);
alter table market_payouts add column if not exists change_commitment_hex text;
alter table market_payouts add column if not exists encrypted_change_note_ciphertext text;
alter table market_payouts add column if not exists change_amount_units numeric(40, 0);
alter table market_payouts add column if not exists change_leaf_index integer;

create table if not exists market_settlement_jobs (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references prediction_markets(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'blocked', 'completed', 'failed')),
  winning_outcome text not null check (winning_outcome in ('YES', 'NO')),
  total_pool_units numeric(40, 0) not null default 0,
  winning_pool_units numeric(40, 0) not null default 0,
  paid_units numeric(40, 0) not null default 0,
  rounding_dust_units numeric(40, 0) not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists market_escrow_transfers (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references prediction_markets(id) on delete cascade,
  payout_id uuid references market_payouts(id) on delete set null,
  operation_type text not null check (operation_type in ('consolidation', 'payout')),
  status text not null default 'confirmed' check (status in ('submitted', 'confirmed', 'failed')),
  source_escrow_note_ids uuid[] not null,
  output_commitment_hex text,
  output_amount_units numeric(40, 0),
  output_encrypted_note_ciphertext text,
  output_leaf_index integer,
  change_commitment_hex text,
  change_amount_units numeric(40, 0),
  change_leaf_index integer,
  tx_hash text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table market_escrow_transfers add column if not exists output_encrypted_note_ciphertext text;

create table if not exists market_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  market_id uuid references prediction_markets(id) on delete cascade,
  bet_id uuid references market_bets(id) on delete cascade,
  payout_id uuid references market_payouts(id) on delete cascade,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  tx_hash text,
  created_at timestamptz not null default now()
);

create index if not exists market_pools_status_idx
  on market_pools (status, created_at desc);

create index if not exists prediction_markets_status_order_idx
  on prediction_markets (status, display_order, closes_at);

create index if not exists prediction_markets_pool_idx
  on prediction_markets (pool_id, status);

create index if not exists market_user_notes_pool_commitment_idx
  on market_user_notes (pool_id, commitment_hex);

create index if not exists market_user_notes_user_status_idx
  on market_user_notes (user_id, status, created_at desc);

create index if not exists market_bets_confirmed_totals_idx
  on market_bets (market_id, outcome, status)
  where status = 'confirmed';

create index if not exists market_bets_user_created_idx
  on market_bets (user_id, created_at desc);

create index if not exists market_escrow_notes_market_status_idx
  on market_escrow_notes (market_id, status);

create index if not exists market_escrow_transfers_source_ids_idx
  on market_escrow_transfers using gin (source_escrow_note_ids);

create index if not exists market_payouts_user_status_idx
  on market_payouts (user_id, status, created_at desc);

create index if not exists market_activity_events_user_created_idx
  on market_activity_events (user_id, created_at desc);

create index if not exists market_activity_events_market_created_idx
  on market_activity_events (market_id, created_at desc);
