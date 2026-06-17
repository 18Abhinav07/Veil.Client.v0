import test from "node:test";
import assert from "node:assert/strict";

import type { RelayBody, WithdrawResponse } from "@/types";
import {
  AlreadySpentNullifierError,
  MAX_RETRYABLE_SPEND_ATTEMPTS,
  advanceSpendJob,
  classifySpendJobError,
  shouldRetrySpendJobFailure,
  type SpendJobAdvanceMaterial,
  type SpendJobAdvanceRepository,
} from "./spendJobEngine";

const relayBody = (label: string): RelayBody => ({
  poolId: "pool",
  proofUncompressedHex: `proof-${label}`,
  extData: {
    recipient: "GRECIPIENT",
    extAmount: -1,
    encryptedOutput0: [],
    encryptedOutput1: [],
  },
  public: {
    root: `root-${label}`,
    inputNullifiers: [`nullifier-${label}`],
    outputCommitment0: `out0-${label}`,
    outputCommitment1: `out1-${label}`,
    publicAmount: "0",
    extDataHashBe: [],
    aspMembershipRoot: "asp",
    aspNonMembershipRoot: "non-asp",
  },
});

function withdrawResponse(label: string): WithdrawResponse {
  return {
    changeNoteBlindingHex: `change-blinding-${label}`,
    changeNoteCommitmentHex: `change-commitment-${label}`,
    changeAmountUnits: "2000000000",
    nextDummyBlindingHex: `dummy-blinding-${label}`,
    nextDummyCommitmentHex: `dummy-commitment-${label}`,
    relayBody: relayBody(label),
  };
}

function spendMaterial(): SpendJobAdvanceMaterial {
  return {
    notePrivateKeyHex: "11".repeat(32),
    senderEncryptionPublicHex: "22".repeat(32),
    membershipBlindingHex: "33".repeat(32),
    noteBlindingHex: "initial-blinding",
    noteAmountUnits: "3000000000",
    noteLeafIndex: 42,
    dummyBlindingHex: "initial-dummy",
    encryptedChangeNoteCiphertext: "encrypted-change",
  };
}

function recordingRepo(events: string[] = []): SpendJobAdvanceRepository {
  return {
    async getNextRunnableStep() {
      events.push("get-step");
      return {
        job: {
          id: "job-1",
          userId: "user-1",
          poolId: "pool",
          status: "running",
        },
        step: {
          id: "step-1",
          ordinal: 1,
          recipientAddress: "GRECIPIENT",
          amountUnits: "1000000000",
          sourceNoteId: "note-1",
        },
      };
    },
    async markStepProving() {
      events.push("proving");
    },
    async markStepProofReady() {
      events.push("proof-ready");
    },
    async markStepRelaying() {
      events.push("relaying");
    },
    async markStepSubmitted(_input) {
      events.push(`submitted:${_input.txHash}`);
    },
    async storeStepResult(_input) {
      events.push(`stored:${_input.changeNote?.commitmentHex ?? "none"}`);
    },
    async markNeedsReconcile(_input) {
      events.push(`reconcile:${_input.errorClass}`);
    },
    async markRetryableFailure(_input) {
      events.push(`retry:${_input.errorClass}`);
    },
  };
}

test("classifies already-spent contract failures as reconciliation blockers", () => {
  assert.equal(
    classifySpendJobError(new Error("simulation rejected Error(Contract, #9)")),
    "already_spent_nullifier",
  );
  assert.equal(
    classifySpendJobError(
      new Error("simulation rejected: AlreadySpentNullifier"),
    ),
    "already_spent_nullifier",
  );
  assert.equal(
    classifySpendJobError(new Error("prover-api /prove/withdraw failed: 422 contracts_data_for_pool")),
    "prover_pool_state_lag",
  );
  assert.equal(
    classifySpendJobError(new Error('prover-api /prove/withdraw failed: 422 {"error":"asp_state"}')),
    "prover_pool_state_lag",
  );
  assert.equal(classifySpendJobError(new Error("fetch failed")), "network_fetch");
});

