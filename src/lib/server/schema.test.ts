import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const migrationPath = join(root, "db", "migrations", "0001_wallet_v2.sql");
const marketsMigrationPath = join(root, "db", "migrations", "0002_prediction_markets.sql");

function readMigration() {
  return readFileSync(migrationPath, "utf8");
}

function readMarketsMigration() {
  return readFileSync(marketsMigrationPath, "utf8");
}

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...listSourceFiles(path));
    if (stat.isFile() && /\.(ts|tsx)$/.test(path)) files.push(path);
  }
  return files;
}

function isServerDbBoundary(file: string): boolean {
  return (
    file.includes(join("src", "lib", "server")) ||
    file.includes(join("src", "app", "api"))
  );
}

test("wallet v2 migration creates Auth.js adapter and wallet app tables", () => {
  const sql = readMigration();
  for (const table of [
    "users",
    "accounts",
    "sessions",
    "verification_token",
    "wallet_profiles",
    "vaults",
    "notes",
    "jobs",
    "spend_jobs",
    "spend_job_steps",
    "contacts",
    "requests",
    "activity_events",
    "notification_inbox",
    "public_transactions",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists ${table}\\b`, "i"));
  }
});

test("prediction market migration creates isolated market pool, note, bet, resolution, and settlement tables", () => {
  const sql = readMarketsMigration();
  for (const table of [
    "market_pools",
    "prediction_markets",
    "market_user_notes",
    "market_bets",
    "market_escrow_notes",
    "market_resolutions",
    "market_payouts",
    "market_settlement_jobs",
    "market_escrow_transfers",
    "market_activity_events",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists ${table}\\b`, "i"));
  }
  assert.match(sql, /pool_id text not null/i);
  assert.match(sql, /status text not null check \(status in \('draft', 'open', 'closed', 'resolved', 'cancelled', 'settling', 'settled'\)\)/i);
  assert.match(sql, /outcome text not null check \(outcome in \('YES', 'NO'\)\)/i);
  assert.match(sql, /idempotency_key text not null/i);
  assert.match(sql, /unique \(user_id, idempotency_key\)/i);
  assert.match(sql, /resolver_email text not null/i);
  assert.match(sql, /evidence_text text/i);
  assert.match(sql, /market_user_notes_pool_commitment_idx/i);
  assert.match(sql, /market_bets_confirmed_totals_idx/i);
  assert.match(sql, /create table if not exists market_payouts[\s\S]+leaf_index integer/i);
  assert.match(sql, /alter table market_payouts add column if not exists leaf_index integer/i);
  assert.match(sql, /alter table market_payouts add column if not exists source_escrow_note_id uuid/i);
  assert.match(sql, /alter table market_payouts add column if not exists change_commitment_hex text/i);
  assert.match(sql, /alter table market_payouts add column if not exists encrypted_change_note_ciphertext text/i);
  assert.match(sql, /alter table market_payouts add column if not exists change_amount_units numeric\(40, 0\)/i);
  assert.match(sql, /alter table market_payouts add column if not exists change_leaf_index integer/i);
  assert.match(sql, /alter table market_escrow_notes alter column bet_id drop not null/i);
  assert.match(sql, /alter table market_escrow_notes drop constraint if exists market_escrow_notes_outcome_check/i);
  assert.match(sql, /outcome in \('YES', 'NO', 'POOL'\)/i);
  assert.match(sql, /alter table market_escrow_notes add column if not exists source text/i);
  assert.match(sql, /output_encrypted_note_ciphertext text/i);
  assert.match(sql, /alter table market_escrow_transfers add column if not exists output_encrypted_note_ciphertext text/i);
  assert.match(sql, /market_escrow_transfers_source_ids_idx/i);
  assert.match(sql, /alter table market_user_notes drop constraint if exists market_user_notes_status_check/i);
  assert.match(sql, /alter table market_user_notes add constraint market_user_notes_status_check/i);
  assert.match(sql, /'pending_deposit'/i);
});

