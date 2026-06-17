import type { WalletVault } from "./vaultCrypto";

export interface StoredVaultPayload {
  vaultVersion: 2;
  vaultCiphertext: string;
  recoveryCiphertext: string;
  kdfName: WalletVault["kdfName"];
  kdfParams: WalletVault["kdfParams"];
  encryptionAlg: WalletVault["encryptionAlg"];
  publicKeys: WalletVault["publicKeys"];
}

export function serializeVaultForStorage(vault: WalletVault): StoredVaultPayload {
  return {
    vaultVersion: vault.vaultVersion,
    vaultCiphertext: vault.vaultCiphertext,
    recoveryCiphertext: vault.recoveryCiphertext,
    kdfName: vault.kdfName,
    kdfParams: vault.kdfParams,
    encryptionAlg: vault.encryptionAlg,
    publicKeys: vault.publicKeys,
  };
}

export function assertVaultStoragePayload(payload: unknown): asserts payload is StoredVaultPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Vault payload must be an object");
  }
  const record = payload as Record<string, unknown>;
  for (const key of [
    "recoveryKey",
    "stellarSecretKey",
    "bn254NoteSecretHex",
    "x25519PrivateJwk",
  ]) {
    if (key in record) {
      throw new Error(`Vault payload must not include ${key}`);
    }
  }
  if (record.vaultVersion !== 2) throw new Error("Vault version must be 2");
  if (typeof record.vaultCiphertext !== "string") {
    throw new Error("Vault payload requires vaultCiphertext");
  }
  if (typeof record.recoveryCiphertext !== "string") {
    throw new Error("Vault payload requires recoveryCiphertext");
  }
  if (record.kdfName !== "PBKDF2-SHA256") {
    throw new Error("Vault payload requires PBKDF2-SHA256 metadata");
  }
  if (!record.kdfParams || typeof record.kdfParams !== "object") {
    throw new Error("Vault payload requires kdfParams");
  }
  if (record.encryptionAlg !== "AES-256-GCM") {
    throw new Error("Vault payload requires AES-256-GCM metadata");
  }
}
