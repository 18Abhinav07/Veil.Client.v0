"use client";

// Thin wrappers around @stellar/freighter-api that handle missing extension
// gracefully and type-narrow the awkward v3 result objects.

const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

let freighter: typeof import("@stellar/freighter-api") | null = null;

async function getFreighter() {
  if (freighter) return freighter;
  if (typeof window === "undefined") return null;
  try {
    freighter = await import("@stellar/freighter-api");
    return freighter;
  } catch {
    return null;
  }
}

export async function isFreighterInstalled(): Promise<boolean> {
  const f = await getFreighter();
  if (!f) return false;
  try {
    const result = await f.isConnected();
    return "isConnected" in result ? result.isConnected : (result as boolean);
  } catch {
    return false;
  }
}

export async function connectFreighter(): Promise<string | null> {
  const f = await getFreighter();
  if (!f) throw new Error("Freighter extension not found");

  // Freighter v3 returns { address: string } or legacy string
  const result = await f.requestAccess();
  if (typeof result === "string") return result;
  if (result && "address" in result) return (result as { address: string }).address;
  if (result && "error" in result)
    throw new Error((result as { error: string }).error);
  throw new Error("Unknown Freighter response");
}

export async function getPublicKey(): Promise<string | null> {
  const f = await getFreighter();
  if (!f) return null;
  try {
    const result = await f.getAddress();
    if (typeof result === "string") return result;
    if (result && "address" in result) return (result as { address: string }).address;
    return null;
  } catch {
    return null;
  }
}

export async function signXdr(xdr: string): Promise<string> {
  const f = await getFreighter();
  if (!f) throw new Error("Freighter not available");

  const result = await f.signTransaction(xdr, {
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  // v3 returns { signedTxXdr, signerAddress } or legacy string
  if (typeof result === "string") return result;
  if (result && "signedTxXdr" in result)
    return (result as { signedTxXdr: string }).signedTxXdr;
  if (result && "error" in result)
    throw new Error((result as { error: string }).error);
  throw new Error("Unexpected signTransaction response");
}
