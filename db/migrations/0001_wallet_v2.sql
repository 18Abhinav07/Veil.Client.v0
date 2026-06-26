-- Wallet V2 foundation schema for Supabase Postgres.
-- Auth.js uses the official @auth/pg-adapter table names/columns.

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text unique,
  "emailVerified" timestamptz,
  image text
);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references users(id) on delete cascade,
  provider text not null,
  type text not null,
  "providerAccountId" text not null,
  access_token text,
  expires_at bigint,
  refresh_token text,
  id_token text,
  scope text,
  session_state text,
  token_type text,
  unique (provider, "providerAccountId")
);

create index if not exists accounts_user_id_idx on accounts("userId");

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  "userId" uuid not null references users(id) on delete cascade,
  expires timestamptz not null,
  "sessionToken" text not null unique
);

create index if not exists sessions_user_id_idx on sessions("userId");

create table if not exists verification_token (
  identifier text not null,
  expires timestamptz not null,
  token text not null,
  primary key (identifier, token)
);

create table if not exists wallet_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  email text not null,
  handle text unique,
  handle_normalized text unique,
  stellar_public_key text,
  bn254_public_hex text,
  x25519_public_hex text,
  membership_blinding_public_hex text,
  registered_in_pool boolean not null default false,
  pool_registration_tx_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table wallet_profiles add column if not exists handle_normalized text unique;
alter table wallet_profiles add column if not exists membership_blinding_public_hex text;
create unique index if not exists wallet_profiles_handle_normalized_idx
  on wallet_profiles(handle_normalized)
  where handle_normalized is not null;

create table if not exists vaults (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  vault_version integer not null default 2,
  vault_ciphertext text not null,
  recovery_ciphertext text not null,
  kdf_name text not null,
  kdf_params jsonb not null,
  encryption_alg text not null default 'AES-256-GCM',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  commitment_hex text not null,
  encrypted_note_ciphertext text not null,
  asset_code text not null default 'USDC',
  amount_units text not null,
  leaf_index integer,
  status text not null check (
    status in (
      'unspent',
      'spent',
      'pending_deposit',
      'pending_spend',
      'received',
      'failed_recovery'
    )
  ),
  source text not null check (source in ('deposit', 'change', 'received')),
  tx_hash text,
  active_job_id uuid,
  spend_version integer not null default 0,
  last_chain_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, commitment_hex)
);

alter table notes add column if not exists active_job_id uuid;
alter table notes add column if not exists spend_version integer not null default 0;
alter table notes add column if not exists last_chain_checked_at timestamptz;
alter table notes drop constraint if exists notes_status_check;
alter table notes add constraint notes_status_check check (
  status in (
    'unspent',
    'spent',
    'pending_deposit',
    'pending_spend',
    'received',
    'failed_recovery'
  )
);

create index if not exists notes_user_status_idx on notes(user_id, status);
create index if not exists notes_commitment_idx on notes(commitment_hex);
create index if not exists notes_active_job_idx on notes(active_job_id) where active_job_id is not null;

create table if not exists spend_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  request_id uuid,
  kind text not null default 'lane1_withdraw',
  status text not null check (
    status in (
      'queued',
      'running',
      'paused_needs_unlock',
      'waiting_retry',
      'needs_reconcile',
      'completed',
      'failed_recoverable',
      'failed_final',
      'canceled'
    )
  ),
  idempotency_key text not null,
  source_note_id uuid references notes(id) on delete set null,
  source_commitment_hex text not null,
  source_amount_units text not null,
  source_leaf_index integer,
  active_note_id uuid references notes(id) on delete set null,
  active_commitment_hex text not null,
  active_amount_units text not null,
  active_leaf_index integer,
  pool_id text not null,
  total_amount_units text not null,
  total_recipients integer not null,
  completed_count integer not null default 0,
  retry_after timestamptz,
  error_class text,
  error_message text,
  lease_token text,
  lease_owner text,
  lease_expires_at timestamptz,
  last_heartbeat_at timestamptz,
  reconcile_after timestamptz,
  execution_mode text not null default 'interactive' check (execution_mode in ('interactive', 'background')),
  execution_package_ciphertext text,
  execution_package_expires_at timestamptz,
  execution_package_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