test("wallet v2 migration stores ciphertext and metadata, not cleartext wallet secrets", () => {
  const sql = readMigration();
  assert.match(sql, /vault_ciphertext text not null/i);
  assert.match(sql, /recovery_ciphertext text not null/i);
  assert.match(sql, /encrypted_note_ciphertext text not null/i);
  assert.match(sql, /kdf_name text not null/i);
  assert.match(sql, /registered_in_pool boolean not null default false/i);
  assert.match(sql, /active_job_id uuid/i);
  assert.match(sql, /spend_version integer not null default 0/i);
  assert.match(sql, /last_chain_checked_at timestamptz/i);
  assert.match(sql, /idempotency_key text not null/i);
  assert.match(sql, /unique \(user_id, idempotency_key\)/i);
  assert.match(sql, /spend_job_id uuid references spend_jobs\(id\)/i);
  assert.match(sql, /lease_owner text/i);
  assert.match(sql, /last_heartbeat_at timestamptz/i);
  assert.match(sql, /reconcile_after timestamptz/i);
  assert.match(sql, /execution_mode text not null default 'interactive'/i);
  assert.match(sql, /execution_package_ciphertext text/i);
  assert.match(sql, /execution_package_expires_at timestamptz/i);
  assert.match(sql, /execution_package_deleted_at timestamptz/i);
  assert.match(sql, /spend_jobs_background_package_idx/i);
  assert.match(sql, /spend_job_steps_lease_expiry_idx/i);
  assert.match(sql, /spend_job_steps_job_ordinal_idx/i);
  assert.match(sql, /activity_events_spend_job_created_idx/i);
  assert.match(sql, /activity_events_user_id_idx/i);
  assert.match(sql, /create table if not exists notification_inbox\b/i);
  assert.match(sql, /activity_event_id uuid references activity_events\(id\)/i);
  assert.match(sql, /read_at timestamptz/i);
  assert.match(sql, /seen_at timestamptz/i);
  assert.match(sql, /notification_inbox_user_unread_idx/i);
  assert.match(sql, /create table if not exists public_transactions\b/i);
  assert.match(sql, /source_public_key text not null/i);
  assert.match(sql, /destination_public_key text/i);
  assert.match(sql, /public_transactions_user_created_idx/i);
  assert.match(sql, /public_transactions_tx_hash_idx/i);
  assert.match(sql, /'pending_deposit'/i);
  assert.match(sql, /s\.error_class = 'already_spent_nullifier'/i);
  assert.match(sql, /n\.status in \('unspent', 'received', 'pending_spend'\)/i);
  assert.match(sql, /handle text unique/i);
  assert.match(sql, /handle_normalized text unique/i);
  assert.match(sql, /membership_blinding_public_hex text/i);
  assert.match(sql, /recipient_user_id uuid references users\(id\)/i);
  assert.match(sql, /recipient_handle text/i);
  assert.match(sql, /recipient_note_public_hex text/i);
  assert.match(sql, /recipient_x25519_public_hex text/i);
  assert.match(sql, /recipient_output_commitment_hex text/i);
  assert.match(sql, /recipient_output_leaf_index integer/i);
  assert.match(sql, /recipient_encrypted_output text/i);
  assert.match(sql, /create table if not exists contacts\b/i);
  assert.match(sql, /requester_user_id uuid not null references users\(id\)/i);
  assert.match(sql, /contact_user_id uuid not null references users\(id\)/i);
  assert.match(sql, /status text not null check \(status in \('pending', 'accepted', 'declined', 'removed'\)\)/i);
  assert.match(sql, /contacts_pair_unique_idx/i);
  assert.match(sql, /paid_spend_job_id uuid references spend_jobs\(id\)/i);
  assert.match(sql, /request_id uuid references requests\(id\)/i);
  assert.match(sql, /'failed_recoverable'/i);
  assert.match(sql, /create table if not exists incoming_notes\b/i);
  assert.match(sql, /status text not null check \(status in \('pending', 'claimed', 'failed'\)\)/i);

  assert.doesNotMatch(sql, /\bstellar_secret\b/i);
  assert.doesNotMatch(sql, /\bbn254_secret\b/i);
  assert.doesNotMatch(sql, /\bx25519_secret\b/i);
  assert.doesNotMatch(sql, /\bnote_secret\b/i);
  assert.doesNotMatch(sql, /\bseed_phrase\b/i);
  assert.doesNotMatch(sql, /\brecipient_seed\b/i);
});

test("database module is server-only and selects pooled or direct Supabase URLs explicitly", async () => {
  const source = readFileSync(join(root, "src", "lib", "server", "db.ts"), "utf8");
  assert.match(source, /server-only/);
  const db = await import("./databaseUrl");

  assert.equal(
    db.getDatabaseUrl({
      DATABASE_URL: "postgres://pooled",
      DIRECT_DATABASE_URL: "postgres://direct",
    }),
    "postgres://pooled",
  );
  assert.equal(
    db.getDatabaseUrl(
      {
        DATABASE_URL: "postgres://pooled",
        DIRECT_DATABASE_URL: "postgres://direct",
      },
      { direct: true },
    ),
    "postgres://direct",
  );
  assert.throws(() => db.getDatabaseUrl({}, { direct: true }), /DIRECT_DATABASE_URL/);
});

test("browser-facing source files do not import database clients or server DB modules", () => {
  const restrictedImports = [
    /from\s+["']pg["']/,
    /require\(["']pg["']\)/,
    /@auth\/pg-adapter/,
    /@supabase\/supabase-js/,
    /@\/lib\/server\/(?:db|walletRepository|walletRepositoryCore|databaseUrl)/,
    /lib\/server\/(?:db|walletRepository|walletRepositoryCore|databaseUrl)/,
  ];
  const sourceFiles = listSourceFiles(join(root, "src")).filter(
    (file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"),
  );

  for (const file of sourceFiles) {
    if (isServerDbBoundary(file)) continue;
    const source = readFileSync(file, "utf8");
    for (const pattern of restrictedImports) {
      assert.doesNotMatch(
        source,
        pattern,
        `${relative(root, file)} imports database-only code outside the server boundary`,
      );
    }
  }
});
