import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("wallet vault API is authenticated and stores ciphertext-only payloads", () => {
  const source = readFileSync(
    join(root, "src", "app", "api", "wallet", "vault", "route.ts"),
    "utf8",
  );

  assert.match(source, /getServerSession/);
  assert.match(source, /assertVaultStoragePayload/);
  assert.match(source, /saveEncryptedVault/);
  assert.match(source, /deleteEncryptedVault/);
  assert.match(source, /vaultCiphertext/);
  assert.match(source, /recoveryCiphertext/);
  assert.doesNotMatch(source, /recoveryKey/);
  assert.doesNotMatch(source, /stellarSecretKey/);
  assert.doesNotMatch(source, /bn254NoteSecretHex/);
  assert.doesNotMatch(source, /x25519PrivateJwk/);
});
