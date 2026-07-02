import test from "node:test";
import assert from "node:assert/strict";

import type { RelayBody, TransferResponse, WithdrawResponse } from "@/types";
import type {
  BackgroundSpendExecutionPackage,
  EncryptedBackgroundExecutionPackage,
} from "./backgroundExecutionPackage";
import {
  advanceOneBackgroundSpendStep,
  type BackgroundSpendWorkerRepository,
} from "./backgroundSpendWorker";

const relayBody = (label: string): RelayBody => ({
  poolId: "pool",
  proofUncompressedHex: `proof-${label}`,
  extData: {
    recipient: "GRECIPIENT",
    extAmount: -1,
    encryptedOutput0: [1, 2, 3],
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
    changeAmountUnits: "5000000000",
    nextDummyBlindingHex: `next-dummy-blinding-${label}`,
    nextDummyCommitmentHex: `next-dummy-commitment-${label}`,
    relayBody: relayBody(label),
  };
}

function transferResponse(label: string): TransferResponse {
  return {
    recipientNoteBlindingHex: `recipient-blinding-${label}`,
    recipientNoteCommitmentHex: `recipient-commitment-${label}`,
    recipientAmountUnits: "1000000000",
    senderChangeBlindingHex: `sender-change-blinding-${label}`,
    senderChangeCommitmentHex: `sender-change-commitment-${label}`,
    senderChangeAmountUnits: "5000000000",
    relayBody: {
      ...relayBody(label),
      extData: {
        recipient: "pool",
        extAmount: 0,
        encryptedOutput0: [9, 8, 7],
        encryptedOutput1: [],
      },
    },
  };
}

function packagePayload(overrides: Partial<BackgroundSpendExecutionPackage> = {}): BackgroundSpendExecutionPackage {
  return {
    version: 1,
    userId: "user-1",
    jobId: "job-1",
    kind: "lane1_withdraw",
    expiresAt: "2026-07-01T00:00:00.000Z",
    notePrivateKeyHex: "11".repeat(32),
    senderEncryptionPublicHex: "22".repeat(32),
    membershipBlindingHex: "33".repeat(32),
    activeNote: {
      blindingHex: "active-blinding",
      commitmentHex: "active-commitment",
      amountUnits: "6000000000",
      leafIndex: 42,
      dummyBlindingHex: "dummy-blinding",
      dummyCommitmentHex: "dummy-commitment",
      createdAt: 1780000000000,
    },
    ...overrides,
  };
}

function encryptedPackage(label = "encrypted-package"): EncryptedBackgroundExecutionPackage {
  return {
    version: 1,
    encryption: {
      name: "AES-256-GCM",
      iv: `iv-${label}`,
      ciphertext: `ciphertext-${label}`,
      tag: `tag-${label}`,
    },
  };
}

function repository(events: string[] = []): BackgroundSpendWorkerRepository {
  return {
    async claimNextReconcilableBackgroundSpendJobStep() {
      events.push("reconcile-candidate");
      return null;
    },
    async getNextBackgroundSpendJobCandidate() {
      events.push("candidate");
      return {
        job: {
          id: "job-1",
          user_id: "user-1",
          kind: "lane1_withdraw",
          pool_id: "pool",
          execution_package_ciphertext: JSON.stringify(encryptedPackage()),
          execution_package_expires_at: new Date("2026-07-01T00:00:00.000Z"),
        },
      };
    },
    async claimNextRunnableSpendJobStep(input) {
      events.push(`claim:${input.leaseOwner}`);
      return {
        job: {
          id: "job-1",
          user_id: "user-1",
          kind: "lane1_withdraw",
          pool_id: "pool",
        },
        step: {
          id: "step-1",
          ordinal: 1,
          recipient_address: "GRECIPIENT",
          amount_units: "1000000000",
          source_note_id: "note-1",
          source_leaf_index: 42,
          recipient_user_id: null,
          recipient_handle: null,
          recipient_note_public_hex: null,
          recipient_x25519_public_hex: null,
        },
      };
    },
    async markSpendJobStepProofReady() {
      events.push("proof-ready");
    },
    async markSpendJobStepPrepared(input) {
      events.push(`prepared:${input.encryptedChangeNoteCiphertext}`);
    },
    async markSpendJobStepRelaying() {
      events.push("relaying");
    },
    async markSpendJobSubmitted(input) {
      events.push(`submitted:${input.txHash}`);
    },
    async storeSpendJobStepResult(input) {
      events.push(`stored:${input.changeNote?.commitmentHex ?? "none"}`);
      if (input.nextExecutionPackage) {
        events.push(`package-stored:${input.nextExecutionPackage.expiresAt.toISOString()}`);
      }
    },
    async updateSpendJobExecutionPackage(input) {
      events.push(`package-updated:${input.package.expiresAt}`);
    },
    async deleteSpendJobExecutionPackage() {
      events.push("package-deleted");
    },
    async markSpendJobRetryableFailure(input) {
      events.push(`retry:${input.errorClass}`);
    },
    async markSpendJobNeedsReconcile(input) {
      events.push(`reconcile:${input.errorClass}`);
    },
    async heartbeatSpendJobLease() {
      events.push("heartbeat");
    },
    async markSpendJobRecoveredSubmittedTx(input) {
      events.push(`recovered-tx:${input.txHash}`);
    },
  } as BackgroundSpendWorkerRepository;
}

test("background worker advances one Lane 1 step and rotates the encrypted package to the change note", async () => {
  const events: string[] = [];
  const encryptedPackages: BackgroundSpendExecutionPackage[] = [];
  const result = await advanceOneBackgroundSpendStep({
    now: new Date("2026-06-30T12:00:00.000Z"),
    leaseOwner: "worker-a",
    repository: repository(events),
    decryptPackage: async () => packagePayload(),
    encryptPackage: async (payload) => {
      encryptedPackages.push(payload);
      if (payload.pendingStep) {
        assert.equal(payload.activeNote.commitmentHex, "active-commitment");
        assert.equal(payload.pendingStep.outputCommitmentHex, "change-commitment-one");
        return encryptedPackage("prepared");
      }
      assert.equal(payload.activeNote.commitmentHex, "change-commitment-one");
      assert.equal(payload.activeNote.amountUnits, "5000000000");
      assert.equal(payload.activeNote.leafIndex, 44);
      assert.equal(payload.pendingStep, null);
      return encryptedPackage("rotated");
    },
    encryptChangeNote: async (note) => `encrypted-note:${note.commitmentHex}:${note.leafIndex}`,
    proveWithdraw: async () => withdrawResponse("one"),
    proveTransfer: async () => transferResponse("unused"),
    relay: async () => ({ txHash: "tx-one" }),
    waitForTransaction: async () => 99,
    findNoteLeafIndex: async () => 44,
  });

  assert.equal(result.status, "advanced");
  assert.equal(encryptedPackages.length, 2);
  assert.ok(events.includes("prepared:encrypted-note:change-commitment-one:null"));
  assert.ok(events.includes("submitted:tx-one"));
  assert.ok(events.includes("stored:change-commitment-one"));
  assert.ok(events.includes("package-stored:2026-07-01T00:00:00.000Z"));
  assert.ok(
    events.indexOf("prepared:encrypted-note:change-commitment-one:null") <
      events.indexOf("relaying"),
  );
});

test("background worker checks for reconcilable submitted work before claiming new work", async () => {
  const events: string[] = [];
  const repo = repository(events);
  repo.claimNextReconcilableBackgroundSpendJobStep = async () => {
    events.push("reconcile-candidate");
    return null;
  };

  await advanceOneBackgroundSpendStep({
    now: new Date("2026-06-30T12:00:00.000Z"),
    leaseOwner: "worker-a",
    repository: repo,
    decryptPackage: async () => packagePayload(),
    encryptPackage: async () => encryptedPackage("rotated"),
    encryptChangeNote: async (note) => `encrypted-note:${note.commitmentHex}:${note.leafIndex}`,
    proveWithdraw: async () => withdrawResponse("one"),
    proveTransfer: async () => transferResponse("unused"),
    relay: async () => ({ txHash: "tx-one" }),
    waitForTransaction: async () => 99,
    findNoteLeafIndex: async () => 44,
  });

  assert.equal(events[0], "reconcile-candidate");
  assert.equal(events[1], "candidate");
});

test("background worker recovers a prepared step from commitment events without relaying twice", async () => {
  const events: string[] = [];
  const pendingPackage = packagePayload({
    pendingStep: {
      stepId: "step-1",
      sourceNoteId: "note-1",
      sourceCommitmentHex: "active-commitment",
      sourceAmountUnits: "6000000000",
      sourceLeafIndex: 42,
      changeNote: {
        blindingHex: "change-blinding-one",
        commitmentHex: "change-commitment-one",
        amountUnits: "5000000000",
        leafIndex: null,
        dummyBlindingHex: "next-dummy-blinding-one",
        dummyCommitmentHex: "next-dummy-commitment-one",
        createdAt: 1780000000000,
      },
      outputCommitmentHex: "change-commitment-one",
      outputAmountUnits: "5000000000",
      recipientOutputCommitmentHex: null,
      recipientEncryptedOutput: null,
      relayStartLedger: 3391000,
      createdAt: 1780000000001,
    },
  });
  const repo = repository(events);
  repo.claimNextReconcilableBackgroundSpendJobStep = async () => {
    events.push("reconcile-candidate");
    return {
      job: {
        id: "job-1",
        user_id: "user-1",
        kind: "lane1_withdraw",
        pool_id: "pool",
        execution_package_ciphertext: JSON.stringify(encryptedPackage()),
        execution_package_expires_at: new Date("2026-07-01T00:00:00.000Z"),
      },
      step: {
        id: "step-1",
        ordinal: 1,
        recipient_address: "GRECIPIENT",
        amount_units: "1000000000",
        source_note_id: "note-1",
        source_leaf_index: 42,
        recipient_user_id: null,
        recipient_handle: null,
        recipient_note_public_hex: null,
        recipient_x25519_public_hex: null,
        status: "relaying",
        source_commitment_hex: "active-commitment",
        source_amount_units: "6000000000",
        relay_body: relayBody("one") as unknown as Record<string, unknown>,
        tx_hash: null,
        output_commitment_hex: "change-commitment-one",
        output_amount_units: "5000000000",
        output_leaf_index: null,
        encrypted_change_note_ciphertext: "encrypted-note:change-commitment-one:null",
        recipient_output_commitment_hex: null,
        recipient_output_leaf_index: null,
        recipient_encrypted_output: null,
      },
    };
  };

  const result = await advanceOneBackgroundSpendStep({
    now: new Date("2026-06-30T12:00:00.000Z"),
    leaseOwner: "worker-a",
    repository: repo,
    decryptPackage: async () => pendingPackage,
    encryptPackage: async (payload) => {
      assert.equal(payload.activeNote.commitmentHex, "change-commitment-one");
      assert.equal(payload.activeNote.leafIndex, 44);
      return encryptedPackage("rotated");
    },
    encryptChangeNote: async () => {
      throw new Error("prepared step already has encrypted change note");
    },
    proveWithdraw: async () => {
      throw new Error("recovery must not re-prove");
    },
    proveTransfer: async () => {
      throw new Error("recovery must not re-prove");
    },
    relay: async () => {
      throw new Error("recovery must not relay when commitment event has tx hash");
    },
    waitForTransaction: async (txHash) => {
      assert.equal(txHash, "tx-recovered");
      return 99;
    },
    findNoteLeafIndex: async () => {
      throw new Error("recovered commitment leaf should be reused");
    },
    findPoolCommitmentEvent: async (commitmentHex, startLedger) => {
      assert.equal(commitmentHex, "change-commitment-one");
      assert.equal(startLedger, 3391000);
      return { leafIndex: 44, ledger: 3391001, txHash: "tx-recovered" };
    },
  });

  assert.deepEqual(result, {
    status: "reconciled",
    jobId: "job-1",
    stepId: "step-1",
    txHash: "tx-recovered",
  });
  assert.ok(events.includes("recovered-tx:tx-recovered"));
  assert.ok(events.includes("stored:change-commitment-one"));
  assert.equal(events.includes("candidate"), false);
});

test("background worker deletes the package when the final step spends the note to zero", async () => {
  const events: string[] = [];
  const result = await advanceOneBackgroundSpendStep({
    now: new Date("2026-06-30T12:00:00.000Z"),
    leaseOwner: "worker-a",
    repository: repository(events),
    decryptPackage: async () => packagePayload(),
    encryptPackage: async () => encryptedPackage("unused"),
    encryptChangeNote: async (note) => `encrypted-note:${note.commitmentHex}`,
    proveWithdraw: async () => ({
      ...withdrawResponse("final"),
      changeAmountUnits: "0",
    }),
    proveTransfer: async () => transferResponse("unused"),
    relay: async () => ({ txHash: "tx-final" }),
    waitForTransaction: async () => 100,
    findNoteLeafIndex: async () => {
      throw new Error("no change note should be indexed");
    },
  });

  assert.equal(result.status, "advanced");
  assert.ok(events.includes("stored:none"));
  assert.equal(events.some((event) => event.startsWith("package-stored")), false);
});

test("background worker stores Lane 2 recipient output and keeps extAmount zero", async () => {
  const events: string[] = [];
  const repo = repository(events);
  repo.getNextBackgroundSpendJobCandidate = async () => ({
    job: {
      id: "job-1",
      user_id: "user-1",
      kind: "lane2_transfer",
      pool_id: "pool",
      execution_package_ciphertext: JSON.stringify(encryptedPackage()),
      execution_package_expires_at: new Date("2026-07-01T00:00:00.000Z"),
    },
  });
  repo.claimNextRunnableSpendJobStep = async () => ({
    job: {
      id: "job-1",
      user_id: "user-1",
      kind: "lane2_transfer",
      pool_id: "pool",
    },
    step: {
      id: "step-1",
      ordinal: 1,
      recipient_address: "GRECIPIENT",
      amount_units: "1000000000",
      source_note_id: "note-1",
      source_leaf_index: 42,
      recipient_user_id: "user-2",
      recipient_handle: "raptor",
      recipient_note_public_hex: "44".repeat(32),
      recipient_x25519_public_hex: "55".repeat(32),
    },
  });
  repo.storeSpendJobStepResult = async (input) => {
    assert.equal(input.recipientNote?.recipientUserId, "user-2");
    assert.equal(input.recipientNote?.commitmentHex, "recipient-commitment-two");
    events.push(`stored-recipient:${input.recipientNote?.leafIndex}`);
  };

  const result = await advanceOneBackgroundSpendStep({
    now: new Date("2026-06-30T12:00:00.000Z"),
    leaseOwner: "worker-a",
    repository: repo,
    decryptPackage: async () => packagePayload({ kind: "lane2_transfer" }),
    encryptPackage: async () => encryptedPackage("rotated"),
    encryptChangeNote: async (note) => `encrypted-note:${note.commitmentHex}`,
    proveWithdraw: async () => withdrawResponse("unused"),
    proveTransfer: async (body) => {
      assert.equal((body as { transferAmountUnits: string }).transferAmountUnits, "1000000000");
      return transferResponse("two");
    },
    relay: async (relayBody) => {
      assert.equal(relayBody.extData.extAmount, 0);
      return { txHash: "tx-two" };
    },
    waitForTransaction: async () => 101,
    findNoteLeafIndex: async (commitment) =>
      commitment === "recipient-commitment-two" ? 45 : 46,
  });

  assert.equal(result.status, "advanced");
  assert.ok(events.includes("stored-recipient:45"));
});

test("background worker refuses expired packages before claiming a spend step", async () => {
  const events: string[] = [];
  const repo = repository(events);

  const result = await advanceOneBackgroundSpendStep({
    now: new Date("2026-07-02T00:00:00.000Z"),
    leaseOwner: "worker-a",
    repository: repo,
    decryptPackage: async () => packagePayload(),
    encryptPackage: async () => encryptedPackage("unused"),
    encryptChangeNote: async () => "encrypted-note",
    proveWithdraw: async () => withdrawResponse("unused"),
    proveTransfer: async () => transferResponse("unused"),
    relay: async () => ({ txHash: "tx-unused" }),
    waitForTransaction: async () => 99,
    findNoteLeafIndex: async () => 44,
  });

  assert.equal(result.status, "expired");
  assert.deepEqual(events, ["reconcile-candidate", "candidate", "package-deleted"]);
});

test("background worker moves post-submit indexing failures to reconcile, not retry", async () => {
  const events: string[] = [];

  await assert.rejects(
    () =>
      advanceOneBackgroundSpendStep({
        now: new Date("2026-06-30T12:00:00.000Z"),
        leaseOwner: "worker-a",
        repository: repository(events),
        decryptPackage: async () => packagePayload(),
        encryptPackage: async () => encryptedPackage("unused"),
        encryptChangeNote: async () => "encrypted-note",
        proveWithdraw: async () => withdrawResponse("one"),
        proveTransfer: async () => transferResponse("unused"),
        relay: async () => ({ txHash: "tx-one" }),
        waitForTransaction: async () => {
          throw new Error("startLedger must be within the ledger range");
        },
        findNoteLeafIndex: async () => 44,
      }),
    /ledger range/,
  );

  assert.ok(events.includes("submitted:tx-one"));
  assert.equal(events.at(-1), "reconcile:network_fetch");
  assert.equal(events.some((event) => event.startsWith("retry:")), false);
});
