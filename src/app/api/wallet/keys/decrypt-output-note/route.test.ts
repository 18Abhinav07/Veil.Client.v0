import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("decrypt output note key route proxies transient recipient keys to prover-api", () => {
  const source = readFileSync(
    join(root, "src", "app", "api", "wallet", "keys", "decrypt-output-note", "route.ts"),
    "utf8",
  );

  assert.match(source, /getServerSession/);
  assert.match(source, /keys\/decrypt-output-note/);
  assert.match(source, /notePrivateKeyHex/);
  assert.match(source, /encryptionPrivateKeyHex/);
  assert.match(source, /encryptedOutput/);
  assert.doesNotMatch(source, /getPgPool/);
  assert.doesNotMatch(source, /upsertEncryptedNote/);
  assert.doesNotMatch(source, /saveIncomingNote/);
});
