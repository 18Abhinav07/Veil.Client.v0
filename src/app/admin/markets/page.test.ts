import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("admin markets page is Google-admin gated and exposes a production operations console", () => {
  assert.equal(existsSync(join(root, "src", "app", "admin", "markets", "page.tsx")), true);
  const pageSource = readSource("src/app/admin/markets/page.tsx");
  const consoleSource = readSource("src/components/admin/AdminMarketsConsole.tsx");

  assert.match(pageSource, /AdminMarketsConsole/);
  assert.match(pageSource, /getServerSession/);
  assert.match(pageSource, /createAuthOptions/);
  assert.match(pageSource, /isMarketAdminEmail/);
  assert.match(pageSource, /redirect\("\/signin\?callbackUrl=\/admin\/markets"\)/);
  assert.match(pageSource, /adminEmail=\{session\.user\?\.email/);
  assert.match(pageSource, /Admin access is restricted/);
  assert.match(consoleSource, /\/api\/admin\/markets/);
  assert.match(consoleSource, /Market Ops Console/);
  assert.match(consoleSource, /Draft Market/);
  assert.match(consoleSource, /Selected Market Ops/);
  assert.match(consoleSource, /AdminStatusTabs/);
  assert.match(consoleSource, /createDraftMarket/);
  assert.match(consoleSource, /openDraftMarket/);
  assert.match(consoleSource, /updateDraftMarket/);
  assert.match(consoleSource, /Seed Markets/);
  assert.match(consoleSource, /Load payouts/);
  assert.match(consoleSource, /payoutQueueByMarket/);
  assert.match(consoleSource, /resolve/);
  assert.match(consoleSource, /Execute payouts/);
  assert.match(consoleSource, /body: JSON\.stringify\(\{ payoutIds \}\)/);
  assert.match(consoleSource, /payout\?\.status === "submitted"/);
  assert.match(consoleSource, /payout submitted/);
  assert.doesNotMatch(consoleSource, /includeDemo: true/);
  assert.doesNotMatch(consoleSource, /grid-cols-\[minmax\(260px,1fr\)_90px_90px_120px_360px\]/);
  assert.doesNotMatch(consoleSource, /placeholder="Payout ids"/);
  assert.doesNotMatch(consoleSource, /placeholder="Payout tx"/);
  assert.doesNotMatch(consoleSource, /payoutTxByMarket/);
  assert.doesNotMatch(consoleSource, /@\/lib\/server/);
});
