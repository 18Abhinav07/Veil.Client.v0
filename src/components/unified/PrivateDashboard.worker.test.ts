import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("private dashboard submits large batches to the background worker instead of blocking them", () => {
  const source = readFileSync(
    join(root, "src", "components", "unified", "PrivateDashboard.tsx"),
    "utf8",
  );

  assert.match(source, /MAX_INTERACTIVE_RECIPIENTS/);
  assert.match(source, /backgroundConsent/);
  assert.match(source, /backgroundBatchPrompt/);
  assert.match(source, /executionPackage/);
  assert.match(source, /Send the batch to worker for async execution in an encrypted package/i);
  assert.match(source, /Send batch in background/);
  assert.match(source, /role="dialog"/);
  assert.doesNotMatch(source, /window\.confirm/);
  assert.doesNotMatch(source, /api\/internal\/spend-worker\/tick/);
  assert.doesNotMatch(source, /Background batch worker setup is required/);
});

test("private dashboard excludes active spend-job notes from new spend selection", () => {
  const source = readFileSync(
    join(root, "src", "components", "unified", "PrivateDashboard.tsx"),
    "utf8",
  );

  assert.match(source, /function isNoteSpendable/);
  assert.match(source, /!item\.row\.activeJobId/);
  assert.match(source, /notes\.filter\(isNoteSpendable\)/);
  assert.match(source, /markSelectedNoteLocked/);
  assert.match(source, /activeJobId: jobId/);
  assert.match(source, /status: "pending_spend"/);
});
