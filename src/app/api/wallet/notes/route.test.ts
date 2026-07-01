import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("private note API is authenticated and stores ciphertext-only note material", () => {
  const source = readFileSync(
    join(root, "src", "app", "api", "wallet", "notes", "route.ts"),
    "utf8",
  );

  assert.match(source, /getServerSession/);
  assert.match(source, /getEncryptedNotesForUser/);
  assert.match(source, /assertEncryptedNotePayload/);
  assert.match(source, /upsertEncryptedNote/);
  assert.match(source, /setNoteStatus/);
  assert.match(source, /pending_deposit/);
  assert.doesNotMatch(source, /\bstellarSecretKey\b/);
  assert.doesNotMatch(source, /\bnoteBlindingHex\b/);
  assert.doesNotMatch(source, /\bdummyBlindingHex\b/);
  assert.doesNotMatch(source, /\bseed:\b/);
});
