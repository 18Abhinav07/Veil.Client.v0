import test from "node:test";
import assert from "node:assert/strict";

import { serializeSpendJobDetail } from "./spendJobSerialization";
import type { SpendJobDetail, SpendJobRow, SpendJobStepRow } from "./walletRepositoryCore";

function job(overrides: Partial<SpendJobRow> = {}): SpendJobRow {
  return {
    id: "job-1",
    user_id: "user-1",
    request_id: null,
    kind: "lane1_withdraw",
    status: "completed",
    idempotency_key: "idem-1",
    source_note_id: "note-1",
    source_commitment_hex: "source",
    source_amount_units: "2000000000",
    source_leaf_index: 10,
    active_note_id: "note-active",
    active_commitment_hex: "active",
    active_amount_units: "1000000000",
    active_leaf_index: 20,
    pool_id: "pool",
    total_amount_units: "1000000000",
    total_recipients: 6,
    completed_count: 6,
    retry_after: null,
    error_class: null,
    error_message: null,
    lease_token: null,
    lease_owner: null,
    lease_expires_at: null,
    last_heartbeat_at: null,
    reconcile_after: null,
    execution_mode: "interactive",
    execution_package_ciphertext: null,
    execution_package_expires_at: null,
    execution_package_deleted_at: null,
    created_at: new Date("2026-06-29T00:00:00Z"),
    updated_at: new Date("2026-06-29T00:00:00Z"),
    ...overrides,
  };
}

function step(ordinal: number, status: SpendJobStepRow["status"]): SpendJobStepRow {
  return {
    id: `step-${ordinal}`,
    job_id: "job-1",
    user_id: "user-1",
    ordinal,
    recipient_address: "GRECIPIENT",
    amount_units: "100000000",
    status,
    source_note_id: "note-1",
    source_commitment_hex: "source",
    source_amount_units: "2000000000",
    source_leaf_index: 10,
    input_nullifier_hex: null,
    relay_body: null,
    tx_hash: status === "confirmed" ? `tx-${ordinal}` : null,
    output_commitment_hex: null,
    output_amount_units: null,
    output_leaf_index: status === "confirmed" ? ordinal : null,
    encrypted_change_note_ciphertext: null,
    recipient_user_id: null,
    recipient_handle: null,
    recipient_note_public_hex: null,
    recipient_x25519_public_hex: null,
    recipient_output_commitment_hex: null,
    recipient_output_leaf_index: null,
    recipient_encrypted_output: null,
    attempts: 1,
    error_class: status === "needs_reconcile" ? "already_spent_nullifier" : null,
    error_message: status === "needs_reconcile" ? "Contract #9" : null,
    retry_after: null,
    lease_owner: null,
    lease_expires_at: null,
    last_heartbeat_at: null,
    created_at: new Date("2026-06-29T00:00:00Z"),
    updated_at: new Date("2026-06-29T00:00:00Z"),
  };
}

test("spend job serialization repairs impossible completed rows with reconcile steps", () => {
  const detail: SpendJobDetail = {
    job: job(),
    steps: [
      step(1, "confirmed"),
      step(2, "needs_reconcile"),
      step(3, "confirmed"),
      step(4, "confirmed"),
      step(5, "confirmed"),
      step(6, "confirmed"),
    ],
  };

  const serialized = serializeSpendJobDetail(detail);

  assert.equal(serialized.job.status, "needs_reconcile");
  assert.equal(serialized.job.completedCount, 5);
  assert.equal(serialized.job.errorClass, "already_spent_nullifier");
  assert.match(serialized.job.errorMessage ?? "", /Contract #9/);
});

test("spend job serialization includes Lane 2 recipient output metadata", () => {
  const detail: SpendJobDetail = {
    job: job({ kind: "lane2_transfer" }),
    steps: [
      {
        ...step(1, "confirmed"),
        recipient_user_id: "user-2",
        recipient_handle: "receiver",
        recipient_note_public_hex: "11".repeat(32),
        recipient_x25519_public_hex: "22".repeat(32),
        recipient_output_commitment_hex: "0xrecipient",
        recipient_output_leaf_index: 77,
        recipient_encrypted_output: "{\"ciphertext\":\"encrypted\"}",
      },
    ],
  };

  const serialized = serializeSpendJobDetail(detail);

  assert.equal(serialized.job.kind, "lane2_transfer");
  assert.equal(serialized.steps[0].recipientUserId, "user-2");
  assert.equal(serialized.steps[0].recipientHandle, "receiver");
  assert.equal(serialized.steps[0].recipientOutputCommitmentHex, "0xrecipient");
  assert.equal(serialized.steps[0].recipientOutputLeafIndex, 77);
  assert.equal(serialized.steps[0].recipientEncryptedOutput, "{\"ciphertext\":\"encrypted\"}");
});
