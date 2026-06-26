import { pathToFileURL } from "node:url";
import pg from "pg";

import {
  getDirectDatabaseUrl,
  loadMigrationEnv,
} from "./apply-migration.mjs";

export const EXPECTED_TABLES = [
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
  "requests",
  "activity_events",
  "notification_inbox",
  "public_transactions",
  "market_pools",
  "prediction_markets",
  "market_user_notes",
  "market_bets",
  "market_escrow_notes",
  "market_resolutions",
  "market_payouts",
  "market_settlement_jobs",
  "market_activity_events",
];

export const EXPECTED_COLUMNS = {
  wallet_profiles: ["user_id", "email", "registered_in_pool"],
  vaults: ["user_id", "vault_ciphertext", "recovery_ciphertext", "kdf_name", "kdf_params"],
  notes: [
    "user_id",
    "commitment_hex",
    "encrypted_note_ciphertext",
    "status",
    "active_job_id",
    "spend_version",
    "last_chain_checked_at",
  ],
  jobs: ["user_id", "kind", "status", "progress"],
  spend_jobs: [
    "user_id",
    "status",
    "idempotency_key",
    "source_note_id",
    "active_commitment_hex",
    "completed_count",
    "lease_owner",
    "lease_expires_at",
    "last_heartbeat_at",
    "reconcile_after",
    "execution_mode",
    "execution_package_ciphertext",
    "execution_package_expires_at",
    "execution_package_deleted_at",
  ],
  spend_job_steps: [
    "job_id",
    "user_id",
    "ordinal",
    "recipient_address",
    "status",
    "tx_hash",
    "lease_owner",
    "lease_expires_at",
    "last_heartbeat_at",
  ],
  requests: ["requester_user_id", "amount_units", "status"],
  activity_events: ["user_id", "event_type", "event_data", "spend_job_id"],
  notification_inbox: [
    "user_id",
    "activity_event_id",
    "type",
    "severity",
    "entity_kind",
    "entity_id",
    "title",
    "read_at",
    "seen_at",
  ],
  public_transactions: [
    "user_id",
    "source_public_key",
    "destination_public_key",
    "kind",
    "asset_code",
    "amount_units",
    "tx_hash",
    "ledger",
    "status",
  ],
  market_pools: ["pool_id", "tree_depth", "deployment_ledger", "status"],
  prediction_markets: [
    "pool_id",
    "slug",
    "title",
    "status",
    "yes_total_units",
    "no_total_units",
  ],
  market_user_notes: [
    "user_id",
    "pool_id",
    "commitment_hex",
    "encrypted_note_ciphertext",
    "status",
  ],
  market_bets: [
    "user_id",
    "market_id",
    "market_slug",
    "idempotency_key",
    "outcome",
    "amount_units",
    "status",
    "escrow_encrypted_note_ciphertext",
    "change_amount_units",
    "encrypted_change_note_ciphertext",
  ],
  market_escrow_notes: ["market_id", "bet_id", "pool_id", "commitment_hex", "amount_units"],
  market_resolutions: ["market_id", "outcome", "resolver_email", "evidence_text"],
  market_payouts: [
    "market_id",
    "user_id",
    "amount_units",
    "status",
    "payout_commitment_hex",
    "encrypted_note_ciphertext",
    "leaf_index",
    "tx_hash",
    "source_escrow_note_id",
    "change_commitment_hex",
    "encrypted_change_note_ciphertext",
    "change_amount_units",
    "change_leaf_index",
  ],
  market_settlement_jobs: [
    "market_id",
    "status",
    "winning_outcome",
    "rounding_dust_units",
  ],
  market_activity_events: ["user_id", "market_id", "event_type", "event_data"],
};

export function findMissingTables(foundTables, expectedTables = EXPECTED_TABLES) {
  const found = new Set(foundTables);
  return expectedTables.filter((table) => !found.has(table));
}

export function findMissingColumns(foundColumns, expectedColumns = EXPECTED_COLUMNS) {
  const found = new Set(
    foundColumns.map((column) => `${column.table_name}.${column.column_name}`),
  );
  const missing = [];
  for (const [table, columns] of Object.entries(expectedColumns)) {
    for (const column of columns) {
      if (!found.has(`${table}.${column}`)) missing.push(`${table}.${column}`);
    }
  }
  return missing;
}

export async function readWalletV2Schema(client) {
  const tables = await client.query(
    `select table_name
     from information_schema.tables
     where table_schema = 'public' and table_name = any($1::text[])
     order by table_name`,
    [EXPECTED_TABLES],
  );
  const columns = await client.query(
    `select table_name, column_name
     from information_schema.columns
     where table_schema = 'public' and table_name = any($1::text[])
     order by table_name, column_name`,
    [EXPECTED_TABLES],
  );

  return {
    tables: tables.rows.map((row) => row.table_name),
    columns: columns.rows,
  };
}

export async function main(env = process.env) {
  loadMigrationEnv(env);
  const client = new pg.Client({ connectionString: getDirectDatabaseUrl(env) });
  await client.connect();
  try {
    const schema = await readWalletV2Schema(client);
    const missingTables = findMissingTables(schema.tables);
    const missingColumns = findMissingColumns(schema.columns);
    if (missingTables.length > 0 || missingColumns.length > 0) {
      throw new Error(
        `Wallet V2 schema incomplete: missing tables [${missingTables.join(", ")}], missing columns [${missingColumns.join(", ")}]`,
      );
    }
    console.log(`Verified Wallet V2 schema: ${schema.tables.length} tables`);
  } finally {
    await client.end();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
