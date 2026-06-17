import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { PrivateNoteSecrets } from "@/lib/noteCrypto";

export interface BackgroundSpendExecutionPackage {
  version: 1;
  userId: string;
  jobId: string;
  kind: "lane1_withdraw" | "lane2_transfer";
  expiresAt: string;
  notePrivateKeyHex: string;
  senderEncryptionPublicHex: string;
  membershipBlindingHex: string;
  activeNote: PrivateNoteSecrets;
}

export interface EncryptedBackgroundExecutionPackage {
  version: 1;
  encryption: {
    name: "AES-256-GCM";
    iv: string;
    ciphertext: string;
    tag: string;
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

export function decodeBackgroundExecutionKey(rawKey: string): Buffer {
  const key = rawKey.trim();
  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    return Buffer.from(key, "hex");
  }

  const decoded = base64UrlToBytes(key);
  if (decoded.length !== 32) {
    throw new Error("JOB_EXECUTION_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return decoded;
}

export function readBackgroundExecutionKey(env: {
  [key: string]: string | undefined;
} = process.env): string {
  const key = env.JOB_EXECUTION_ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new Error("JOB_EXECUTION_ENCRYPTION_KEY is required for background spend execution");
  }
  decodeBackgroundExecutionKey(key);
  return key;
}

export async function encryptBackgroundExecutionPackage(
  payload: BackgroundSpendExecutionPackage,
  input: { key: string },
): Promise<EncryptedBackgroundExecutionPackage> {
  const key = decodeBackgroundExecutionKey(input.key);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    version: 1,
    encryption: {
      name: "AES-256-GCM",
      iv: bytesToBase64Url(iv),
      ciphertext: bytesToBase64Url(ciphertext),
      tag: bytesToBase64Url(tag),
    },
  };
}

export async function decryptBackgroundExecutionPackage(
  encrypted: EncryptedBackgroundExecutionPackage,
  input: { key: string },
): Promise<BackgroundSpendExecutionPackage> {
  try {
    if (encrypted.version !== 1 || encrypted.encryption.name !== "AES-256-GCM") {
      throw new Error("Unsupported package");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      decodeBackgroundExecutionKey(input.key),
      base64UrlToBytes(encrypted.encryption.iv),
    );
    decipher.setAuthTag(base64UrlToBytes(encrypted.encryption.tag));
    const plaintext = Buffer.concat([
      decipher.update(base64UrlToBytes(encrypted.encryption.ciphertext)),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8")) as BackgroundSpendExecutionPackage;
  } catch {
    throw new Error("Could not decrypt background execution package");
  }
}

export function parseEncryptedBackgroundExecutionPackage(
  value: string,
): EncryptedBackgroundExecutionPackage {
  const parsed = JSON.parse(value) as EncryptedBackgroundExecutionPackage;
  if (parsed.version !== 1 || parsed.encryption?.name !== "AES-256-GCM") {
    throw new Error("Invalid background execution package");
  }
  return parsed;
}

export function isBackgroundExecutionPackageExpired(
  payload: Pick<BackgroundSpendExecutionPackage, "expiresAt">,
  now = new Date(),
): boolean {
  const expiry = new Date(payload.expiresAt);
  return Number.isNaN(expiry.getTime()) || expiry.getTime() <= now.getTime();
}
