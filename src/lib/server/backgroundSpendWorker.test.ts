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
    async markSpendJobStepRelaying() {
      events.push("relaying");
    },
    async markSpendJobSubmitted(input) {
      events.push(`submitted:${input.txHash}`);
    },
    async storeSpendJobStepResult(input) {
      events.push(`stored:${input.changeNote?.commitmentHex ?? "none"}`);
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
  };
}

test("background worker advances one Lane 1 step and rotates the encrypted package to the change note", async () => {
  const events: string[] = [];
  const result = await advanceOneBackgroundSpendStep({
    now: new Date("2026-06-30T12:00:00.000Z"),
    leaseOwner: "worker-a",
    repository: repository(events),
    decryptPackage: async () => packagePayload(),
    encryptPackage: async (payload) => {
      assert.equal(payload.activeNote.commitmentHex, "change-commitment-one");
      assert.equal(payload.activeNote.amountUnits, "5000000000");
      assert.equal(payload.activeNote.leafIndex, 44);
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
  assert.deepEqual(events, [
    "candidate",
    "claim:worker-a",
    "proof-ready",
    "relaying",
    "submitted:tx-one",
    "stored:change-commitment-one",
    "package-updated:2026-07-01T00:00:00.000Z",
  ]);
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
  assert.ok(events.includes("package-deleted"));
  assert.equal(events.some((event) => event.startsWith("package-updated")), false);
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
  assert.deepEqual(events, ["candidate", "package-deleted"]);
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
