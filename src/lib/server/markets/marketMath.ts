import type { ConfirmedMarketBet, MarketOutcome, MarketPayout } from "./marketTypes";

export interface PayoutInput {
  userWinningStake: bigint;
  totalPool: bigint;
  winningPool: bigint;
}

export interface SettlementInput {
  winningOutcome: MarketOutcome;
  bets: ConfirmedMarketBet[];
}

export interface SettlementResult {
  payouts: MarketPayout[];
  totalPoolUnits: string;
  winningPoolUnits: string;
  paidUnits: string;
  roundingDustUnits: string;
}

export interface MarketOdds {
  yesProbabilityBps: number;
  noProbabilityBps: number;
  yesMultipleBps: number | null;
  noMultipleBps: number | null;
}

function readUnits(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error(`Invalid amount units: ${value}`);
  return BigInt(value);
}

export function computeParimutuelPayout(input: PayoutInput): bigint {
  if (input.winningPool <= BigInt(0)) {
    throw new Error("Cannot compute payout because winning pool is empty");
  }
  if (input.userWinningStake < BigInt(0) || input.totalPool < BigInt(0)) {
    throw new Error("Pool amounts cannot be negative");
  }
  return (input.userWinningStake * input.totalPool) / input.winningPool;
}

export function computeSettlementPayouts(input: SettlementInput): SettlementResult {
  const totalPool = input.bets.reduce(
    (sum, bet) => sum + readUnits(bet.amountUnits),
    BigInt(0),
  );
  const winningPool = input.bets
    .filter((bet) => bet.outcome === input.winningOutcome)
    .reduce((sum, bet) => sum + readUnits(bet.amountUnits), BigInt(0));
  if (winningPool === BigInt(0)) {
    throw new Error("Cannot settle because winning pool is empty");
  }

  const winningStakeByUser = new Map<string, bigint>();
  for (const bet of input.bets) {
    if (bet.outcome !== input.winningOutcome) continue;
    winningStakeByUser.set(
      bet.userId,
      (winningStakeByUser.get(bet.userId) ?? BigInt(0)) + readUnits(bet.amountUnits),
    );
  }

  let paid = BigInt(0);
  const payouts = Array.from(winningStakeByUser.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([userId, userWinningStake]) => {
      const amount = computeParimutuelPayout({
        userWinningStake,
        totalPool,
        winningPool,
      });
      paid += amount;
      return { userId, amountUnits: amount.toString() };
    });

  return {
    payouts,
    totalPoolUnits: totalPool.toString(),
    winningPoolUnits: winningPool.toString(),
    paidUnits: paid.toString(),
    roundingDustUnits: (totalPool - paid).toString(),
  };
}

export function computeMarketOdds(input: {
  yesTotal: string;
  noTotal: string;
}): MarketOdds {
  const yes = readUnits(input.yesTotal);
  const no = readUnits(input.noTotal);
  const total = yes + no;
  if (total === BigInt(0)) {
    return {
      yesProbabilityBps: 5000,
      noProbabilityBps: 5000,
      yesMultipleBps: null,
      noMultipleBps: null,
    };
  }

  const yesProbabilityBps = Number((yes * BigInt(10000) + total / BigInt(2)) / total);
  const noProbabilityBps = 10000 - yesProbabilityBps;
  return {
    yesProbabilityBps,
    noProbabilityBps,
    yesMultipleBps: yes === BigInt(0) ? null : Number((total * BigInt(10000)) / yes),
    noMultipleBps: no === BigInt(0) ? null : Number((total * BigInt(10000)) / no),
  };
}
