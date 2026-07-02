import test from "node:test";
import assert from "node:assert/strict";

import {
  decryptBackgroundExecutionPackage,
  encryptBackgroundExecutionPackage,
  isBackgroundExecutionPackageExpired,
  type BackgroundSpendExecutionPackage,
} from "./backgroundExecutionPackage";

const keyHex = "11".repeat(32);

function packagePayload(): BackgroundSpendExecutionPackage {
  return {
    version: 1,
    userId: "user-1",
    jobId: "job-1",
    kind: "lane1_withdraw",
    expiresAt: "2026-07-01T00:00:00.000Z",
    notePrivateKeyHex: "aa".repeat(32),
    senderEncryptionPublicHex: "bb".repeat(32),
    membershipBlindingHex: "cc".repeat(32),
    activeNote: {
      blindingHex: "initial-blinding",
      commitmentHex: "initial-commitment",
      amountUnits: "6000000000",
      leafIndex: 42,
      dummyBlindingHex: "dummy-blinding",
      dummyCommitmentHex: "dummy-commitment",
      createdAt: 1780000000000,
    },
  };
}

test("background execution package can checkpoint a pending step for restart recovery", async () => {
  const payload: BackgroundSpendExecutionPackage = {
    ...packagePayload(),
    pendingStep: {
      stepId: "step-1",
      sourceNoteId: "note-1",
      sourceCommitmentHex: "initial-commitment",
      sourceAmountUnits: "6000000000",
      sourceLeafIndex: 42,
      changeNote: {
        blindingHex: "change-blinding",
        commitmentHex: "change-commitment",
        amountUnits: "5000000000",
        leafIndex: null,
        dummyBlindingHex: "next-dummy-blinding",
        dummyCommitmentHex: "next-dummy-commitment",
        createdAt: 1780000000001,
      },
      outputCommitmentHex: "change-commitment",
      outputAmountUnits: "5000000000",
      recipientOutputCommitmentHex: null,
      recipientEncryptedOutput: null,
      relayStartLedger: 3391000,
      createdAt: 1780000000002,
    },
  };

  const encrypted = await encryptBackgroundExecutionPackage(payload, {
    key: keyHex,
  });

  assert.doesNotMatch(JSON.stringify(encrypted), /change-blinding/);
  assert.deepEqual(
    await decryptBackgroundExecutionPackage(encrypted, { key: keyHex }),
    payload,
  );
});

test("background execution package encrypts spend material at rest", async () => {
  const encrypted = await encryptBackgroundExecutionPackage(packagePayload(), {
    key: keyHex,
  });

  assert.equal(encrypted.version, 1);
  assert.equal(encrypted.encryption.name, "AES-256-GCM");
  assert.doesNotMatch(JSON.stringify(encrypted), /notePrivateKeyHex/);
  assert.doesNotMatch(JSON.stringify(encrypted), /initial-blinding/);
  assert.doesNotMatch(JSON.stringify(encrypted), /aa{8}/i);

  const decrypted = await decryptBackgroundExecutionPackage(encrypted, {
    key: keyHex,
  });
  assert.deepEqual(decrypted, packagePayload());
});

test("background execution package rejects the wrong server key", async () => {
  const encrypted = await encryptBackgroundExecutionPackage(packagePayload(), {
    key: keyHex,
  });

  await assert.rejects(
    () =>
      decryptBackgroundExecutionPackage(encrypted, {
        key: "22".repeat(32),
      }),
    /Could not decrypt background execution package/,
  );
});

test("background execution package expiry is explicit", () => {
  const payload = packagePayload();

  assert.equal(
    isBackgroundExecutionPackageExpired(payload, new Date("2026-06-30T23:59:59.000Z")),
    false,
  );
  assert.equal(
    isBackgroundExecutionPackageExpired(payload, new Date("2026-07-01T00:00:00.001Z")),
    true,
  );
});
