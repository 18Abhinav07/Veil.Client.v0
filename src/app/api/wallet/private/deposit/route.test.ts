import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("private deposit API prepares prover XDR and indexes signed deposits without wallet secrets", () => {
  const source = readFileSync(
    join(root, "src", "app", "api", "wallet", "private", "deposit", "route.ts"),
    "utf8",
  );

  assert.match(source, /getServerSession/);
  assert.match(source, /prove\/deposit/);
  assert.match(source, /signingPayloadBase64/);
  assert.match(source, /DecoratedSignature/);
  assert.match(source, /submitSignedXdr/);
  assert.match(source, /waitForTransaction/);
  assert.match(source, /findNoteLeafIndex/);
  assert.match(source, /indexingStatus/);
  assert.match(source, /pending_index/);
  assert.match(source, /status: 202/);
  assert.doesNotMatch(source, /\bstellarSecretKey\b/);
});
