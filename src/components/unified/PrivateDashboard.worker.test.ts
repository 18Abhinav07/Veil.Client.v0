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
  assert.match(source, /The worker receives an encrypted package and Activity tracks each payment/i);
  assert.match(source, /Send batch in background/);
  assert.match(source, /role="dialog"/);
  assert.doesNotMatch(source, /window\.confirm/);
  assert.doesNotMatch(source, /api\/internal\/spend-worker\/tick/);
  assert.doesNotMatch(source, /Background batch worker setup is required/);
});

test("background batch approval dialog uses the clean white wallet card style", () => {
  const source = readFileSync(
    join(root, "src", "components", "unified", "PrivateDashboard.tsx"),
    "utf8",
  );
  const start = source.indexOf("{backgroundBatchPrompt && (");
  const end = source.indexOf("{interactiveSpendInFlight &&", start);
  const dialogSource = source.slice(start, end);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(dialogSource, /data-background-batch-dialog/);
  assert.match(dialogSource, /rounded-2xl border border-stone-200\/80 bg-white/);
  assert.match(dialogSource, /bg-stone-50\/70/);
  assert.match(dialogSource, /Keep this batch running while you leave the tab or continue in the wallet/);
  assert.doesNotMatch(dialogSource, /from-indigo|text-indigo|border-indigo|bg-gradient-to-br/);
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

test("private dashboard cannot keep a stale locked note selected for sending", () => {
  const source = readFileSync(
    join(root, "src", "components", "unified", "PrivateDashboard.tsx"),
    "utf8",
  );

  assert.match(source, /const selectedNote = useMemo/);
  assert.match(source, /liveNotes\.find\(\(item\) => item\.note\.commitmentHex === selectedCommitment\)/);
  assert.doesNotMatch(source, /notes\.find\(\(item\) => item\.note\.commitmentHex === selectedCommitment\)/);
});
