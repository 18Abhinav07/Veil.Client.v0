import type { MarketSeed } from "./marketTypes";

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function buildInitialMarketSeeds(input: {
  seededAt?: Date;
  includeDemo?: boolean;
} = {}): MarketSeed[] {
  const seededAt = input.seededAt ?? new Date();
  const seeds: MarketSeed[] = [
    {
      slug: "btc-higher-after-21d",
      title: "Will Bitcoin be higher 21 days after this market opens?",
      category: "Crypto",
      status: "open",
      closesAt: addDays(seededAt, 21).toISOString(),
      resolvesAt: addDays(seededAt, 22).toISOString(),
      outcomes: ["YES", "NO"],
      rules:
        "Resolves YES if the BTC/USD spot index at market close is strictly higher than the launch snapshot recorded when the market is seeded.",
      resolutionSource: "Coinbase BTC-USD spot market and CoinMarketCap public BTC/USD reference cross-check",
      iconName: "bitcoin",
      displayOrder: 10,
      demoOnly: false,
    },
    {
      slug: "eth-higher-after-21d",
      title: "Will Ethereum be higher 21 days after this market opens?",
      category: "Crypto",
      status: "open",
      closesAt: addDays(seededAt, 21).toISOString(),
      resolvesAt: addDays(seededAt, 22).toISOString(),
      outcomes: ["YES", "NO"],
      rules:
        "Resolves YES if the ETH/USD spot index at market close is strictly higher than the launch snapshot recorded when the market is seeded.",
      resolutionSource: "Coinbase ETH-USD spot market and CoinMarketCap public ETH/USD reference cross-check",
      iconName: "coins",
      displayOrder: 20,
      demoOnly: false,
    },
    {
      slug: "xlm-higher-after-14d",
      title: "Will Stellar XLM be higher 14 days after this market opens?",
      category: "Crypto",
      status: "open",
      closesAt: addDays(seededAt, 14).toISOString(),
      resolvesAt: addDays(seededAt, 15).toISOString(),
      outcomes: ["YES", "NO"],
      rules:
        "Resolves YES if the XLM/USD spot index at market close is strictly higher than the launch snapshot recorded when the market is seeded.",
      resolutionSource: "CoinMarketCap and CoinGecko public XLM/USD reference cross-check",
      iconName: "sparkles",
      displayOrder: 30,
      demoOnly: false,
    },
    {
      slug: "sp500-higher-after-21d",
      title: "Will the S&P 500 close higher 21 days after this market opens?",
      category: "Finance",
      status: "open",
      closesAt: addDays(seededAt, 21).toISOString(),
      resolvesAt: addDays(seededAt, 22).toISOString(),
      outcomes: ["YES", "NO"],
      rules:
        "Resolves YES if the official S&P 500 close at market close is strictly higher than the launch snapshot recorded when the market is seeded.",
      resolutionSource: "S&P Dow Jones Indices official S&P 500 close and Nasdaq/Yahoo Finance public cross-check",
      iconName: "line-chart",
      displayOrder: 40,
      demoOnly: false,
    },
    {
      slug: "nvidia-higher-after-14d",
      title: "Will NVIDIA close higher 14 days after this market opens?",
      category: "Tech",
      status: "open",
      closesAt: addDays(seededAt, 14).toISOString(),
      resolvesAt: addDays(seededAt, 15).toISOString(),
      outcomes: ["YES", "NO"],
      rules:
        "Resolves YES if NVIDIA's regular-session closing price at market close is strictly higher than the launch snapshot recorded when the market is seeded.",
      resolutionSource: "Nasdaq official NVDA close and Yahoo Finance public cross-check",
      iconName: "cpu",
      displayOrder: 50,
      demoOnly: false,
    },
    {
      slug: "demo-settlement-yes",
      title: "Demo market: resolves YES for settlement testing",
      category: "Demo",
      status: "open",
      closesAt: addDays(seededAt, 1).toISOString(),
      resolvesAt: addDays(seededAt, 1).toISOString(),
      outcomes: ["YES", "NO"],
      rules:
        "Controlled demo market for testing private bet recording, admin resolution, and payout calculation.",
      resolutionSource: "Internal demo resolver",
      iconName: "flask-conical",
      displayOrder: 60,
      demoOnly: true,
    },
  ];

  return input.includeDemo === true ? seeds : seeds.filter((seed) => !seed.demoOnly);
}
