import type { WalletSecrets } from "./vaultCrypto";

const NOTE_KDF_ITERATIONS = 160_000;
const AES_KEY_LENGTH_BITS = 256;

export interface PrivateNoteSecrets {
  blindingHex: string;
  commitmentHex: string;
  amountUnits: string;
  leafIndex: number | null;
  dummyBlindingHex: string;
  dummyCommitmentHex: string;
  createdAt: number;
}

export interface EncryptedPrivateNotePayload {
  version: 1;
  kdf: {
    name: "PBKDF2-SHA256";
    params: {
      iterations: number;
      salt: string;
      keyLengthBits: number;
    };
  };
  encryption: {
    name: "AES-GCM";
    iv: string;
    ciphertext: string;
  };
}

function getWebCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("WebCrypto subtle crypto is required for private notes");
  }
  return globalThis.crypto;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  getWebCrypto().getRandomValues(bytes);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let base64: string;
  if (typeof Buffer !== "undefined") {
    base64 = Buffer.from(bytes).toString("base64");
  } else {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    base64 = btoa(binary);
  }
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(padded, "base64"));
  }
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deriveNoteKey(input: {
  wallet: WalletSecrets;
  salt: Uint8Array;
  iterations: number;
}): Promise<CryptoKey> {
  const notePrivateKeyHex =
    input.wallet.bn254NotePrivateKeyHex ?? input.wallet.bn254NoteSecretHex;
  if (!notePrivateKeyHex) {
    throw new Error("Wallet is missing the private note key");
  }
  const baseKey = await getWebCrypto().subtle.importKey(
    "raw",
    new TextEncoder().encode(`spp:private-note:v1:${notePrivateKeyHex}`),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return getWebCrypto().subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(input.salt),
      iterations: input.iterations,
    },
    baseKey,
    { name: "AES-GCM", length: AES_KEY_LENGTH_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptPrivateNote(
  note: PrivateNoteSecrets,
  wallet: WalletSecrets,
): Promise<EncryptedPrivateNotePayload> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveNoteKey({
    wallet,
    salt,
    iterations: NOTE_KDF_ITERATIONS,
  });
  const plaintext = new TextEncoder().encode(JSON.stringify(note));
  const ciphertext = await getWebCrypto().subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    plaintext,
  );

  return {
    version: 1,
    kdf: {
      name: "PBKDF2-SHA256",
      params: {
        iterations: NOTE_KDF_ITERATIONS,
        salt: bytesToBase64Url(salt),
        keyLengthBits: AES_KEY_LENGTH_BITS,
      },
    },
    encryption: {
      name: "AES-GCM",
      iv: bytesToBase64Url(iv),
      ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    },
  };
}

export async function decryptPrivateNote(
  encrypted: EncryptedPrivateNotePayload,
  wallet: WalletSecrets,
): Promise<PrivateNoteSecrets> {
  try {
    const salt = base64UrlToBytes(encrypted.kdf.params.salt);
    const iv = base64UrlToBytes(encrypted.encryption.iv);
    const ciphertext = base64UrlToBytes(encrypted.encryption.ciphertext);
    const key = await deriveNoteKey({
      wallet,
      salt,
      iterations: encrypted.kdf.params.iterations,
    });
    const plaintext = await getWebCrypto().subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(ciphertext),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as PrivateNoteSecrets;
  } catch {
    throw new Error("Could not decrypt private note with this wallet");
  }
}
