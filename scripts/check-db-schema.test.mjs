import test from "node:test";
import assert from "node:assert/strict";

import {
  EXPECTED_TABLES,
  findMissingColumns,
  findMissingTables,
} from "./check-db-schema.mjs";

test("schema check reports missing Wallet V2 tables", () => {
  const missing = findMissingTables(["users", "accounts"]);
  assert.ok(missing.includes("vaults"));
  assert.ok(missing.includes("notes"));
});

test("schema check passes when every expected Wallet V2 table exists", () => {
  assert.deepEqual(findMissingTables(EXPECTED_TABLES), []);
});

test("schema check reports missing required encrypted-storage columns", () => {
  const missing = findMissingColumns([
    { table_name: "vaults", column_name: "vault_ciphertext" },
    { table_name: "notes", column_name: "encrypted_note_ciphertext" },
  ]);

  assert.ok(missing.includes("vaults.recovery_ciphertext"));
  assert.ok(missing.includes("wallet_profiles.registered_in_pool"));
});

test("schema check requires market payout recovery columns before deploy", () => {
  const missing = findMissingColumns([
    { table_name: "market_payouts", column_name: "market_id" },
    { table_name: "market_payouts", column_name: "user_id" },
    { table_name: "market_payouts", column_name: "amount_units" },
    { table_name: "market_payouts", column_name: "status" },
    { table_name: "market_payouts", column_name: "payout_commitment_hex" },
    { table_name: "market_payouts", column_name: "encrypted_note_ciphertext" },
    { table_name: "market_payouts", column_name: "leaf_index" },
    { table_name: "market_payouts", column_name: "tx_hash" },
  ]);

  assert.ok(missing.includes("market_payouts.source_escrow_note_id"));
  assert.ok(missing.includes("market_payouts.change_commitment_hex"));
  assert.ok(missing.includes("market_payouts.encrypted_change_note_ciphertext"));
  assert.ok(missing.includes("market_payouts.change_amount_units"));
  assert.ok(missing.includes("market_payouts.change_leaf_index"));
});

test("schema check requires market bet recovery columns before deploy", () => {
  const missing = findMissingColumns([
    { table_name: "market_bets", column_name: "user_id" },
    { table_name: "market_bets", column_name: "market_id" },
    { table_name: "market_bets", column_name: "market_slug" },
    { table_name: "market_bets", column_name: "idempotency_key" },
    { table_name: "market_bets", column_name: "outcome" },
    { table_name: "market_bets", column_name: "amount_units" },
    { table_name: "market_bets", column_name: "status" },
  ]);

  assert.ok(missing.includes("market_bets.escrow_encrypted_note_ciphertext"));
  assert.ok(missing.includes("market_bets.change_amount_units"));
  assert.ok(missing.includes("market_bets.encrypted_change_note_ciphertext"));
});