alter table spend_jobs add column if not exists request_id uuid;
alter table spend_jobs add column if not exists lease_owner text;
alter table spend_jobs add column if not exists last_heartbeat_at timestamptz;
alter table spend_jobs add column if not exists reconcile_after timestamptz;
alter table spend_jobs add column if not exists execution_mode text not null default 'interactive';
alter table spend_jobs add column if not exists execution_package_ciphertext text;
alter table spend_jobs add column if not exists execution_package_expires_at timestamptz;
alter table spend_jobs add column if not exists execution_package_deleted_at timestamptz;

create index if not exists spend_jobs_user_status_idx on spend_jobs(user_id, status, created_at desc);
create index if not exists spend_jobs_source_note_active_idx
  on spend_jobs(user_id, source_note_id)
  where status in ('queued', 'running', 'paused_needs_unlock', 'waiting_retry', 'needs_reconcile', 'failed_recoverable');
create index if not exists spend_jobs_request_id_idx on spend_jobs(request_id) where request_id is not null;
create index if not exists spend_jobs_background_package_idx
  on spend_jobs(execution_package_expires_at)
  where execution_mode = 'background' and execution_package_deleted_at is null;

create table if not exists spend_job_steps (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references spend_jobs(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  ordinal integer not null,
  recipient_address text not null,
  amount_units text not null,
  status text not null check (
    status in (
      'queued',
      'proving',
      'proof_ready',
      'relaying',
      'submitted',
      'mined',
      'indexing',
      'stored',
      'confirmed',
      'retry_wait',
      'needs_reconcile',
      'failed_final'
    )
  ),
  source_note_id uuid references notes(id) on delete set null,
  source_commitment_hex text not null,
  source_amount_units text not null,
  source_leaf_index integer,
  input_nullifier_hex text,
  relay_body jsonb,
  tx_hash text,
  output_commitment_hex text,
  output_amount_units text,
  output_leaf_index integer,
  encrypted_change_note_ciphertext text,
  recipient_user_id uuid references users(id) on delete set null,
  recipient_handle text,
  recipient_note_public_hex text,
  recipient_x25519_public_hex text,
  recipient_output_commitment_hex text,
  recipient_output_leaf_index integer,
  recipient_encrypted_output text,
  attempts integer not null default 0,
  error_class text,
  error_message text,
  retry_after timestamptz,
  lease_owner text,
  lease_expires_at timestamptz,
  last_heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, ordinal)
);

alter table spend_job_steps add column if not exists recipient_user_id uuid references users(id) on delete set null;
alter table spend_job_steps add column if not exists recipient_handle text;
alter table spend_job_steps add column if not exists recipient_note_public_hex text;
alter table spend_job_steps add column if not exists recipient_x25519_public_hex text;
alter table spend_job_steps add column if not exists recipient_output_commitment_hex text;
alter table spend_job_steps add column if not exists recipient_output_leaf_index integer;
alter table spend_job_steps add column if not exists recipient_encrypted_output text;
alter table spend_job_steps add column if not exists lease_owner text;
alter table spend_job_steps add column if not exists lease_expires_at timestamptz;
alter table spend_job_steps add column if not exists last_heartbeat_at timestamptz;

create index if not exists spend_job_steps_job_ordinal_idx on spend_job_steps(job_id, ordinal);
create index if not exists spend_job_steps_user_status_idx on spend_job_steps(user_id, status);
create index if not exists spend_job_steps_tx_hash_idx on spend_job_steps(tx_hash) where tx_hash is not null;
create index if not exists spend_job_steps_lease_expiry_idx
  on spend_job_steps(lease_expires_at)
  where status in ('proving', 'relaying') and lease_expires_at is not null;
create index if not exists spend_job_steps_recipient_user_status_idx
  on spend_job_steps(recipient_user_id, status)
  where recipient_user_id is not null;

create table if not exists incoming_notes (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references users(id) on delete cascade,
  sender_user_id uuid references users(id) on delete set null,
  spend_job_id uuid references spend_jobs(id) on delete set null,
  spend_job_step_id uuid references spend_job_steps(id) on delete set null,
  commitment_hex text not null,
  amount_units text not null,
  encrypted_output text not null,
  tx_hash text,
  leaf_index integer,
  status text not null check (status in ('pending', 'claimed', 'failed')),
  claimed_note_id uuid references notes(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipient_user_id, commitment_hex)
);

create index if not exists incoming_notes_recipient_status_idx
  on incoming_notes(recipient_user_id, status, created_at desc);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references users(id) on delete cascade,
  contact_user_id uuid not null references users(id) on delete cascade,
  user_low_id uuid not null references users(id) on delete cascade,
  user_high_id uuid not null references users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_user_id <> contact_user_id),
  check (user_low_id < user_high_id)
);

