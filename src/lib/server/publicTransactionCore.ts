import {
  decimalToStellarUnits,
  stellarUnitsToDecimal,
} from "../publicWalletCore";

export const STELLAR_BASE_ACCOUNT_ENTRY_COUNT = BigInt(2);

export interface XlmSpendabilityInput {
  xlmBalance: string;
  amount: string;
  feeStroops?: string | number | bigint;
  baseReserveStroops: string | number | bigint;
  subentryCount?: string | number | bigint;
  numSponsoring?: string | number | bigint;
  numSponsored?: string | number | bigint;
}

function toNonNegativeBigInt(
  value: string | number | bigint | undefined,
  fallback = BigInt(0),
) {
  if (value === undefined || value === null) return fallback;
  const parsed = BigInt(value);
  if (parsed < BigInt(0)) throw new Error("Stellar reserve values cannot be negative");
  return parsed;
}

export function xlmSpendableUnits(input: Omit<XlmSpendabilityInput, "amount">): string {
  const balance = BigInt(decimalToStellarUnits(input.xlmBalance));
  const fee = toNonNegativeBigInt(input.feeStroops, BigInt(0));
  const baseReserve = toNonNegativeBigInt(input.baseReserveStroops);
  const subentries = toNonNegativeBigInt(input.subentryCount, BigInt(0));
  const sponsoring = toNonNegativeBigInt(input.numSponsoring, BigInt(0));
  const sponsored = toNonNegativeBigInt(input.numSponsored, BigInt(0));
  const entryCount =
    STELLAR_BASE_ACCOUNT_ENTRY_COUNT + subentries + sponsoring - sponsored;
  const reserve = entryCount > BigInt(0) ? entryCount * baseReserve : BigInt(0);
  const spendable = balance - reserve - fee;
  return spendable > BigInt(0) ? spendable.toString() : "0";
}

export function assertXlmSpendable(input: XlmSpendabilityInput) {
  const amountUnits = BigInt(decimalToStellarUnits(input.amount));
  const spendableUnits = BigInt(xlmSpendableUnits(input));

  if (amountUnits > spendableUnits) {
    throw new Error(
      `XLM amount exceeds spendable balance after Stellar reserve and fee. Spendable: ${stellarUnitsToDecimal(
        spendableUnits.toString(),
      )} XLM.`,
    );
  }
}