test("advanceSpendJob checkpoints tx hash and reconciles if indexing fails after submission", async () => {
  const events: string[] = [];

  await assert.rejects(
    () =>
      advanceSpendJob({
        userId: "user-1",
        jobId: "job-1",
        spendMaterial: spendMaterial(),
        repository: recordingRepo(events),
        proveWithdraw: async () => withdrawResponse("one"),
        relay: async () => ({ txHash: "tx-one" }),
        waitForTransaction: async () => {
          throw new Error("RPC range lag after submit");
        },
        findNoteLeafIndex: async () => 44,
      }),
    /RPC range lag/,
  );

  assert.deepEqual(events.slice(0, 5), [
    "get-step",
    "proving",
    "proof-ready",
    "relaying",
    "submitted:tx-one",
  ]);
  assert.equal(events.at(-1), "reconcile:network_fetch");
  assert.equal(events.some((event) => event.startsWith("retry:")), false);
});

test("advanceSpendJob stores confirmed change notes after indexing", async () => {
  const events: string[] = [];

  const result = await advanceSpendJob({
    userId: "user-1",
    jobId: "job-1",
    spendMaterial: spendMaterial(),
    repository: recordingRepo(events),
    proveWithdraw: async () => withdrawResponse("one"),
    relay: async () => ({ txHash: "tx-one" }),
    waitForTransaction: async () => 99,
    findNoteLeafIndex: async () => 44,
  });

  assert.equal(result.status, "stored");
  assert.equal(result.txHash, "tx-one");
  assert.equal(result.changeNoteCommitmentHex, "change-commitment-one");
  assert.equal(events.at(-1), "stored:change-commitment-one");
});

test("advanceSpendJob sends post-submit storage failures to reconciliation", async () => {
  const events: string[] = [];
  const repo = recordingRepo(events);
  repo.storeStepResult = async () => {
    events.push("store-failed");
    throw new Error('column "active_job_id" is of type uuid but expression is of type text');
  };

  await assert.rejects(
    () =>
      advanceSpendJob({
        userId: "user-1",
        jobId: "job-1",
        spendMaterial: spendMaterial(),
        repository: repo,
        proveWithdraw: async () => withdrawResponse("one"),
        relay: async () => ({ txHash: "tx-one" }),
        waitForTransaction: async () => 99,
        findNoteLeafIndex: async () => 44,
      }),
    /active_job_id/,
  );

  assert.ok(events.includes("submitted:tx-one"));
  assert.ok(events.includes("store-failed"));
  assert.equal(events.at(-1), "reconcile:unknown");
  assert.equal(events.some((event) => event.startsWith("retry:")), false);
});

test("advanceSpendJob sends Contract #9 to reconciliation and never stores a fake result", async () => {
  const events: string[] = [];

  await assert.rejects(
    () =>
      advanceSpendJob({
        userId: "user-1",
        jobId: "job-1",
        spendMaterial: spendMaterial(),
        repository: recordingRepo(events),
        proveWithdraw: async () => withdrawResponse("one"),
        relay: async () => {
          throw new Error("simulation rejected Error(Contract, #9)");
        },
        waitForTransaction: async () => 99,
        findNoteLeafIndex: async () => 44,
      }),
    AlreadySpentNullifierError,
  );

  assert.ok(events.includes("reconcile:already_spent_nullifier"));
  assert.equal(events.some((event) => event.startsWith("stored:")), false);
});

test("retryable failures are retried only while attempts remain and never after submission", () => {
  assert.equal(MAX_RETRYABLE_SPEND_ATTEMPTS, 3);
  assert.equal(
    shouldRetrySpendJobFailure({
      errorClass: "network_fetch",
      attempts: 1,
      submittedTxHash: null,
    }),
    true,
  );
  assert.equal(
    shouldRetrySpendJobFailure({
      errorClass: "network_fetch",
      attempts: MAX_RETRYABLE_SPEND_ATTEMPTS,
      submittedTxHash: null,
    }),
    false,
  );
  assert.equal(
    shouldRetrySpendJobFailure({
      errorClass: "network_fetch",
      attempts: 1,
      submittedTxHash: "tx-known",
    }),
    false,
  );
  assert.equal(
    shouldRetrySpendJobFailure({
      errorClass: "already_spent_nullifier",
      attempts: 1,
      submittedTxHash: null,
    }),
    false,
  );
});