create unique index if not exists contacts_pair_unique_idx
  on contacts(user_low_id, user_high_id);
create index if not exists contacts_requester_status_idx on contacts(requester_user_id, status);
create index if not exists contacts_contact_status_idx on contacts(contact_user_id, status);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  kind text not null,
  status text not null check (
    status in ('queued', 'proving', 'relaying', 'mined', 'indexed', 'stored', 'failed')
  ),
  idempotency_key text unique,
  input_ciphertext text,
  progress jsonb not null default '{}'::jsonb,
  error text,
  tx_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_user_status_idx on jobs(user_id, status);

create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references users(id) on delete cascade,
  payer_user_id uuid references users(id) on delete set null,
  payer_email text,
  amount_units text not null,
  asset_code text not null default 'USDC',
  memo_ciphertext text,
  status text not null check (status in ('open', 'paid', 'declined', 'expired', 'failed_recoverable')),
  paid_job_id uuid references jobs(id) on delete set null,
  paid_spend_job_id uuid references spend_jobs(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table requests add column if not exists paid_spend_job_id uuid references spend_jobs(id) on delete set null;
alter table requests drop constraint if exists requests_status_check;
alter table requests add constraint requests_status_check check (
  status in ('open', 'paid', 'declined', 'expired', 'failed_recoverable')
);
alter table spend_jobs drop constraint if exists spend_jobs_request_id_fkey;
alter table spend_jobs add constraint spend_jobs_request_id_fkey
  foreign key (request_id) references requests(id) on delete set null;

create index if not exists requests_requester_status_idx on requests(requester_user_id, status);
create index if not exists requests_payer_status_idx on requests(payer_user_id, status);
create index if not exists requests_paid_spend_job_idx on requests(paid_spend_job_id) where paid_spend_job_id is not null;

create table if not exists activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  spend_job_id uuid references spend_jobs(id) on delete set null,
  note_id uuid references notes(id) on delete set null,
  request_id uuid references requests(id) on delete set null,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  tx_hash text,
  created_at timestamptz not null default now()
);

alter table activity_events add column if not exists spend_job_id uuid references spend_jobs(id) on delete set null;

create index if not exists activity_events_user_created_idx on activity_events(user_id, created_at desc);
create index if not exists activity_events_user_id_idx on activity_events(user_id, id);
create index if not exists activity_events_job_created_idx on activity_events(job_id, created_at asc) where job_id is not null;
create index if not exists activity_events_spend_job_created_idx on activity_events(spend_job_id, created_at asc) where spend_job_id is not null;

create table if not exists notification_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  activity_event_id uuid references activity_events(id) on delete set null,
  type text not null,
  severity text not null default 'info' check (severity in ('info', 'success', 'warning', 'error')),
  entity_kind text not null,
  entity_id uuid,
  title text not null,
  body text,
  action_url text,
  read_at timestamptz,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_inbox_user_created_idx
  on notification_inbox(user_id, created_at desc);
create index if not exists notification_inbox_user_unread_idx
  on notification_inbox(user_id, created_at desc)
  where read_at is null;
create index if not exists notification_inbox_activity_event_idx
  on notification_inbox(activity_event_id)
  where activity_event_id is not null;

create table if not exists public_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  source_public_key text not null,
  destination_public_key text,
  kind text not null check (kind in ('payment', 'trustline', 'swap', 'funding')),
  asset_code text,
  amount_units text,
  tx_hash text not null,
  ledger integer,
  status text not null default 'confirmed' check (status in ('pending', 'submitted', 'confirmed', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists public_transactions_user_created_idx
  on public_transactions(user_id, created_at desc);
create unique index if not exists public_transactions_tx_hash_idx
  on public_transactions(user_id, tx_hash);

-- Data repair for pre-quarantine Lane 1 jobs: if the pool says a source
-- nullifier is already spent, that note must not remain selectable.
update notes n
set
  status = 'failed_recovery',
  last_chain_checked_at = now(),
  updated_at = now()
from spend_job_steps s
where s.user_id = n.user_id
  and s.source_note_id = n.id
  and n.status in ('unspent', 'received', 'pending_spend')
  and (
    s.error_class = 'already_spent_nullifier'
    or s.error_message ilike '%Error(Contract, #9)%'
    or s.error_message ilike '%AlreadySpentNullifier%'
  );
