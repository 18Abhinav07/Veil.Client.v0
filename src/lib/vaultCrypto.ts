import nacl from "tweetnacl";

const DEFAULT_KDF_ITERATIONS = 210_000;
const AES_KEY_LENGTH_BITS = 256;
const BN254_SCALAR_BYTES = 32;
const STRKEY_PUBLIC_VERSION = 6 << 3;
const STRKEY_SECRET_VERSION = 18 << 3;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export interface WalletSecrets {
  stellarPublicKey: string;
  stellarSecretKey: string;
  bn254NotePrivateKeyHex: string;
  /** @deprecated Existing encrypted vaults may still contain this field. */
  bn254NoteSecretHex?: string;
  bn254PublicHex: string;
  membershipBlindingHex: string;
  x25519PublicHex: string;
  x25519PrivateJwk: JsonWebKey;
  createdAt: string;
}

export interface PublicWalletKeys {
  stellarPublicKey: string;
  bn254PublicHex: string;
  x25519PublicHex: string;
}

export interface EncryptedPayload {
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

export interface WalletVault {
  vaultVersion: 2;
  vaultCiphertext: string;
  recoveryCiphertext: string;
  recoveryKey: string;
  kdfName: "PBKDF2-SHA256";
  kdfParams: {
    keyLengthBits: number;
  };
  encryptionAlg: "AES-256-GCM";
  publicKeys: PublicWalletKeys;
}

interface CreateVaultOptions {
  password: string;
  kdfIterations?: number;
  deriveBn254PublicHex?: (notePrivateKeyHex: string) => Promise<string>;
}

interface RotatePasswordOptions {
  currentPassword?: string;
  recoveryKey?: string;
  newPassword: string;
  kdfIterations?: number;
}

function getWebCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("WebCrypto subtle crypto is required for wallet vaults");
  }
  return globalThis.crypto;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  getWebCrypto().getRandomValues(bytes);
  return bytes;
}

function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function crc16Xmodem(payload: Uint8Array): Uint8Array {
  let crc = 0;
  for (const byte of payload) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) : crc << 1;
      crc &= 0xffff;
    }
  }
  return new Uint8Array([crc & 0xff, (crc >> 8) & 0xff]);
}

