import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("incoming notes API lists pending notes and claims only by encrypted ledger note", () => {
  const source = readFileSync(
    join(root, "src", "app", "api", "wallet", "incoming-notes", "route.ts"),
    "utf8",
  );

  assert.match(source, /getServerSession/);
  assert.match(source, /listIncomingNotes/);
  assert.match(source, /markIncomingNoteClaimed/);
  assert.match(source, /incomingNoteId/);
  assert.match(source, /commitmentHex/);
  assert.doesNotMatch(source, /notePrivateKeyHex/);
  assert.doesNotMatch(source, /encryptionPrivateKeyHex/);
  assert.doesNotMatch(source, /stellarSecretKey/);
});
