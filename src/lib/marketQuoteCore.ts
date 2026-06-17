export type MarketQuoteOutcome = "YES" | "NO";

export type ParimutuelQuote = {
  payoutUnits: string;
  multipleBps: number;
  totalPoolUnits: string;
  outcomePoolUnits: string;
};

function readUnits(value: string, label: string) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} must be an integer unit value`);
  }
  return BigInt(value);
}

function assertPositiveUnits(value: bigint, label: string) {
  if (value <= BigInt(0)) {
    throw new Error(`${label} must be positive`);
  }
}

function quoteFromPools(input: {
  stake: bigint;
  totalPool: bigint;
  outcomePool: bigint;
}): ParimutuelQuote {
  assertPositiveUnits(input.stake, "stakeUnits");
  assertPositiveUnits(input.outcomePool, "outcomePoolUnits");
  const payout = (input.stake * input.totalPool) / input.outcomePool;
  return {
    payoutUnits: payout.toString(),
    multipleBps: Number((payout * BigInt(10000)) / input.stake),
    totalPoolUnits: input.totalPool.toString(),
    outcomePoolUnits: input.outcomePool.toString(),
  };
}

export function computeParimutuelQuoteForNewStake(input: {
  stakeUnits: string;
  outcome: MarketQuoteOutcome;
  yesTotalUnits: string;
  noTotalUnits: string;
}): ParimutuelQuote {
  const stake = readUnits(input.stakeUnits, "stakeUnits");
  const yes = readUnits(input.yesTotalUnits, "yesTotalUnits");
  const no = readUnits(input.noTotalUnits, "noTotalUnits");
  const totalPool = yes + no + stake;
  const outcomePool = (input.outcome === "YES" ? yes : no) + stake;

  return quoteFromPools({ stake, totalPool, outcomePool });
}

export function computeParimutuelPositionValue(input: {
  stakeUnits: string;
  outcome: MarketQuoteOutcome;
  yesTotalUnits: string;
  noTotalUnits: string;
}): ParimutuelQuote {
  const stake = readUnits(input.stakeUnits, "stakeUnits");
  const yes = readUnits(input.yesTotalUnits, "yesTotalUnits");
  const no = readUnits(input.noTotalUnits, "noTotalUnits");
  const totalPool = yes + no;
  const outcomePool = input.outcome === "YES" ? yes : no;

  return quoteFromPools({ stake, totalPool, outcomePool });
}

