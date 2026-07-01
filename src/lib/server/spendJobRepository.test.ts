import test from "node:test";
import assert from "node:assert/strict";

import {
  appendSpendJobEvent,
  claimNextRunnableSpendJobStep,
  createSpendJob,
  deleteSpendJobExecutionPackage,
  getSpendJobDetail,
  getNextBackgroundSpendJobCandidate,
  getLatestWalletEventId,
  listSpendJobEvents,
  lockSpendJobStep,
  markSpendJobNeedsReconcile,
  markSpendJobRetryableFailure,
  markSpendJobSubmitted,
  markSpendJobStepProofReady,
  markSpendJobStepProving,
  markSpendJobStepRelaying,
  storeSpendJobStepResult,
  updateSpendJobExecutionPackage,
  type QueryClient,
} from "./walletRepositoryCore";

interface RecordedQuery {
  text: string;
  values: unknown[] | undefined;
}

class RecordingDb implements QueryClient {
  readonly queries: RecordedQuery[] = [];
  requestRow: Record<string, unknown> | null = null;

  async query<Row>(text: string, values?: unknown[]) {
    this.queries.push({ text, values });
    if (/with next_step as/i.test(text)) {
      return {
        rows: [
          {
            id: "step-1",
            job_id: "job-1",
            user_id: "user-1",
            ordinal: 1,
            recipient_address: "GRECIPIENT1",
            amount_units: "1000000000",
            status: "proving",
            source_note_id: "note-1",
            source_commitment_hex: "active-commitment",
            source_amount_units: "3000000000",
            source_leaf_index: 42,
          } as Row,
        ],
        rowCount: 1,
      };
    }
    if (/^update spend_jobs/i.test(text.trim())) {
      return { rows: [{ id: "job-1", status: "running" } as Row], rowCount: 1 };
    }
    if (/from spend_jobs\s+where user_id = \$1 and idempotency_key = \$2/i.test(text)) {
      return { rows: [], rowCount: 0 };
    }
    if (/from notes/i.test(text)) {
      return {
        rows: [
          {
            id: "note-1",
            status: "unspent",
            commitment_hex: "commitment-1",
          } as Row,
        ],
        rowCount: 1,
      };
    }
    if (/from requests/i.test(text)) {
      return {
        rows: this.requestRow ? [this.requestRow as Row] : [],
        rowCount: this.requestRow ? 1 : 0,
      };
    }
    if (/insert into spend_jobs/i.test(text)) {
      return {
        rows: [
          {
            id: "job-1",
            status: "queued",
          } as Row,
        ],
        rowCount: 1,
      };
    }
    if (/from spend_jobs/i.test(text)) {
      return {
        rows: [
          {
            id: "job-1",
            status: "queued",
          } as Row,
        ],
        rowCount: 1,
      };
    }
    if (/from spend_job_steps/i.test(text)) {
      if (/select \*/i.test(text)) {
        return {
          rows: [
            {
              id: "step-1",
              job_id: "job-1",
              user_id: "user-1",
              ordinal: 1,
              recipient_address: "GRECIPIENT1",
              amount_units: "1000000000",
              status: "proving",
              source_note_id: "note-1",
              source_commitment_hex: "active-commitment",
              source_amount_units: "3000000000",
              source_leaf_index: 42,
            } as Row,
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    }
    return { rows: [{ id: "row-1", status: "queued" } as Row], rowCount: 1 };
  }

  combinedSql() {
    return this.queries.map((query) => query.text).join("\n");
  }

  last() {
    const query = this.queries.at(-1);
    assert.ok(query, "expected query");
    return query;
  }
}

test("spend job creation atomically locks the selected source note", async () => {
  const db = new RecordingDb();

  await createSpendJob(db, {
    userId: "user-1",
    idempotencyKey: "idem-1",
    sourceNoteId: "note-1",
    sourceCommitmentHex: "commitment-1",
    sourceAmountUnits: "3000000000",
    sourceLeafIndex: 42,
    poolId: "pool",
    totalAmountUnits: "2000000000",
    recipients: [
      { address: "GRECIPIENT1", amountUnits: "1000000000" },
      { address: "GRECIPIENT2", amountUnits: "1000000000" },
    ],
  });

  const sql = db.combinedSql();
  assert.match(sql, /begin/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /status = 'pending_spend'/i);
  assert.match(sql, /active_job_id/i);
  assert.match(sql, /spend_job_steps/i);
  assert.match(sql, /commit/i);
});

test("Lane 2 spend job creation stores recipient public keys and job kind", async () => {
  const db = new RecordingDb();

  await createSpendJob(db, {
    kind: "lane2_transfer",
    userId: "user-1",
    idempotencyKey: "lane2-idem-1",
    sourceNoteId: "note-1",
    sourceCommitmentHex: "commitment-1",
    sourceAmountUnits: "3000000000",
    sourceLeafIndex: 42,
    poolId: "pool",
    totalAmountUnits: "1000000000",
    recipients: [
      {
        address: "GRECIPIENT1",
        amountUnits: "1000000000",
        recipientUserId: "user-2",
        recipientHandle: "receiver",
        recipientNotePublicHex: "11".repeat(32),
        recipientX25519PublicHex: "22".repeat(32),
      },
    ],
  });

  const sql = db.combinedSql();
  assert.match(sql, /insert into spend_jobs/i);
  assert.match(sql, /\bkind\b/i);
  assert.match(sql, /insert into spend_job_steps/i);
  assert.match(sql, /recipient_user_id/i);
  assert.match(sql, /recipient_note_public_hex/i);
  assert.match(sql, /recipient_x25519_public_hex/i);
  assert.ok(
    db.queries.some((query) => query.values?.includes("lane2_transfer")),
    "expected lane2_transfer to be persisted",
  );
});

test("payment request spend jobs must pay the requester exactly", async () => {
  const db = new RecordingDb();
  db.requestRow = {
    id: "request-1",
    requester_user_id: "user-b",
    payer_user_id: "user-1",
    amount_units: "1000000000",
    status: "open",
    requester_bn254_public_hex: "11".repeat(32),
    requester_x25519_public_hex: "22".repeat(32),
  };

  await assert.rejects(
    () =>
      createSpendJob(db, {
        kind: "lane2_transfer",
        userId: "user-1",
        requestId: "request-1",
        idempotencyKey: "request-idem-1",
        sourceNoteId: "note-1",
        sourceCommitmentHex: "commitment-1",
        sourceAmountUnits: "3000000000",
        sourceLeafIndex: 42,
        poolId: "pool",
        totalAmountUnits: "1000000000",
        recipients: [
          {
            address: "GWRONGRECIPIENT",
            amountUnits: "1000000000",
            recipientUserId: "user-c",
            recipientHandle: "wrong-user",
            recipientNotePublicHex: "11".repeat(32),
            recipientX25519PublicHex: "22".repeat(32),
          },
        ],
      }),
    /Payment request recipient must match the requester/,
  );
});

test("payment request spend jobs must use the requester's current public keys", async () => {
  const db = new RecordingDb();
  db.requestRow = {
    id: "request-1",
    requester_user_id: "user-b",
    payer_user_id: "user-1",
    amount_units: "1000000000",
    status: "open",
    requester_bn254_public_hex: "aa".repeat(32),
    requester_x25519_public_hex: "bb".repeat(32),
  };

  await assert.rejects(
    () =>
      createSpendJob(db, {
        kind: "lane2_transfer",
        userId: "user-1",
        requestId: "request-1",
        idempotencyKey: "request-idem-2",
        sourceNoteId: "note-1",
        sourceCommitmentHex: "commitment-1",
        sourceAmountUnits: "3000000000",
        sourceLeafIndex: 42,
        poolId: "pool",
        totalAmountUnits: "1000000000",
        recipients: [
          {
            address: "GREQUESTER",
            amountUnits: "1000000000",
            recipientUserId: "user-b",
            recipientHandle: "requester",
            recipientNotePublicHex: "11".repeat(32),
            recipientX25519PublicHex: "22".repeat(32),
          },
        ],
      }),
    /Payment request recipient keys must match the requester/,
  );
});

test("spend job repository checkpoints tx hash before indexing can fail", async () => {
  const db = new RecordingDb();

  await lockSpendJobStep(db, {
    userId: "user-1",
    jobId: "job-1",
    stepId: "step-1",
  });
  await markSpendJobSubmitted(db, {
    userId: "user-1",
    jobId: "job-1",
    stepId: "step-1",
    txHash: "tx-submitted",
    outputCommitmentHex: "change-commitment",
    outputAmountUnits: "2000000000",
  });

  const sql = db.combinedSql();
  assert.match(sql, /status = 'relaying'/i);
  assert.match(sql, /status = 'submitted'/i);
  assert.match(sql, /tx_hash = \$4/i);
  assert.match(sql, /output_commitment_hex/i);
});

test("spend job step claim is sequential and bound to the active source note", async () => {
  const db = new RecordingDb();

  await claimNextRunnableSpendJobStep(db, {
    userId: "user-1",
    jobId: "job-1",
    sourceCommitmentHex: "active-commitment",
    sourceAmountUnits: "3000000000",
    sourceLeafIndex: 42,
  });

  const sql = db.combinedSql();
  assert.match(sql, /begin/i);
  assert.match(sql, /for update of s skip locked/i);
  assert.match(sql, /not exists\s*\(/i);
  assert.match(sql, /previous\.ordinal < s\.ordinal/i);
  assert.match(sql, /previous\.status <> 'confirmed'/i);
  assert.match(sql, /j\.active_commitment_hex = \$3/i);
  assert.match(sql, /s\.source_commitment_hex = \$3/i);
  assert.match(sql, /j\.status in \('queued', 'running', 'waiting_retry', 'paused_needs_unlock', 'failed_recoverable'\)/i);
  assert.match(sql, /s\.status in \('queued', 'retry_wait', 'proof_ready', 'proving', 'relaying'\)/i);
  assert.doesNotMatch(
    sql,
    /[^.]status in \('queued', 'retry_wait', 'proof_ready', 'proving', 'relaying'\)/i,
  );
  assert.match(sql, /s\.tx_hash is null/i);
  assert.match(sql, /relay_body = null/i);
  assert.match(sql, /commit/i);
});

test("spend job step claim writes a durable lease for the runner", async () => {
  const db = new RecordingDb();

  await claimNextRunnableSpendJobStep(db, {
    userId: "user-1",
    jobId: "job-1",
    sourceCommitmentHex: "active-commitment",
    sourceAmountUnits: "3000000000",
    sourceLeafIndex: 42,
    leaseOwner: "worker-a",
    leaseSeconds: 90,
  });

  const sql = db.combinedSql();
  assert.match(sql, /s\.status = 'proof_ready'/i);
  assert.match(
    sql,
    /s\.status = 'relaying'[\s\S]*?and s\.tx_hash is null[\s\S]*?and \(s\.lease_expires_at is null or s\.lease_expires_at <= now\(\)\)/i,
  );
  assert.match(sql, /s\.lease_expires_at <= now\(\)/i);
  assert.match(sql, /s\.status in \('queued', 'retry_wait'\) and s\.lease_expires_at is null/i);
  assert.match(sql, /lease_owner = \$6/i);
  assert.match(sql, /lease_expires_at = now\(\) \+ make_interval\(secs => \$7\)/i);
  assert.match(sql, /last_heartbeat_at = now\(\)/i);
  assert.match(sql, /update spend_jobs set\s+status = 'running'/i);
  assert.match(sql, /lease_owner = \$3/i);
  assert.match(sql, /lease_expires_at = now\(\) \+ make_interval\(secs => \$4\)/i);
  assert.ok(
    db.queries.some((query) => query.values?.includes("worker-a") && query.values?.includes(90)),
    "expected lease owner and lease duration to be bound",
  );
});

test("large background spend job stores only an encrypted execution package", async () => {
  const db = new RecordingDb();

  await createSpendJob(db, {
    userId: "user-1",
    idempotencyKey: "background-idem-1",
    sourceNoteId: "note-1",
    sourceCommitmentHex: "commitment-1",
    sourceAmountUnits: "6000000000",
    sourceLeafIndex: 42,
    poolId: "pool",
    totalAmountUnits: "6000000000",
    executionMode: "background",
    executionPackageCiphertext: "encrypted-worker-package",
    executionPackageExpiresAt: new Date("2026-07-01T00:00:00.000Z"),
    recipients: Array.from({ length: 6 }, () => ({
      address: "GRECIPIENT1",
      amountUnits: "1000000000",
    })),
  });

  const sql = db.combinedSql();
  assert.match(sql, /execution_mode/i);
  assert.match(sql, /execution_package_ciphertext/i);
  assert.match(sql, /execution_package_expires_at/i);
  assert.doesNotMatch(sql, /notePrivateKeyHex/i);
  assert.ok(
    db.queries.some((query) => query.values?.includes("background")),
    "expected background execution mode to be persisted",
  );
  assert.ok(
    db.queries.some((query) => query.values?.includes("encrypted-worker-package")),
    "expected encrypted package ciphertext to be persisted",
  );
});

test("background worker can select active packages and reclaim expired proving steps", async () => {
  const db = new RecordingDb();

  await getNextBackgroundSpendJobCandidate(db, { limit: 1 });

  const sql = db.combinedSql();
  assert.match(sql, /execution_mode = 'background'/i);
  assert.match(sql, /execution_package_ciphertext is not null/i);
  assert.match(sql, /execution_package_deleted_at is null/i);
  assert.match(sql, /execution_package_expires_at is not null/i);
  assert.doesNotMatch(sql, /execution_package_expires_at > now\(\)/i);
  assert.match(sql, /s\.status in \('queued', 'retry_wait', 'proof_ready', 'proving', 'relaying'\)/i);
  assert.match(sql, /s\.tx_hash is null/i);
  assert.match(sql, /s\.status = 'proof_ready'/i);
  assert.match(
    sql,
    /s\.status = 'relaying'[\s\S]*?and s\.tx_hash is null[\s\S]*?and \(s\.lease_expires_at is null or s\.lease_expires_at <= now\(\)\)/i,
  );
  assert.match(sql, /s\.lease_expires_at <= now\(\)/i);
  assert.match(sql, /s\.status in \('queued', 'retry_wait'\) and s\.lease_expires_at is null/i);
  assert.match(sql, /order by j\.created_at asc, s\.ordinal asc/i);
});

test("background worker rotates and deletes execution packages without exposing clear spend material", async () => {
  const db = new RecordingDb();

  await updateSpendJobExecutionPackage(db, {
    userId: "user-1",
    jobId: "job-1",
    encryptedPackageCiphertext: "encrypted-rotated-package",
    expiresAt: new Date("2026-07-01T00:00:00.000Z"),
  });
  await deleteSpendJobExecutionPackage(db, {
    userId: "user-1",
    jobId: "job-1",
    reason: "completed",
  });

  const sql = db.combinedSql();
  assert.match(sql, /execution_package_ciphertext = \$3/i);
  assert.match(sql, /execution_package_expires_at = \$4/i);
  assert.match(sql, /execution_package_deleted_at = null/i);
  assert.match(sql, /execution_package_ciphertext = null/i);
  assert.match(sql, /execution_package_deleted_at = now\(\)/i);
  assert.match(sql, /when \$3 = 'expired' then 'paused_needs_unlock'/i);
  assert.ok(
    db.queries.some((query) => query.values?.includes("spend_job_execution_package_deleted")),
    "expected package deletion event to be recorded",
  );
  assert.doesNotMatch(sql, /notePrivateKeyHex/i);
});

test("retryable failures become recoverable after bounded automatic retries", async () => {
  const db = new RecordingDb();

  await markSpendJobRetryableFailure(db, {
    userId: "user-1",
    jobId: "job-1",
    stepId: "step-1",
    errorClass: "network_fetch",
    errorMessage: "fetch failed",
    retryAfter: new Date("2026-07-01T00:00:00.000Z"),
  });

  const sql = db.combinedSql();
  assert.match(sql, /when \$6::timestamptz is null then 'failed_final'/i);
  assert.match(sql, /when attempts >= \$7 then 'failed_final'/i);
  assert.match(sql, /case\s+when failed_step\.status = 'failed_final' then 'failed_recoverable'\s+else 'waiting_retry'\s+end/i);
  assert.match(sql, /else \$6::timestamptz/i);
  assert.match(sql, /else \$5::timestamptz/i);
  assert.match(sql, /reconcile_after = case/i);
  assert.ok(
    db.queries.some((query) => query.values?.includes("spend_job_retry_wait")),
    "expected retry wait activity event to be persisted",
  );
  assert.ok(
    db.queries.some((query) => JSON.stringify(query.values).includes("maxAttempts")),
    "expected retry event payload to include the max attempt ceiling",
  );
});

test("spend job step transitions reject stale runner updates", async () => {
  const db = new RecordingDb();

  await markSpendJobStepProving(db, {
    userId: "user-1",
    jobId: "job-1",
    stepId: "step-1",
  });
  await markSpendJobStepProofReady(db, {
    userId: "user-1",
    jobId: "job-1",
    stepId: "step-1",
    relayBody: { ok: true },
    outputCommitmentHex: "change-commitment",
    outputAmountUnits: "2000000000",
  });
  await markSpendJobStepRelaying(db, {
    userId: "user-1",
    jobId: "job-1",
    stepId: "step-1",
  });
  await markSpendJobSubmitted(db, {
    userId: "user-1",
    jobId: "job-1",
    stepId: "step-1",
    txHash: "tx-submitted",
    outputCommitmentHex: "change-commitment",
    outputAmountUnits: "2000000000",
  });
  await markSpendJobNeedsReconcile(db, {
    userId: "user-1",
    jobId: "job-1",
    stepId: "step-1",
    errorClass: "already_spent_nullifier",
    errorMessage: "Contract #9",
  });
  await storeSpendJobStepResult(db, {
    userId: "user-1",
    jobId: "job-1",
    stepId: "step-1",
    sourceNoteId: "note-1",
    changeNote: {
      commitmentHex: "change-commitment",
      encryptedNoteCiphertext: "encrypted-change",
      amountUnits: "2000000000",
      leafIndex: 44,
      txHash: "tx-one",
    },
    isFinalStep: true,
  });

  const sql = db.combinedSql();
  assert.match(sql, /status in \('queued', 'retry_wait'\)/i);
  assert.match(sql, /status = 'proving'/i);
  assert.match(sql, /status = 'proof_ready'/i);
  assert.match(sql, /lease_owner = null/i);
  assert.match(sql, /lease_expires_at = null/i);
  assert.match(sql, /last_heartbeat_at = null/i);
  assert.match(sql, /status = 'relaying'/i);
  assert.match(sql, /status = 'submitted'/i);
  assert.match(sql, /status not in \('confirmed', 'failed_final'\)/i);
  assert.match(sql, /select count\(\*\) from spend_job_steps/i);
  assert.match(sql, /status = 'confirmed'\) = total_recipients/i);
});

test("already-spent failures move a job into reconciliation instead of retrying as queued", async () => {
  const db = new RecordingDb();

  await markSpendJobNeedsReconcile(db, {
    userId: "user-1",
    jobId: "job-1",
    stepId: "step-1",
    errorClass: "already_spent_nullifier",
    errorMessage: "Contract #9",
  });

  const sql = db.combinedSql();
  assert.match(sql, /needs_reconcile/i);
  assert.match(sql, /failed_recovery/i);
  assert.match(sql, /source_note_id/i);
  assert.doesNotMatch(sql, /status = 'queued'/i);
  const reconcileUpdate = db.queries.find((query) =>
    /update spend_job_steps set\s+status = 'needs_reconcile'/i.test(query.text),
  );
  assert.ok(reconcileUpdate);
  assert.deepEqual(reconcileUpdate.values?.slice(0, 4), [
    "user-1",
    "job-1",
    "step-1",
    "already_spent_nullifier",
  ]);
});

test("stored step result writes change note, marks source spent, and emits activity", async () => {
  const db = new RecordingDb();

  await storeSpendJobStepResult(db, {
    userId: "user-1",
    jobId: "job-1",
    stepId: "step-1",
    sourceNoteId: "note-1",
    changeNote: {
      commitmentHex: "change-commitment",
      encryptedNoteCiphertext: "encrypted-change",
      amountUnits: "2000000000",
      leafIndex: 44,
      txHash: "tx-one",
    },
    isFinalStep: false,
  });

  const sql = db.combinedSql();
  assert.match(sql, /insert into notes/i);
  assert.match(sql, /status\s*=\s*'spent'/i);
  assert.match(sql, /status = 'confirmed'/i);
  assert.match(sql, /activity_events/i);
  const confirmStep = db.queries.find((query) =>
    /update spend_job_steps set\s+status = 'confirmed'/i.test(query.text),
  );
  assert.ok(confirmStep, "expected confirmed step update");
  assert.match(confirmStep.text, /error_class = null/i);
  assert.match(confirmStep.text, /error_message = null/i);
});

test("stored background step keeps runnable package jobs running between recipients", async () => {
  const db = new RecordingDb();

  await storeSpendJobStepResult(db, {
    userId: "user-1",
    jobId: "job-1",
    stepId: "step-1",
    sourceNoteId: "note-1",
    changeNote: {
      commitmentHex: "change-commitment",
      encryptedNoteCiphertext: "encrypted-change",
      amountUnits: "2000000000",
      leafIndex: 44,
      txHash: "tx-one",
    },
    isFinalStep: false,
  });

  const updateJob = db.queries.find((query) =>
    /update spend_jobs set/i.test(query.text),
  );
  assert.ok(updateJob, "expected spend job update");
  assert.match(updateJob.text, /execution_mode = 'background'/i);
  assert.match(updateJob.text, /execution_package_ciphertext is not null/i);
  assert.match(updateJob.text, /then 'running'/i);
  assert.match(updateJob.text, /else 'paused_needs_unlock'/i);
});

test("stored Lane 2 result emits a recipient incoming-note notification", async () => {
  const db = new RecordingDb();

  await storeSpendJobStepResult(db, {
    userId: "user-1",
    jobId: "job-1",
    stepId: "step-1",
    sourceNoteId: "note-1",
    changeNote: {
      commitmentHex: "change-commitment",
      encryptedNoteCiphertext: "encrypted-change",
      amountUnits: "2000000000",
      leafIndex: 44,
      txHash: "tx-one",
    },
    recipientNote: {
      recipientUserId: "user-2",
      commitmentHex: "recipient-commitment",
      amountUnits: "1000000000",
      encryptedOutput: "encrypted-recipient-output",
      leafIndex: 45,
      txHash: "tx-one",
    },
    isFinalStep: true,
  });

  const sql = db.combinedSql();
  assert.match(sql, /insert into incoming_notes/i);
  assert.match(sql, /insert into notification_inbox/i);
  assert.match(sql, /recipient_user_id/i);
  assert.ok(
    db.queries.some((query) => query.values?.includes("user-2")),
    "expected recipient user id in notification write",
  );
  assert.ok(
    db.queries.some((query) => query.values?.includes("private_note_received")),
    "expected private_note_received to be written as a bound value",
  );
});

test("stored non-final change note casts active job id as uuid", async () => {
  const db = new RecordingDb();

  await storeSpendJobStepResult(db, {
    userId: "user-1",
    jobId: "11111111-1111-4111-8111-111111111111",
    stepId: "step-1",
    sourceNoteId: "note-1",
    changeNote: {
      commitmentHex: "change-commitment",
      encryptedNoteCiphertext: "encrypted-change",
      amountUnits: "2000000000",
      leafIndex: 44,
      txHash: "tx-one",
    },
    isFinalStep: false,
  });

  const insertChangeNote = db.queries.find((query) => /insert into notes/i.test(query.text));
  assert.ok(insertChangeNote, "expected change-note insert");
  assert.match(insertChangeNote.text, /null::uuid/i);
  assert.match(insertChangeNote.text, /\$7::uuid/i);
});

test("spend job history and events are queryable by user", async () => {
  const db = new RecordingDb();

  await getSpendJobDetail(db, { userId: "user-1", jobId: "job-1" });
  await getLatestWalletEventId(db, { userId: "user-1" });
  await appendSpendJobEvent(db, {
    userId: "user-1",
    jobId: "job-1",
    eventType: "spend_job_step_submitted",
    eventData: { stepId: "step-1" },
    txHash: "tx-one",
  });
  await listSpendJobEvents(db, { userId: "user-1", afterEventId: "event-1" });

  const sql = db.combinedSql();
  assert.match(sql, /spend_jobs/i);
  assert.match(sql, /spend_job_steps/i);
  assert.match(sql, /activity_events/i);
  assert.match(sql, /spend_job_id/i);
  assert.match(sql, /created_at asc/i);
  assert.match(sql, /created_at desc, id desc/i);
});
