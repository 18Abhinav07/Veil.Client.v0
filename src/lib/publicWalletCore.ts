export const STELLAR_DECIMALS = 7;
export const USDC_CODE = "USDC";
export const USDC_ISSUER =
  process.env.NEXT_PUBLIC_USDC_ISSUER ??
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

export interface PublicWalletState {
  exists: boolean;
  xlmUnits: string;
  usdcUnits: string;
  hasUsdcTrustline: boolean;
}

interface HorizonBalance {
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  balance?: string;
}

interface HorizonAccountLike {
  balances?: HorizonBalance[];
}

export function decimalToStellarUnits(value: string): string {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Enter a valid amount");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const units =
    BigInt(whole) * BigInt(10 ** STELLAR_DECIMALS) +
    BigInt(fraction.padEnd(STELLAR_DECIMALS, "0").slice(0, STELLAR_DECIMALS));
  if (units <= BigInt(0)) {
    throw new Error("Amount must be greater than zero");
  }
  return units.toString();
}

export function formatStellarUnits(units: string, symbol: string): string {
  return `${stellarUnitsToDecimal(units)}${symbol ? " " + symbol : ""}`;
}

export function stellarUnitsToDecimal(units: string): string {
  const value = BigInt(units);
  const decimalVal = Number(value) / 10 ** STELLAR_DECIMALS;
  return decimalVal.toFixed(2);
}

export function parseHorizonBalance(balance: string | undefined): string {
  if (!balance) return "0";
  const [whole, fraction = ""] = balance.split(".");
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction)) return "0";
  return (
    BigInt(whole) * BigInt(10 ** STELLAR_DECIMALS) +
    BigInt(fraction.padEnd(STELLAR_DECIMALS, "0").slice(0, STELLAR_DECIMALS))
  ).toString();
}

export function parseHorizonAccount(account: HorizonAccountLike | null): PublicWalletState {
  if (!account) {
    return {
      exists: false,
      xlmUnits: "0",
      usdcUnits: "0",
      hasUsdcTrustline: false,
    };
  }

  const balances = account.balances ?? [];
  const native = balances.find((balance) => balance.asset_type === "native");
  const usdc = balances.find(
    (balance) =>
      balance.asset_code === USDC_CODE &&
      balance.asset_issuer === USDC_ISSUER,
  );

  return {
    exists: true,
    xlmUnits: parseHorizonBalance(native?.balance),
    usdcUnits: parseHorizonBalance(usdc?.balance),
    hasUsdcTrustline: Boolean(usdc),
  };
}