function encodeStellarStrKey(versionByte: number, payload: Uint8Array): string {
  const versioned = new Uint8Array(1 + payload.length);
  versioned[0] = versionByte;
  versioned.set(payload, 1);
  const checksum = crc16Xmodem(versioned);
  const bytes = new Uint8Array(versioned.length + checksum.length);
  bytes.set(versioned);
  bytes.set(checksum, versioned.length);
  return encodeBase32(bytes);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
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

async function sha256Hex(text: string): Promise<string> {
  const digest = await getWebCrypto().subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return bytesToHex(new Uint8Array(digest));
}

async function deriveAesKey(input: {
  secret: string;
  salt: Uint8Array;
  iterations: number;
}): Promise<CryptoKey> {
  const baseKey = await getWebCrypto().subtle.importKey(
    "raw",
    new TextEncoder().encode(input.secret),
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

async function encryptWalletSecrets(
  wallet: WalletSecrets,
  secret: string,
  iterations: number,
): Promise<string> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveAesKey({ secret, salt, iterations });
  const plaintext = new TextEncoder().encode(JSON.stringify(wallet));
  const ciphertext = await getWebCrypto().subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    plaintext,
  );
  const payload: EncryptedPayload = {
    version: 1,
    kdf: {
      name: "PBKDF2-SHA256",
      params: {
        iterations,
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
  return JSON.stringify(payload);
}

async function decryptWalletSecrets(
  ciphertextJson: string,
  secret: string,
): Promise<WalletSecrets> {
  let payload: EncryptedPayload;
  try {
    payload = JSON.parse(ciphertextJson) as EncryptedPayload;
  } catch {
    throw new Error("Could not decrypt wallet vault: invalid ciphertext payload");
  }

  try {
    const salt = base64UrlToBytes(payload.kdf.params.salt);
    const iv = base64UrlToBytes(payload.encryption.iv);
    const ciphertext = base64UrlToBytes(payload.encryption.ciphertext);
    const key = await deriveAesKey({
      secret,
      salt,
      iterations: payload.kdf.params.iterations,
    });
    const plaintext = await getWebCrypto().subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(ciphertext),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as WalletSecrets;
  } catch {
    throw new Error("Could not decrypt wallet vault with the provided secret");
  }
}

async function generateX25519Keypair() {
  const keyPair = (await getWebCrypto().subtle.generateKey(
    { name: "X25519" } as AlgorithmIdentifier,
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const publicKey = await getWebCrypto().subtle.exportKey("raw", keyPair.publicKey);
  const privateKey = await getWebCrypto().subtle.exportKey("jwk", keyPair.privateKey);
  return {
    publicHex: bytesToHex(new Uint8Array(publicKey)),
    privateJwk: privateKey,
  };
}

export async function generateWalletSecrets(options: {
  deriveBn254PublicHex?: (notePrivateKeyHex: string) => Promise<string>;
} = {}): Promise<WalletSecrets> {
  const stellarSeed = randomBytes(32);
  const stellar = nacl.sign.keyPair.fromSeed(stellarSeed);
  const bn254NotePrivateKeyHex = bytesToHex(randomBytes(BN254_SCALAR_BYTES));
  const bn254PublicHex = options.deriveBn254PublicHex
    ? await options.deriveBn254PublicHex(bn254NotePrivateKeyHex)
    : await sha256Hex(`spp:bn254-note-public:v2:${bn254NotePrivateKeyHex}`);
  const membershipBlindingHex = bytesToHex(randomBytes(BN254_SCALAR_BYTES));
  const x25519 = await generateX25519Keypair();

  return {
    stellarPublicKey: encodeStellarStrKey(
      STRKEY_PUBLIC_VERSION,
      stellar.publicKey,
    ),
    stellarSecretKey: encodeStellarStrKey(
      STRKEY_SECRET_VERSION,
      stellarSeed,
    ),
    bn254NotePrivateKeyHex,
    bn254PublicHex,
    membershipBlindingHex,
    x25519PublicHex: x25519.publicHex,
    x25519PrivateJwk: x25519.privateJwk,
    createdAt: new Date().toISOString(),
  };
}

export async function createWalletVault(
  options: CreateVaultOptions,
): Promise<WalletVault> {
  const iterations = options.kdfIterations ?? DEFAULT_KDF_ITERATIONS;
  const wallet = await generateWalletSecrets({
    deriveBn254PublicHex: options.deriveBn254PublicHex,
  });
  const recoveryKey = bytesToBase64Url(randomBytes(32));

  return {
    vaultVersion: 2,
    vaultCiphertext: await encryptWalletSecrets(wallet, options.password, iterations),
    recoveryCiphertext: await encryptWalletSecrets(wallet, recoveryKey, iterations),
    recoveryKey,
    kdfName: "PBKDF2-SHA256",
    kdfParams: { keyLengthBits: AES_KEY_LENGTH_BITS },
    encryptionAlg: "AES-256-GCM",
    publicKeys: {
      stellarPublicKey: wallet.stellarPublicKey,
      bn254PublicHex: wallet.bn254PublicHex,
      x25519PublicHex: wallet.x25519PublicHex,
    },
  };
}

export function decryptVaultWithPassword(
  vault: WalletVault,
  password: string,
): Promise<WalletSecrets> {
  return decryptWalletSecrets(vault.vaultCiphertext, password);
}

export function decryptVaultWithRecoveryKey(
  vault: WalletVault,
  recoveryKey: string,
): Promise<WalletSecrets> {
  return decryptWalletSecrets(vault.recoveryCiphertext, recoveryKey);
}

export async function rotateVaultPassword(
  vault: WalletVault,
  options: RotatePasswordOptions,
): Promise<WalletVault> {
  const iterations = options.kdfIterations ?? DEFAULT_KDF_ITERATIONS;
  const wallet = options.currentPassword
    ? await decryptVaultWithPassword(vault, options.currentPassword)
    : await decryptVaultWithRecoveryKey(vault, options.recoveryKey ?? "");

  return {
    ...vault,
    vaultCiphertext: await encryptWalletSecrets(wallet, options.newPassword, iterations),
  };
}
