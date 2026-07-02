import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("spend job advance route supports Lane 2 transfer proof and incoming-note storage", () => {
  const source = readFileSync(
    join(
      root,
      "src",
      "app",
      "api",
      "wallet",
      "private",
      "spend-jobs",
      "[jobId]",
      "advance",
      "route.ts",
    ),
    "utf8",
  );

  assert.match(source, /prove\/transfer/);
  assert.match(source, /recipientNote/);
  assert.match(source, /recipientNotePublicHex/);
  assert.match(source, /recipientX25519PublicHex/);
  assert.match(source, /recipientOutputCommitmentHex/);
  assert.match(source, /recipientEncryptedOutput/);
  assert.match(source, /extAmount/);
  assert.doesNotMatch(source, /recipientSeed/);
});

test("server-side relay callers default to loopback IPv4 instead of ambiguous localhost", () => {
  const advanceRoute = readFileSync(
    join(
      root,
      "src",
      "app",
      "api",
      "wallet",
      "private",
      "spend-jobs",
      "[jobId]",
      "advance",
      "route.ts",
    ),
    "utf8",
  );
  const bulkWithdrawRoute = readFileSync(
    join(root, "src", "app", "api", "bulk-withdraw", "route.ts"),
    "utf8",
  );

  assert.match(advanceRoute, /http:\/\/127\.0\.0\.1:3000/);
  assert.doesNotMatch(advanceRoute, /http:\/\/localhost:3000/);
  assert.match(bulkWithdrawRoute, /http:\/\/127\.0\.0\.1:3000/);
  assert.doesNotMatch(bulkWithdrawRoute, /http:\/\/localhost:3000/);
});

test("spend job runners use shared server env fallback for prover relayer and worker keys", () => {
  const advanceRoute = readFileSync(
    join(
      root,
      "src",
      "app",
      "api",
      "wallet",
      "private",
      "spend-jobs",
      "[jobId]",
      "advance",
      "route.ts",
    ),
    "utf8",
  );
  const workerRoute = readFileSync(
    join(
      root,
      "src",
      "app",
      "api",
      "internal",
      "spend-worker",
      "tick",
      "route.ts",
    ),
    "utf8",
  );

  for (const source of [advanceRoute, workerRoute]) {
    assert.match(source, /getWalletServerEnv/);
    assert.match(source, /const SERVER_ENV = getWalletServerEnv\(\)/);
    assert.doesNotMatch(source, /const PROVER_API = process\.env\.PROVER_API_URL/);
    assert.doesNotMatch(source, /process\.env\.RELAYER_URL/);
  }
  assert.match(workerRoute, /SERVER_ENV\.JOB_EXECUTION_ENCRYPTION_KEY/);
  assert.doesNotMatch(workerRoute, /process\.env\.JOB_EXECUTION_ENCRYPTION_KEY/);
});

test("spend job advance route uses persisted attempt counts for retry decisions", () => {
  const source = readFileSync(
    join(
      root,
      "src",
      "app",
      "api",
      "wallet",
      "private",
      "spend-jobs",
      "[jobId]",
      "advance",
      "route.ts",
    ),
    "utf8",
  );

  assert.match(source, /attempts:\s*number/);
  assert.match(source, /attempts:\s*step\.attempts\s*\?\?\s*0/);
  assert.doesNotMatch(source, /attempts:\s*0,/);
});

test("spend job advance route can re-prove a lost proof-ready interactive step", () => {
  const source = readFileSync(
    join(
      root,
      "src",
      "app",
      "api",
      "wallet",
      "private",
      "spend-jobs",
      "[jobId]",
      "advance",
      "route.ts",
    ),
    "utf8",
  );

  assert.match(source, /resetProofReadySpendJobStepForReprove/);
  assert.match(source, /claimNextRunnableSpendJobStep[\s\S]*resetProofReadySpendJobStepForReprove[\s\S]*claimNextRunnableSpendJobStep/);
});

test("spend job submit route validates encrypted change note against the active proof", () => {
  const source = readFileSync(
    join(
      root,
      "src",
      "app",
      "api",
      "wallet",
      "private",
      "spend-jobs",
      "[jobId]",
      "advance",
      "route.ts",
    ),
    "utf8",
  );

  assert.match(source, /expectedOutputCommitmentHex/);
  assert.match(source, /Encrypted change note does not match the active proof/);
});

test("reconcile route stores Lane 2 recipient output after submitted transaction recovery", () => {
  const source = readFileSync(
    join(
      root,
      "src",
      "app",
      "api",
      "wallet",
      "private",
      "spend-jobs",
      "[jobId]",
      "reconcile",
      "route.ts",
    ),
    "utf8",
  );

  assert.match(source, /recipientOutputLeafIndex/);
  assert.match(source, /step\.recipient_output_commitment_hex/);
  assert.match(source, /step\.recipient_encrypted_output/);
  assert.match(source, /recipientNote:/);
  assert.match(source, /recipientUserId: step\.recipient_user_id/);
});

test("reconcile route treats already-completed jobs as idempotent success", () => {
  const source = readFileSync(
    join(
      root,
      "src",
      "app",
      "api",
      "wallet",
      "private",
      "spend-jobs",
      "[jobId]",
      "reconcile",
      "route.ts",
    ),
    "utf8",
  );

  assert.match(source, /alreadyComplete/);
  assert.match(source, /serializedDetail\.job\.status === "completed"/);
});
