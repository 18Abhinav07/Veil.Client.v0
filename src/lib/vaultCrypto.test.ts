import test from "node:test";
import assert from "node:assert/strict";
import { Buffer as NodeBuffer } from "node:buffer";

import {
  createWalletVault,
  decryptVaultWithPassword,
  decryptVaultWithRecoveryKey,
  generateWalletSecrets,
  rotateVaultPassword,
} from "./vaultCrypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("wallet key generation creates Stellar, BN254 note, and X25519 encryption material client-side", async () => {
  const wallet = await generateWalletSecrets();

  assert.match(wallet.stellarPublicKey, /^G[A-Z0-9]{55}$/);
  assert.match(wallet.stellarSecretKey, /^S[A-Z0-9]{55}$/);
  assert.match(wallet.bn254NotePrivateKeyHex, /^[0-9a-f]{64}$/);
  assert.match(wallet.bn254PublicHex, /^[0-9a-f]{64}$/);
  assert.match(wallet.membershipBlindingHex, /^[0-9a-f]{64}$/);
  assert.match(wallet.x25519PublicHex, /^[0-9a-f]{64}$/);
  assert.equal(wallet.x25519PrivateJwk.kty, "OKP");
  assert.equal(wallet.x25519PrivateJwk.crv, "X25519");
  assert.ok(!("seed" in wallet), "production wallets must not expose seed");
  assert.ok(!("recipientSeed" in wallet), "production wallets must not expose recipientSeed");
});



test("wallet vault crypto avoids the browser-hostile Stellar SDK signing bundle", () => {
  const source = readFileSync(join(root, "src", "lib", "vaultCrypto.ts"), "utf8");
  assert.doesNotMatch(source, /@stellar\/stellar-sdk/);
  assert.doesNotMatch(source, /@stellar\/stellar-base/);
});

test("wallet vault base64url helpers do not require Node Buffer base64url encoding", async () => {
  const realBuffer = globalThis.Buffer;
  const fakeBuffer = {
    from(input: unknown, encoding?: BufferEncoding) {
      if (encoding === "base64url") {
        throw new TypeError("Unknown encoding: base64url");
      }
      const backing = NodeBuffer.from(input as never, encoding);
      const originalToString = backing.toString.bind(backing);
      backing.toString = ((nextEncoding?: BufferEncoding, start?: number, end?: number) => {
        if (nextEncoding === "base64url") {
          throw new TypeError("Unknown encoding: base64url");
        }
        return originalToString(nextEncoding, start, end);
      }) as typeof backing.toString;
      return backing;
    },
  } as unknown as typeof Buffer;

  Object.defineProperty(globalThis, "Buffer", {
    configurable: true,
    writable: true,
    value: fakeBuffer,
  });
  try {
    const vault = await createWalletVault({
      password: "browser buffer password",
      kdfIterations: 1000,
    });
    const unlocked = await decryptVaultWithPassword(
      vault,
      "browser buffer password",
    );

    assert.equal(unlocked.stellarPublicKey, vault.publicKeys.stellarPublicKey);
  } finally {
    Object.defineProperty(globalThis, "Buffer", {
      configurable: true,
      writable: true,
      value: realBuffer,
    });
  }
});

test("wallet vault decrypts with the wallet password and rejects a wrong password", async () => {
  const vault = await createWalletVault({
    password: "correct horse battery staple",
    kdfIterations: 1000,
  });

  const unlocked = await decryptVaultWithPassword(
    vault,
    "correct horse battery staple",
  );
  assert.equal(unlocked.stellarPublicKey, vault.publicKeys.stellarPublicKey);

  await assert.rejects(
    () => decryptVaultWithPassword(vault, "wrong password"),
    /decrypt wallet vault/i,
  );
});

test("wallet recovery key restores the same wallet secrets", async () => {
  const vault = await createWalletVault({
    password: "initial password",
    kdfIterations: 1000,
  });

  const byPassword = await decryptVaultWithPassword(vault, "initial password");
  const byRecovery = await decryptVaultWithRecoveryKey(vault, vault.recoveryKey);

  assert.deepEqual(byRecovery, byPassword);
});

test("wallet password rotation preserves wallet keys and invalidates the old password", async () => {
  const vault = await createWalletVault({
    password: "old password",
    kdfIterations: 1000,
  });
  const before = await decryptVaultWithPassword(vault, "old password");

  const rotated = await rotateVaultPassword(vault, {
    currentPassword: "old password",
    newPassword: "new password",
    kdfIterations: 1000,
  });

  await assert.rejects(
    () => decryptVaultWithPassword(rotated, "old password"),
    /decrypt wallet vault/i,
  );
  const after = await decryptVaultWithPassword(rotated, "new password");
  assert.deepEqual(after, before);

  const recoveryAfterRotation = await decryptVaultWithRecoveryKey(
    rotated,
    rotated.recoveryKey,
  );
  assert.deepEqual(recoveryAfterRotation, before);
});

test("wallet password rotation can use the recovery key when the old password is forgotten", async () => {
  const vault = await createWalletVault({
    password: "forgotten password",
    kdfIterations: 1000,
  });
  const before = await decryptVaultWithRecoveryKey(vault, vault.recoveryKey);

  const rotated = await rotateVaultPassword(vault, {
    recoveryKey: vault.recoveryKey,
    newPassword: "restored password",
    kdfIterations: 1000,
  });

  const after = await decryptVaultWithPassword(rotated, "restored password");
  assert.deepEqual(after, before);
});
