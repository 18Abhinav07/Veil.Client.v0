import nacl from "tweetnacl";

const STRKEY_SECRET_VERSION = 18 << 3;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export interface SignStellarPayloadInput {
  stellarSecretKey: string;
  payloadBase64: string;
}

export interface SignStellarPayloadResult {
  signatureBase64: string;
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase32(value: string): Uint8Array {
  let bits = 0;
  let current = 0;
  const output: number[] = [];

  for (const rawChar of value.replace(/=+$/g, "").toUpperCase()) {
    const next = BASE32_ALPHABET.indexOf(rawChar);
    if (next === -1) throw new Error("Invalid Stellar secret key encoding");
    current = (current << 5) | next;
    bits += 5;
    if (bits >= 8) {
      output.push((current >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Uint8Array.from(output);
}

function crc16Xmodem(payload: Uint8Array): number {
  let crc = 0;
  for (const byte of payload) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc;
}

function decodeStellarSecretSeed(secretKey: string): Uint8Array {
  const decoded = decodeBase32(secretKey);
  if (decoded.length !== 35) {
    throw new Error("Invalid Stellar secret key length");
  }
  const versionedPayload = decoded.slice(0, 33);
  const expectedChecksum = crc16Xmodem(versionedPayload);
  const actualChecksum = decoded[33] | (decoded[34] << 8);
  if (expectedChecksum !== actualChecksum) {
    throw new Error("Invalid Stellar secret key checksum");
  }
  if (versionedPayload[0] !== STRKEY_SECRET_VERSION) {
    throw new Error("Invalid Stellar secret key version");
  }
  return versionedPayload.slice(1);
}

export function signStellarPayload(
  input: SignStellarPayloadInput,
): SignStellarPayloadResult {
  const secretBytes = decodeStellarSecretSeed(input.stellarSecretKey);
  const keypair = nacl.sign.keyPair.fromSeed(secretBytes);
  const payload = base64ToBytes(input.payloadBase64);
  const signature = nacl.sign.detached(payload, keypair.secretKey);
  return { signatureBase64: bytesToBase64(signature) };
}
