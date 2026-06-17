import type { AdminMarket, AdminPayout } from "@/components/admin/AdminMarketsConsole";
import type { MarketDetailPayload } from "@/components/markets/MarketDetailPage";
import type { MarketsPayload, MarketView } from "@/components/markets/MarketsPage";
import type { PublicWalletState } from "@/lib/publicWalletCore";
import type { WalletSecrets } from "@/lib/vaultCrypto";

const PREVIEW_CONTRACT_ID = "CDLVEILMARKETPOOLPREVIEW000000000000000000000000000000000000";

function units(usdc: number) {
  return String(Math.round(usdc * 10_000_000));
}

function futureIso(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function isMarketUiPreviewEnabled(env: NodeJS.ProcessEnv = process.env, requestFlag = "") {
  return process.env.NODE_ENV !== "production" && (env.MARKET_UI_PREVIEW === "true" || requestFlag === "true");
}

export function buildPreviewWallet(): WalletSecrets {
  return {
    stellarPublicKey: "GPREVIEWMARKETWALLET000000000000000000000000000000000000000000",
    stellarSecretKey: "SPREVIEWMARKETWALLET000000000000000000000000000000000000000000",
    bn254NotePrivateKeyHex: "0".repeat(63) + "1",
    bn254PublicHex: "0x" + "2".repeat(64),
    membershipBlindingHex: "0x" + "3".repeat(64),
    x25519PublicHex: "0x" + "4".repeat(64),
    x25519PrivateJwk: {
      kty: "OKP",
      crv: "X25519",
      d: "preview-private-key",
      x: "preview-public-key",
    },
    createdAt: new Date("2026-06-30T00:00:00.000Z").toISOString(),
  };
}

export function buildPreviewPublicWalletState(): PublicWalletState {
  return {
    exists: true,
    xlmUnits: units(482.25),
    usdcUnits: units(640.75),
    hasUsdcTrustline: true,
  };
}

function market(input: {
  category: string;
  closesInDays: number;
  id: string;
  no: number;
  noMultiple: number;
  noTotal: number;
  rules: string;
  slug: string;
  source: string;
  status?: string;
  title: string;
  yes: number;
  yesMultiple: number;
  yesTotal: number;
}): MarketView {
  const closesAt = futureIso(input.closesInDays);
  return {
    id: input.id,
    poolId: "veil_market_pool_v1",
    slug: input.slug,
    title: input.title,
    category: input.category,
    status: input.status ?? "open",
    closesAt,
    resolvesAt: closesAt,
    rules: input.rules,
    resolutionSource: input.source,
    yesTotalUnits: units(input.yesTotal),
    noTotalUnits: units(input.noTotal),
    winningOutcome: null,
    poolStatus: "deployed",
    poolActive: true,
    contractId: PREVIEW_CONTRACT_ID,
    treeDepth: 10,
    odds: {
      yesProbabilityBps: input.yes,
      noProbabilityBps: input.no,
      yesMultipleBps: input.yesMultiple,
      noMultipleBps: input.noMultiple,
    },
  };
}

export function buildMarketPreviewPayload(): MarketsPayload {
  const markets = [
    market({
      id: "market_btc_21d",
      slug: "btc-higher-21d",
      title: "Will BTC close higher than its market launch price in 21 days?",
      category: "Crypto",
      closesInDays: 21,
      yes: 5840,
      no: 4160,
      yesMultiple: 17120,
      noMultiple: 24040,
      yesTotal: 183.4,
      noTotal: 130.6,
      rules: "YES resolves if BTC/USD is strictly above the launch snapshot at the resolution timestamp.",
      source: "Coinbase BTC/USD closing snapshot plus admin evidence.",
    }),
    market({
      id: "market_xlm_14d",
      slug: "xlm-higher-14d",
      title: "Will XLM close higher than its launch snapshot in 14 days?",
      category: "Crypto",
      closesInDays: 14,
      yes: 4625,
      no: 5375,
      yesMultiple: 21620,
      noMultiple: 18600,
      yesTotal: 74,
      noTotal: 86,
      rules: "YES resolves if XLM/USD is strictly above the launch snapshot at market close.",
      source: "Coinbase XLM/USD closing snapshot plus admin evidence.",
    }),
    market({
      id: "market_nvda_14d",
      slug: "nvidia-higher-14d",
      title: "Will NVIDIA close higher than its launch snapshot in 14 days?",
      category: "Tech",
      closesInDays: 14,
      yes: 6290,
      no: 3710,
      yesMultiple: 15900,
      noMultiple: 26950,
      yesTotal: 221,
      noTotal: 130.4,
      rules: "YES resolves if NVIDIA regular-session close is above the launch snapshot.",
      source: "NASDAQ regular-session close plus admin evidence.",
    }),
    market({
      id: "market_spx_21d",
      slug: "sp500-higher-21d",
      title: "Will the S&P 500 close higher than its launch snapshot in 21 days?",
      category: "Finance",
      closesInDays: 21,
      yes: 5110,
      no: 4890,
      yesMultiple: 19570,
      noMultiple: 20450,
      yesTotal: 92,
      noTotal: 88,
      rules: "YES resolves if the S&P 500 official close is above the launch snapshot.",
      source: "Official S&P 500 close plus admin evidence.",
    }),
  ];

  return {
    markets,
    portfolio: {
      notes: [
        {
          id: "preview_note_1",
          poolId: "veil_market_pool_v1",
          commitmentHex: "0x" + "a".repeat(64),
          amountUnits: units(32),
          leafIndex: 18,
          status: "unspent",
          source: "deposit",
          txHash: "preview_tx_deposit_1",
        },
        {
          id: "preview_note_2",
          poolId: "veil_market_pool_v1",
          commitmentHex: "0x" + "b".repeat(64),
          amountUnits: units(8.5),
          leafIndex: 19,
          status: "unspent",
          source: "change",
          txHash: "preview_tx_change_1",
        },
      ],
      bets: [
        {
          id: "preview_bet_1",
          marketSlug: "btc-higher-21d",
          outcome: "YES",
          amountUnits: units(4),
          status: "confirmed",
          txHash: "preview_tx_bet_1",
          createdAt: new Date("2026-06-30T12:00:00.000Z").toISOString(),
        },
      ],
      payouts: [
        {
          id: "preview_payout_1",
          marketId: "market_btc_21d",
          amountUnits: units(5.4),
          status: "claimable",
        },
      ],
    },
  };
}

export function buildMarketDetailPreviewPayload(slug = "btc-higher-21d"): MarketDetailPayload {
  const payload = buildMarketPreviewPayload();
  const market = payload.markets.find((item) => item.slug === slug) ?? payload.markets[0];
  const encryptedPreviewNote = JSON.stringify({
    version: 1,
    preview: true,
    ciphertext: "visual-preview-only",
  });

  return {
    market,
    portfolio: {
      notes: payload.portfolio.notes.map((note) => ({
        ...note,
        encryptedNoteCiphertext: encryptedPreviewNote,
      })),
      bets: payload.portfolio.bets,
      payouts: [
        {
          id: "preview_payout_1",
          marketId: market.id,
          amountUnits: units(5.4),
          status: "claimable",
          payoutCommitmentHex: "0x" + "c".repeat(64),
          encryptedNoteCiphertext: encryptedPreviewNote,
          leafIndex: 22,
          txHash: "preview_tx_payout_1",
        },
      ],
    },
  };
}

export function buildAdminPreviewMarkets(): AdminMarket[] {
  return buildMarketPreviewPayload().markets.map((item, index) => ({
    id: item.id,
    slug: item.slug,
    title: item.title,
    category: item.category,
    status: index === 4 ? "resolved" : item.status,
    closesAt: item.closesAt,
    yesTotalUnits: item.yesTotalUnits,
    noTotalUnits: item.noTotalUnits,
    winningOutcome: null,
    poolStatus: item.poolStatus,
    poolActive: item.poolActive,
    treeDepth: item.treeDepth,
    odds: {
      yesProbabilityBps: item.odds.yesProbabilityBps,
      noProbabilityBps: item.odds.noProbabilityBps,
    },
  }));
}

export function buildAdminPreviewPayoutQueues(): Record<string, AdminPayout[]> {
  return {
    market_btc_21d: [
      {
        id: "preview_payout_1",
        userEmail: "preview@veil.local",
        amountUnits: units(5.4),
        status: "pending",
        txHash: null,
      },
    ],
  };
}
