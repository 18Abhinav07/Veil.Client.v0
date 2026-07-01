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
