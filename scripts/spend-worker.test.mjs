import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("spend worker script calls the internal tick endpoint with service auth", () => {
  const source = readFileSync(join(root, "scripts", "spend-worker.mjs"), "utf8");

  assert.match(source, /\/api\/internal\/spend-worker\/tick/);
  assert.match(source, /INTERNAL_SERVICE_AUTH_TOKEN/);
  assert.match(source, /WORKER_POLL_MS/);
  assert.match(source, /AbortSignal\.timeout/);
  assert.match(source, /Authorization/);
  assert.doesNotMatch(source, /notePrivateKeyHex/);
});
