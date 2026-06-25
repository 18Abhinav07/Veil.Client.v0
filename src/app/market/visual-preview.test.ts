import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("market visual preview routes are development-only and render seeded market/admin surfaces", () => {
  const marketPreviewRoute = "src/app/market/preview/page.tsx";
  const marketDetailPreviewRoute = "src/app/market/preview/[slug]/page.tsx";
  const adminPreviewRoute = "src/app/admin/markets/preview/page.tsx";
  const previewDataPath = "src/lib/marketVisualPreview.ts";
  const marketsSource = readSource("src/components/markets/MarketsPage.tsx");
  const adminSource = readSource("src/components/admin/AdminMarketsConsole.tsx");

  assert.equal(existsSync(join(root, marketPreviewRoute)), true);
  assert.equal(existsSync(join(root, marketDetailPreviewRoute)), true);
  assert.equal(existsSync(join(root, adminPreviewRoute)), true);
  assert.equal(existsSync(join(root, previewDataPath)), true);

  const marketRouteSource = readSource(marketPreviewRoute);
  const marketDetailRouteSource = readSource(marketDetailPreviewRoute);
  const adminRouteSource = readSource(adminPreviewRoute);
  const previewDataSource = readSource(previewDataPath);

  assert.match(marketRouteSource, /isMarketUiPreviewEnabled/);
  assert.match(marketRouteSource, /notFound\(\)/);
  assert.match(marketRouteSource, /MarketsPage/);
  assert.match(marketRouteSource, /buildMarketPreviewPayload/);
  assert.match(marketRouteSource, /buildPreviewWallet/);
  assert.match(marketRouteSource, /previewMode/);

  assert.match(marketDetailRouteSource, /isMarketUiPreviewEnabled/);
  assert.match(marketDetailRouteSource, /notFound\(\)/);
  assert.match(marketDetailRouteSource, /MarketDetailPage/);
  assert.match(marketDetailRouteSource, /buildMarketDetailPreviewPayload/);
  assert.match(marketDetailRouteSource, /buildPreviewWallet/);
  assert.match(marketDetailRouteSource, /previewMode/);

  assert.match(adminRouteSource, /isMarketUiPreviewEnabled/);
  assert.match(adminRouteSource, /notFound\(\)/);
  assert.match(adminRouteSource, /AdminMarketsConsole/);
  assert.match(adminRouteSource, /buildAdminPreviewMarkets/);
  assert.match(adminRouteSource, /buildAdminPreviewPayoutQueues/);
  assert.match(adminRouteSource, /previewMode/);

  assert.match(previewDataSource, /MARKET_UI_PREVIEW/);
  assert.match(previewDataSource, /process\.env\.NODE_ENV !== "production"/);
  assert.match(previewDataSource, /buildMarketDetailPreviewPayload/);
  assert.match(previewDataSource, /btc-higher-21d/);
  assert.match(previewDataSource, /treeDepth: 10/);
  assert.doesNotMatch(previewDataSource, /demo-settlement-yes/);
  assert.doesNotMatch(previewDataSource, /category: "Demo"/);

  assert.match(marketsSource, /initialData\?: MarketsPayload/);
  assert.match(marketsSource, /previewMode\?: boolean/);
  assert.match(marketsSource, /initialData\?\.markets/);
  assert.match(marketsSource, /initialData\?\.portfolio/);
  assert.match(marketsSource, /if \(previewMode\) return/);
  assert.match(marketsSource, /market-card group box-border/);
  assert.match(marketsSource, /min-w-0 max-w-\[350px\]/);
  assert.match(marketsSource, /sm:max-w-full/);
  assert.match(marketsSource, /grid-cols-1 gap-3 sm:max-w-full md:grid-cols-2 xl:grid-cols-3/);
  assert.match(marketsSource, /break-words/);
  assert.match(marketsSource, /\[overflow-wrap:anywhere\]/);
  assert.match(marketsSource, /sm:line-clamp-2/);
  assert.doesNotMatch(marketsSource, /line-clamp-3/);
  assert.match(marketsSource, /fixed bottom-0 left-0 top-0 hidden md:flex/);
  assert.doesNotMatch(marketsSource, /bg-\[#f8f5ef\]/);

  assert.match(adminSource, /previewMode\?: boolean/);
  assert.match(adminSource, /initialPayoutQueueByMarket/);
  assert.match(adminSource, /if \(previewMode\) return/);
  assert.match(adminSource, /Visual preview only/);
  assert.doesNotMatch(adminSource, /bg-\[#f8f5ef\]/);
});

test("market visual proof script captures desktop and mobile browser screenshots", () => {
  const packageSource = readSource("package.json");
  const scriptPath = "scripts/market-visual-proof.mjs";
  assert.equal(existsSync(join(root, scriptPath)), true);

  const source = readSource(scriptPath);
  assert.match(packageSource, /"proof:market:visual": "node scripts\/market-visual-proof\.mjs"/);
  assert.match(packageSource, /node --check scripts\/market-visual-proof\.mjs/);
  assert.match(source, /MARKET_UI_PREVIEW/);
  assert.match(source, /CHROME_BIN/);
  assert.match(source, /Google Chrome\.app/);
  assert.match(source, /\/market\/preview/);
  assert.match(source, /\/admin\/markets\/preview/);
  assert.match(source, /marketUiPreview=true/);
  assert.match(source, /25_000/);
  assert.match(source, /--incognito/);
  assert.match(source, /--force-device-scale-factor=1/);
  assert.doesNotMatch(source, /--user-data-dir/);
  assert.match(source, /timeout: 60000/);
  assert.match(source, /--headless=new/);
  assert.match(source, /--screenshot=/);
  assert.match(source, /market-desktop/);
  assert.match(source, /market-portfolio-desktop/);
  assert.match(source, /market-mobile/);
  assert.match(source, /market-detail-desktop/);
  assert.match(source, /market-detail-mobile/);
  assert.match(source, /admin-desktop/);
});

test("market detail page follows the same no-violet light theme as the market list", () => {
  const detailSource = readSource("src/components/markets/MarketDetailPage.tsx");

  assert.doesNotMatch(detailSource, /violet-/);
  assert.doesNotMatch(detailSource, /bg-\[#f7f3ec\]/);
  assert.doesNotMatch(detailSource, /rounded-\[30px\]/);
  assert.doesNotMatch(detailSource, /shadow-\[0_24px_80px/);
  assert.match(detailSource, /bg-stone-50/);
  assert.match(detailSource, /bg-\[#fbfbfa\]/);
  assert.match(detailSource, /market-action-panel/);
  assert.doesNotMatch(detailSource, /QuoteStakePanel/);
  assert.match(detailSource, /href="\/market\?view=portfolio&tab=notes"/);
});
