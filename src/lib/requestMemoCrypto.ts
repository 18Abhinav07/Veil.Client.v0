import type { WalletSecrets } from "./vaultCrypto";

export interface RequestMemoPlaintext {
  title: string;
  details: string;
  createdAt: string;
}

interface RequestMemoCopy {
  ephemeralPublicHex: string;
  iv: string;
  ciphertext: string;
}

export interface EncryptedRequestMemoEnvelope {
  version: 1;
  kind: "veil-request-memo";
  encryption: "X25519-AES-GCM";
  copies: {
    requester: RequestMemoCopy;
    payer: RequestMemoCopy;
  };
}

function getWebCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("WebCrypto subtle crypto is required for request memos");
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

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim().replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("X25519 public key must be 32-byte hex");
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
  }
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

async function importPublicKey(publicHex: string): Promise<CryptoKey> {
  return getWebCrypto().subtle.importKey(
    "raw",
    toArrayBuffer(hexToBytes(publicHex)),
    { name: "X25519" } as AlgorithmIdentifier,
    false,
    [],
  );
}

async function importPrivateKey(privateJwk: JsonWebKey): Promise<CryptoKey> {
  return getWebCrypto().subtle.importKey(
    "jwk",
    privateJwk,
    { name: "X25519" } as AlgorithmIdentifier,
    false,
    ["deriveBits"],
  );
}

async function deriveAesKey(input: {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}): Promise<CryptoKey> {
  const sharedBits = await getWebCrypto().subtle.deriveBits(
    { name: "X25519", public: input.publicKey } as unknown as AlgorithmIdentifier,
    input.privateKey,
    256,
  );
  return getWebCrypto().subtle.importKey(
    "raw",
    sharedBits,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptCopy(memo: RequestMemoPlaintext, recipientPublicHex: string): Promise<RequestMemoCopy> {
  const ephemeral = (await getWebCrypto().subtle.generateKey(
    { name: "X25519" } as AlgorithmIdentifier,
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const recipientPublic = await importPublicKey(recipientPublicHex);
  const key = await deriveAesKey({
    privateKey: ephemeral.privateKey,
    publicKey: recipientPublic,
  });
  const iv = randomBytes(12);
  const plaintext = new TextEncoder().encode(JSON.stringify(memo));
  const ciphertext = await getWebCrypto().subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    plaintext,
  );
  const ephemeralPublic = await getWebCrypto().subtle.exportKey("raw", ephemeral.publicKey);
  return {
    ephemeralPublicHex: bytesToHex(new Uint8Array(ephemeralPublic)),
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
}

async function decryptCopy(copy: RequestMemoCopy, wallet: WalletSecrets): Promise<RequestMemoPlaintext> {
  const privateKey = await importPrivateKey(wallet.x25519PrivateJwk);
  const publicKey = await importPublicKey(copy.ephemeralPublicHex);
  const key = await deriveAesKey({ privateKey, publicKey });
  const plaintext = await getWebCrypto().subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(base64UrlToBytes(copy.iv)) },
    key,
    toArrayBuffer(base64UrlToBytes(copy.ciphertext)),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as RequestMemoPlaintext;
}

export async function encryptRequestMemo(input: {
  memo: RequestMemoPlaintext;
  requesterWallet: WalletSecrets;
  payerX25519PublicHex: string;
}): Promise<EncryptedRequestMemoEnvelope> {
  return {
    version: 1,
    kind: "veil-request-memo",
    encryption: "X25519-AES-GCM",
    copies: {
      requester: await encryptCopy(input.memo, input.requesterWallet.x25519PublicHex),
      payer: await encryptCopy(input.memo, input.payerX25519PublicHex),
    },
  };
}

export async function decryptRequestMemo(input: {
  envelope: EncryptedRequestMemoEnvelope;
  wallet: WalletSecrets;
  role: "requester" | "payer";
}): Promise<RequestMemoPlaintext> {
  try {
    if (input.envelope.kind !== "veil-request-memo") {
      throw new Error("Invalid request memo envelope");
    }
    return await decryptCopy(input.envelope.copies[input.role], input.wallet);
  } catch {
    throw new Error("Could not decrypt request memo with this wallet");
  }
}
