import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("wallet bootstrap API returns all first-render wallet data in one authenticated request", () => {
  const source = readSource("src/app/api/wallet/bootstrap/route.ts");

  assert.match(source, /getServerSession/);
  assert.match(source, /listWalletContacts/);
  assert.match(source, /listPaymentRequests/);
  assert.match(source, /listSpendJobs/);
  assert.match(source, /listPublicTransactions/);
  assert.match(source, /listNotifications/);
  assert.match(source, /getWalletBadgeCounts/);
  assert.match(source, /loadPublicWalletState/);
  assert.match(source, /fetchMarketState/);
  assert.match(source, /notes/);
  assert.match(source, /contacts/);
  assert.match(source, /requests/);
  assert.match(source, /spendJobs/);
  assert.match(source, /publicTransactions/);
  assert.match(source, /notifications/);
  assert.match(source, /badges/);
});

test("wallet bootstrap degrades public Horizon state when Horizon transport fails", () => {
  const source = readSource("src/app/api/wallet/bootstrap/route.ts");
  const loadPublicWalletState = source.slice(
    source.indexOf("async function loadPublicWalletState"),
    source.indexOf("function readPrice"),
  );

  assert.match(loadPublicWalletState, /try\s*\{/);
  assert.match(loadPublicWalletState, /catch \(err\)/);
  assert.match(loadPublicWalletState, /Public wallet Horizon lookup failed/);
  assert.match(loadPublicWalletState, /return parseHorizonAccount\(null\)/);
});
