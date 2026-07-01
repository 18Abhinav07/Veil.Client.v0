import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("spend jobs API preserves Lane 2 job kind and recipient public key fields", () => {
  const source = readFileSync(
    join(root, "src", "app", "api", "wallet", "private", "spend-jobs", "route.ts"),
    "utf8",
  );

  assert.match(source, /kind/);
  assert.match(source, /lane2_transfer/);
  assert.match(source, /recipientUserId/);
  assert.match(source, /recipientHandle/);
  assert.match(source, /recipientNotePublicHex/);
  assert.match(source, /recipientX25519PublicHex/);
  assert.match(source, /createSpendJob/);
  assert.doesNotMatch(source, /recipientSeed/);
});

test("spend jobs API encrypts worker approval packages server-side for large batches", () => {
  const source = readFileSync(
    join(root, "src", "app", "api", "wallet", "private", "spend-jobs", "route.ts"),
    "utf8",
  );

  assert.match(source, /MAX_INTERACTIVE_RECIPIENTS/);
  assert.match(source, /backgroundConsent/);
  assert.match(source, /executionPackage/);
  assert.match(source, /encryptBackgroundExecutionPackage/);
  assert.match(source, /JOB_EXECUTION_ENCRYPTION_KEY/);
  assert.match(source, /recipients\.length > MAX_INTERACTIVE_RECIPIENTS/);
  assert.match(source, /Send the batch to worker for async execution in an encrypted package/i);
  assert.match(source, /const useBackgroundWorker = recipients\.length > MAX_INTERACTIVE_RECIPIENTS/);
  assert.match(source, /executionMode:\s+useBackgroundWorker \? "background" : "interactive"/);
  assert.doesNotMatch(source, /executionPackageCiphertext\s*=\s*readString\(payload\.executionPackageCiphertext\)/);
});
