import test from "node:test";
import assert from "node:assert/strict";

import { createWalletVault } from "./vaultCrypto";
import {
  assertVaultStoragePayload,
  serializeVaultForStorage,
} from "./vaultStorage";

test("vault storage payload excludes recovery key and clear wallet secrets", async () => {
  const vault = await createWalletVault({
    password: "wallet password",
    kdfIterations: 1000,
  });
  const payload = serializeVaultForStorage(vault);
  const serialized = JSON.stringify(payload);

  assert.equal("recoveryKey" in payload, false);
  assert.doesNotMatch(serialized, /stellarSecretKey/);
  assert.doesNotMatch(serialized, /bn254NoteSecretHex/);
  assert.doesNotMatch(serialized, /x25519PrivateJwk/);
  assert.match(serialized, /vaultCiphertext/);
  assert.match(serialized, /recoveryCiphertext/);
});

test("vault storage validator rejects cleartext secret fields", () => {
  assert.throws(
    () =>
      assertVaultStoragePayload({
        vaultVersion: 2,
        vaultCiphertext: "ciphertext",
        recoveryCiphertext: "ciphertext",
        kdfName: "PBKDF2-SHA256",
        kdfParams: { keyLengthBits: 256 },
        encryptionAlg: "AES-256-GCM",
        recoveryKey: "should-stay-client-side",
      }),
    /recoveryKey/,
  );
});
