import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("prediction markets live on standalone /market page without touching wallet navigation", () => {
  const appSource = readSource("src/components/unified/UnifiedWalletApp.tsx");
  const sidebarSource = readSource("src/components/unified/Sidebar.tsx");
  const marketPageSource = readSource("src/app/market/page.tsx");
  const marketsSource = readSource("src/components/markets/MarketsPage.tsx");

  assert.doesNotMatch(sidebarSource, /"markets"/);
  assert.doesNotMatch(sidebarSource, /TrendingUp/);
  assert.doesNotMatch(appSource, /Prediction Markets/);
  assert.doesNotMatch(appSource, /<MarketsTab \/>/);
  assert.doesNotMatch(appSource, /currentTab === "markets"/);
  assert.doesNotMatch(appSource, /id: "markets"/);
  assert.doesNotMatch(appSource, /<MarketsTab initialNotes=\{bootstrapData\.privateNotes\}/);
  assert.match(marketPageSource, /redirect\("\/signin\?callbackUrl=\/market"\)/);
  assert.match(marketPageSource, /MarketVaultShell/);
  assert.match(marketsSource, /Markets/);
  assert.match(marketsSource, /Portfolio/);
  assert.match(marketsSource, /Search markets/);
  assert.match(marketsSource, /Live/);
  assert.match(marketsSource, /activeView/);
  assert.match(marketsSource, /categoryFilter/);
  assert.match(marketsSource, /statusFilter/);
  assert.match(marketsSource, /categoryFilters/);
  assert.match(marketsSource, /MarketBrowseCard/);
  assert.match(marketsSource, /market-probability-bar/);
  assert.match(marketsSource, /yesProbabilityBps/);
  assert.match(marketsSource, /noProbabilityBps/);
  assert.match(marketsSource, /Private market pool/);
  assert.match(marketsSource, /\/api\/markets/);
  assert.match(marketsSource, /Market Notes/);
  assert.match(marketsSource, /Public Wallet/);
  assert.match(marketsSource, /USD Coin/);
  assert.match(marketsSource, /Stellar Lumens/);
  assert.match(marketsSource, /PublicWalletState/);
  assert.match(marketsSource, /\/api\/wallet\/public\/account\?address=/);
  assert.match(marketsSource, /Insufficient public USDC/);
  assert.match(marketsSource, /Deposit to Market Notes/);
  assert.match(marketsSource, /handleMarketDeposit/);
  assert.match(marketsSource, /\/api\/markets\/deposits/);
  assert.match(marketsSource, /useSearchParams/);
  assert.match(marketsSource, /view"\) === "portfolio"/);
  assert.match(marketsSource, /tab"\) === "notes"/);
  assert.match(marketsSource, /Positions/);
  assert.match(marketsSource, /Payouts/);
  assert.match(marketsSource, /portfolioTab/);
  assert.match(marketsSource, /market-card/);
  assert.match(marketsSource, /fixed bottom-0 left-0 top-0 hidden md:flex/);
  assert.match(marketsSource, /bg-stone-50/);
  assert.match(marketsSource, /overflow-hidden/);
  assert.match(marketsSource, /\[overflow-wrap:anywhere\]/);
  assert.match(marketsSource, /sm:line-clamp-2/);
  assert.doesNotMatch(marketsSource, /line-clamp-3/);
  assert.match(marketsSource, /flex h-screen w-screen flex-col md:flex-row overflow-hidden/);
  assert.doesNotMatch(marketsSource, /selected-market-panel/);
  assert.doesNotMatch(marketsSource, /Position Builder/);
  assert.doesNotMatch(marketsSource, /selectedSlug/);
  assert.doesNotMatch(marketsSource, /submitBet/);
  assert.doesNotMatch(marketsSource, /"Demo"/);
  assert.doesNotMatch(marketsSource, /bg-\[#f8f5ef\]/);
  assert.doesNotMatch(marketsSource, /const panel =/);
  assert.doesNotMatch(marketsSource, /Private Notes/);
  assert.match(marketsSource, /PrivateNoteSecrets/);
  assert.doesNotMatch(marketsSource, /initialNotes/);
  assert.doesNotMatch(marketsSource, /grid-cols-\[minmax\(220px,1fr\)_88px_88px_110px\]/);
  assert.doesNotMatch(marketsSource, /violet-/);
  assert.doesNotMatch(marketsSource, /bg-stone-950 p-5 text-white/);
  assert.match(marketsSource, /Market pool contract pending/);
  assert.match(marketsSource, /MarketsSkeleton/);
  assert.doesNotMatch(marketsSource, /@\/lib\/server/);
});

test("market cards link into a dedicated market detail page with betting controls", () => {
  const marketDetailRoute = join(root, "src", "app", "market", "[slug]", "page.tsx");
  const marketDetailComponent = join(root, "src", "components", "markets", "MarketDetailPage.tsx");
  const marketsSource = readSource("src/components/markets/MarketsPage.tsx");

  assert.equal(existsSync(marketDetailRoute), true);
  assert.equal(existsSync(marketDetailComponent), true);
  assert.match(marketsSource, /href=\{`\/market\/\$\{market\.slug\}`\}/);
  assert.match(marketsSource, />\s*Bet\s*</);
  assert.doesNotMatch(marketsSource, /onClick=\{\(\) => setSelectedSlug\(market\.slug\)\}/);

  const detailRouteSource = readSource("src/app/market/[slug]/page.tsx");
  const detailSource = readSource("src/components/markets/MarketDetailPage.tsx");
  assert.match(detailRouteSource, /redirect\(`\/signin\?callbackUrl=\/market\/\$\{slug\}`\)/);
  assert.match(detailRouteSource, /MarketVaultShell/);
  assert.match(detailSource, /\/api\/markets\/\$\{encodeURIComponent\(slug\)\}/);
  assert.match(detailSource, /detailTabs/);
  assert.match(detailSource, /market-action-panel/);
  assert.match(detailSource, /id="market-bet-panel"/);
  assert.match(detailSource, /Place private bet/);
  assert.match(detailSource, /selectedAmountExceedsNote/);
  assert.match(detailSource, /Use max/);
  assert.match(detailSource, /Overview/);
  assert.match(detailSource, /Rules/);
  assert.match(detailSource, /Positions/);
  assert.match(detailSource, /Notes/);
  assert.match(detailSource, /Payouts appear after this market resolves/);
  assert.doesNotMatch(detailSource, /focusBetPanel/);
  assert.doesNotMatch(detailSource, /scrollIntoView/);
  assert.match(detailSource, /Projected payout/);
  assert.match(detailSource, /computeParimutuelQuoteForNewStake/);
  assert.match(detailSource, /computeParimutuelPositionValue/);
  assert.match(detailSource, /accepted quote/);
  assert.match(detailSource, /Current payout/);
  assert.match(detailSource, /href="\/market\?view=portfolio&tab=notes"/);
  assert.doesNotMatch(detailSource, /Deposit to Market Pool/);
  assert.doesNotMatch(detailSource, /QuoteStakePanel/);
  assert.doesNotMatch(detailSource, /Your market portfolio/);
  assert.doesNotMatch(detailSource, /Private market pool/);
  assert.doesNotMatch(detailSource, /href="\/wallet\?mode=private&tab=dashboard"/);
  assert.doesNotMatch(detailSource, /Position Builder/);
  assert.doesNotMatch(detailSource, /bg-stone-950 p-7 text-white/);
  assert.doesNotMatch(detailSource, /bg-\[#f7f3ec\]/);
  assert.doesNotMatch(detailSource, /rounded-\[30px\]/);
  assert.doesNotMatch(detailSource, /shadow-\[0_24px_80px/);
  assert.match(detailSource, /Market Notes/);
  assert.match(detailSource, /Portfolio/);
  assert.doesNotMatch(detailSource, /@\/lib\/server/);
});

test("market portfolio uses wallet-style left tabs with a minimal right deposit form", () => {
  const marketsSource = readSource("src/components/markets/MarketsPage.tsx");

  assert.match(marketsSource, /portfolio-workspace/);
  assert.match(marketsSource, /market-deposit-panel/);
  assert.match(marketsSource, /lg:grid-cols-\[minmax\(0,1fr\)_360px\]/);
  assert.match(marketsSource, /border-b border-stone-200 bg-transparent/);
  assert.match(marketsSource, /rounded-full bg-stone-100\/60 p-1/);
  assert.match(marketsSource, /Deposit to Market Notes/);
  assert.match(marketsSource, /Public wallet/);
  assert.match(marketsSource, /USD Coin/);
  assert.match(marketsSource, /Stellar Lumens/);
  assert.doesNotMatch(marketsSource, /Universal deposit/);
  assert.doesNotMatch(marketsSource, /Use the universal deposit above/);
});

test("market pages use wallet dashboard balance cards without duplicate view controls", () => {
  const marketsSource = readSource("src/components/markets/MarketsPage.tsx");
  const detailSource = readSource("src/components/markets/MarketDetailPage.tsx");
  const portfolioBranch = marketsSource.slice(marketsSource.indexOf("portfolio-workspace"));

  assert.match(marketsSource, /font-sans/);
  assert.match(detailSource, /font-sans/);
  assert.match(marketsSource, /MarketBalanceCard/);
  assert.match(marketsSource, /market-balance-strip/);
  assert.match(marketsSource, /MarketNoteAssetCard/);
  assert.match(marketsSource, /market-note-card/);
  assert.match(detailSource, /MarketDetailMetricCard/);
  assert.match(detailSource, /market-detail-balance-strip/);
  assert.match(detailSource, /MarketNoteAssetCard/);
  assert.match(detailSource, /market-note-card/);
  assert.match(marketsSource, /placeholder="Search markets"/);
  assert.doesNotMatch(portfolioBranch, /placeholder="Search markets"/);
  assert.doesNotMatch(marketsSource, /\(\["markets", "portfolio"\] as const\)\.map/);
  assert.doesNotMatch(marketsSource, /border-b-2 pb-3 text-sm font-black transition/);
  assert.doesNotMatch(marketsSource, /grid border-y border-stone-200\/80 md:grid-cols-3/);
  assert.doesNotMatch(detailSource, /grid border-y border-stone-200\/80 sm:grid-cols-3/);
});

test("market detail uses left detail tabs and one wallet-style action rail", () => {
  const detailSource = readSource("src/components/markets/MarketDetailPage.tsx");

  assert.match(detailSource, /detailTabs/);
  assert.match(detailSource, /detailTab/);
  assert.match(detailSource, /grid-cols-5/);
  assert.match(detailSource, /lg:grid-cols-\[minmax\(0,1fr\)_390px\]/);
  assert.match(detailSource, /market-action-panel/);
  assert.match(detailSource, /border-b border-stone-200 bg-transparent/);
  assert.match(detailSource, /rounded-full bg-stone-100\/60 p-1/);
  assert.match(detailSource, /Overview/);
  assert.match(detailSource, /Rules/);
  assert.match(detailSource, /Positions/);
  assert.match(detailSource, /Notes/);
  assert.match(detailSource, /Payouts/);
  assert.doesNotMatch(detailSource, /Your market portfolio/);
  assert.doesNotMatch(detailSource, /Use the ticket above to open your first position/);
  assert.doesNotMatch(detailSource, /Private market pool/);
});

test("market pages use the encrypted vault before deposit or bet actions", () => {
  const marketShellPath = join(root, "src", "components", "markets", "MarketVaultShell.tsx");
  assert.equal(existsSync(marketShellPath), true);

  const marketPageSource = readSource("src/app/market/page.tsx");
  const detailRouteSource = readSource("src/app/market/[slug]/page.tsx");
  const marketShellSource = readSource("src/components/markets/MarketVaultShell.tsx");
  const marketListSource = readSource("src/components/markets/MarketsPage.tsx");
  const detailSource = readSource("src/components/markets/MarketDetailPage.tsx");

  assert.match(marketPageSource, /MarketVaultShell/);
  assert.match(detailRouteSource, /MarketVaultShell/);
  assert.match(marketShellSource, /VaultGate/);
  assert.match(marketShellSource, /wallet=\{wallet\}/);
  assert.match(marketListSource, /wallet: WalletSecrets/);
  assert.match(detailSource, /wallet: WalletSecrets/);
  assert.match(marketListSource, /handleMarketDeposit/);
  assert.match(marketListSource, /\/api\/markets\/deposits/);
  assert.match(marketListSource, /intent: "prepare"/);
  assert.match(marketListSource, /intent: "submit"/);
  assert.match(marketListSource, /intent: "store"/);
  assert.doesNotMatch(marketListSource, /intent: "finalize"/);
  assert.doesNotMatch(detailSource, /handleMarketDeposit/);
  assert.doesNotMatch(detailSource, /\/api\/markets\/deposits/);
  assert.match(detailSource, /intent: "prepare"/);
  assert.match(detailSource, /intent: "submit"/);
  assert.match(detailSource, /intent: "finalize"/);
  assert.doesNotMatch(detailSource, /\/api\/wallet\/private\/deposit/);
  assert.doesNotMatch(marketListSource, /poolId: market\.poolId/);
  assert.match(marketListSource, /signStellarPayload/);
  assert.doesNotMatch(detailSource, /signStellarPayload/);
  assert.match(marketListSource, /encryptPrivateNote/);
  assert.match(detailSource, /encryptPrivateNote/);
  assert.match(detailSource, /decryptPrivateNote/);
});

test("market bet submit transfers the selected note into escrow and stores any change note", () => {
  const marketListSource = readSource("src/components/markets/MarketsPage.tsx");
  const detailSource = readSource("src/components/markets/MarketDetailPage.tsx");

  assert.match(detailSource, /decryptPrivateNote/);
  assert.match(detailSource, /encryptedNoteCiphertext/);
  assert.match(detailSource, /intent: "prepare"/);
  assert.match(detailSource, /intent: "submit"/);
  assert.match(detailSource, /intent: "finalize"/);
  assert.match(detailSource, /escrowEncryptedNoteCiphertext/);
  assert.match(detailSource, /encryptedChangeNoteCiphertext/);
  assert.match(detailSource, /status: "escrowed"/);
  assert.match(detailSource, /source: "change"/);
  assert.match(detailSource, /setSelectedNoteId\(""\)/);
  assert.match(detailSource, /Market bet confirmed/i);
  assert.match(detailSource, /activeMarketBetStatuses/);
  assert.match(detailSource, /\[\.\.\.activeMarketBetStatuses\]\.includes\(bet\.status\)/);
  assert.doesNotMatch(detailSource, /On-chain market escrow is still pending/);
  assert.doesNotMatch(marketListSource, /On-chain market escrow is still pending/);
});

test("market detail page exposes payout claim states without mixing them into main wallet notes", () => {
  const detailSource = readSource("src/components/markets/MarketDetailPage.tsx");

  assert.match(detailSource, /claimMarketPayout/);
  assert.match(detailSource, /\/api\/markets\/payouts\/\$\{encodeURIComponent\(payout\.id\)\}\/claim/);
  assert.match(detailSource, /Claim payout/);
  assert.match(detailSource, /Payouts/);
  assert.match(detailSource, /source: "payout"/);
  assert.match(detailSource, /status: "unspent"/);
  assert.doesNotMatch(detailSource, /\/api\/wallet\/notes/);
});
