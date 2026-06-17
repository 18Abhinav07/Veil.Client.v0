export const REMEMBERED_WALLET_ACCOUNT_KEY = "wallet-v2:last-google-account";

export interface RememberedWalletAccount {
  email: string;
  name?: string | null;
  rememberedAt: number;
}

function readStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function readRememberedWalletAccount(): RememberedWalletAccount | null {
  const storage = readStorage();
  if (!storage) return null;
  const raw = storage.getItem(REMEMBERED_WALLET_ACCOUNT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RememberedWalletAccount>;
    if (!parsed.email || typeof parsed.email !== "string") return null;
    return {
      email: parsed.email,
      name: typeof parsed.name === "string" ? parsed.name : null,
      rememberedAt:
        typeof parsed.rememberedAt === "number" ? parsed.rememberedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function rememberWalletAccount(input: {
  email?: string | null;
  name?: string | null;
}) {
  const storage = readStorage();
  const email = input.email?.trim();
  if (!storage || !email) return;
  storage.setItem(
    REMEMBERED_WALLET_ACCOUNT_KEY,
    JSON.stringify({
      email,
      name: input.name?.trim() || null,
      rememberedAt: Date.now(),
    } satisfies RememberedWalletAccount),
  );
}

export function clearRememberedWalletAccount() {
  readStorage()?.removeItem(REMEMBERED_WALLET_ACCOUNT_KEY);
}
