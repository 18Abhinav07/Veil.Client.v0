import type { PrivateNoteSecrets } from "@/lib/noteCrypto";
import type { WalletSecrets } from "@/lib/vaultCrypto";

interface MarketOutputEnvelope {
  version: 1;
  encryptedOutputKind: "spp-x25519-output-note";
  encryptedOutput: number[];
}

interface DecryptOutputNoteResult {
  amountUnits: string;
  blindingHex: string;
  commitmentHex: string;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
  return data as T;
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

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function walletX25519PrivateHex(wallet: WalletSecrets): string {
  const privateKey = wallet.x25519PrivateJwk.d;
  if (!privateKey) throw new Error("Wallet is missing the private encryption key");
  return bytesToHex(base64UrlToBytes(privateKey));
}

function parseMarketOutputEnvelope(input: string): MarketOutputEnvelope {
  const parsed = JSON.parse(input) as MarketOutputEnvelope;
  if (
    parsed.version !== 1 ||
    parsed.encryptedOutputKind !== "spp-x25519-output-note" ||
    !Array.isArray(parsed.encryptedOutput)
  ) {
    throw new Error("Market payout note has an invalid encrypted output envelope");
  }
  return parsed;
}

export async function decryptMarketOutputNote(input: {
  wallet: WalletSecrets;
  commitmentHex: string;
  amountUnits: string;
  leafIndex: number;
  encryptedNoteCiphertext: string;
}): Promise<PrivateNoteSecrets> {
  const envelope = parseMarketOutputEnvelope(input.encryptedNoteCiphertext);
  const decrypted = await parseResponse<DecryptOutputNoteResult>(
    await fetch("/api/wallet/keys/decrypt-output-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notePrivateKeyHex: input.wallet.bn254NotePrivateKeyHex,
        encryptionPrivateKeyHex: walletX25519PrivateHex(input.wallet),
        commitmentHex: input.commitmentHex,
        leafIndex: input.leafIndex,
        encryptedOutput: envelope.encryptedOutput,
      }),
    }),
  );

  if (decrypted.commitmentHex !== input.commitmentHex) {
    throw new Error("Market payout note commitment mismatch");
  }
  if (decrypted.amountUnits !== input.amountUnits) {
    throw new Error("Market payout note amount mismatch");
  }

  return {
    blindingHex: decrypted.blindingHex,
    commitmentHex: decrypted.commitmentHex,
    amountUnits: decrypted.amountUnits,
    leafIndex: input.leafIndex,
    dummyBlindingHex: "",
    dummyCommitmentHex: "",
    createdAt: Date.now(),
  };
}
