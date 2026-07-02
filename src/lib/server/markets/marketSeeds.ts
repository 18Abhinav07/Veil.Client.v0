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
      slug: "sol-higher-after-21d",
      title: "Will Solana be higher 21 days after this market opens?",
      category: "Crypto",
      status: "open",
      closesAt: addDays(seededAt, 21).toISOString(),
      resolvesAt: addDays(seededAt, 22).toISOString(),
      outcomes: ["YES", "NO"],
      rules:
        "Resolves YES if the SOL/USD spot index at market close is strictly higher than the launch snapshot recorded when the market is seeded.",
      resolutionSource: "Coinbase SOL-USD spot market and CoinGecko public SOL/USD reference cross-check",
      iconName: "coins",
      displayOrder: 60,
      demoOnly: false,
    },
    {
      slug: "nasdaq100-higher-after-21d",
      title: "Will the Nasdaq 100 close higher 21 days after this market opens?",
      category: "Finance",
      status: "open",
      closesAt: addDays(seededAt, 21).toISOString(),
      resolvesAt: addDays(seededAt, 22).toISOString(),
      outcomes: ["YES", "NO"],
      rules:
        "Resolves YES if the official Nasdaq 100 close at market close is strictly higher than the launch snapshot recorded when the market is seeded.",
      resolutionSource: "Nasdaq official NDX close and Yahoo Finance public cross-check",
      iconName: "line-chart",
      displayOrder: 70,
      demoOnly: false,
    },
    {
      slug: "gold-higher-after-21d",
      title: "Will gold be higher 21 days after this market opens?",
      category: "Macro",
      status: "open",
      closesAt: addDays(seededAt, 21).toISOString(),
      resolvesAt: addDays(seededAt, 22).toISOString(),
      outcomes: ["YES", "NO"],
      rules:
        "Resolves YES if the USD gold spot reference price at market close is strictly higher than the launch snapshot recorded when the market is seeded.",
      resolutionSource: "LBMA gold price and Yahoo Finance public XAU/USD reference cross-check",
      iconName: "landmark",
      displayOrder: 80,
      demoOnly: false,
    },
    {
      slug: "brent-oil-higher-after-21d",
      title: "Will Brent crude oil be higher 21 days after this market opens?",
      category: "Macro",
      status: "open",
      closesAt: addDays(seededAt, 21).toISOString(),
      resolvesAt: addDays(seededAt, 22).toISOString(),
      outcomes: ["YES", "NO"],
      rules:
        "Resolves YES if the Brent crude front-month reference price at market close is strictly higher than the launch snapshot recorded when the market is seeded.",
      resolutionSource: "ICE Brent front-month reference price and EIA public market data cross-check",
      iconName: "flame",
      displayOrder: 90,
      demoOnly: false,
    },
    {
      slug: "us10y-yield-higher-after-21d",
      title: "Will the US 10-year Treasury yield be higher 21 days after this market opens?",
      category: "Macro",
      status: "open",
      closesAt: addDays(seededAt, 21).toISOString(),
      resolvesAt: addDays(seededAt, 22).toISOString(),
      outcomes: ["YES", "NO"],
      rules:
        "Resolves YES if the benchmark US 10-year Treasury yield at market close is strictly higher than the launch snapshot recorded when the market is seeded.",
      resolutionSource: "U.S. Treasury daily par yield curve rate and CNBC/Yahoo Finance public cross-check",
      iconName: "activity",
      displayOrder: 100,
      demoOnly: false,
    },
    {
      slug: "tesla-higher-after-21d",
      title: "Will Tesla close higher 21 days after this market opens?",
      category: "Tech",
      status: "open",
      closesAt: addDays(seededAt, 21).toISOString(),
      resolvesAt: addDays(seededAt, 22).toISOString(),
      outcomes: ["YES", "NO"],
      rules:
        "Resolves YES if Tesla's regular-session closing price at market close is strictly higher than the launch snapshot recorded when the market is seeded.",
      resolutionSource: "Nasdaq official TSLA close and Yahoo Finance public cross-check",
      iconName: "car",
      displayOrder: 110,
      demoOnly: false,
    },
    {
      slug: "apple-higher-after-21d",
      title: "Will Apple close higher 21 days after this market opens?",
      category: "Tech",
      status: "open",
      closesAt: addDays(seededAt, 21).toISOString(),
      resolvesAt: addDays(seededAt, 22).toISOString(),
      outcomes: ["YES", "NO"],
      rules:
        "Resolves YES if Apple's regular-session closing price at market close is strictly higher than the launch snapshot recorded when the market is seeded.",
      resolutionSource: "Nasdaq official AAPL close and Yahoo Finance public cross-check",
      iconName: "cpu",
      displayOrder: 120,
      demoOnly: false,
    },
    {
      slug: "fed-target-unchanged-next-30d",
      title: "Will the Federal Reserve target range be unchanged 30 days after this market opens?",
      category: "Macro",
      status: "open",
      closesAt: addDays(seededAt, 30).toISOString(),
      resolvesAt: addDays(seededAt, 31).toISOString(),
      outcomes: ["YES", "NO"],
      rules:
        "Resolves YES if the upper and lower bounds of the federal funds target range are unchanged from the launch snapshot at the first official FOMC target range announcement on or before the close. If no announcement occurs before the close, resolves YES if the target range remains unchanged at close.",
      resolutionSource: "Federal Reserve official FOMC target range announcement and CME FedWatch public cross-check",
      iconName: "landmark",
      displayOrder: 130,
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
      displayOrder: 900,
      demoOnly: true,
    },
  ];

  return input.includeDemo === true ? seeds : seeds.filter((seed) => !seed.demoOnly);
}
