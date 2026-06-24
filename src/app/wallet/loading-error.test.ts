import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSource(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("wallet route has loading and error boundaries for safe bootstrap failures", () => {
  assert.equal(existsSync(join(root, "src", "app", "wallet", "loading.tsx")), true);
  assert.equal(existsSync(join(root, "src", "app", "wallet", "error.tsx")), true);

  const loadingSource = readSource("src/app/wallet/loading.tsx");
  const errorSource = readSource("src/app/wallet/error.tsx");

  assert.match(loadingSource, /aria-hidden/);
  assert.doesNotMatch(loadingSource, /animate-pulse/);
  assert.doesNotMatch(loadingSource, /Preparing VEIL/);
  assert.doesNotMatch(loadingSource, /Wallet loading/i);
  assert.match(errorSource, /"use client"/);
  assert.match(errorSource, /reset/);
  assert.match(errorSource, /Try again/);
});

test("unified wallet waits for bootstrap data before rendering false empty states", () => {
  const source = readSource("src/components/unified/UnifiedWalletApp.tsx");

  assert.match(source, /bootstrapWalletData/);
  assert.match(source, /\/api\/wallet\/bootstrap/);
  assert.doesNotMatch(source, /BOOTSTRAP_ENDPOINTS/);
  assert.match(source, /decryptBootstrapNotes/);
  assert.match(source, /initialPublicAccount/);
  assert.match(source, /initialPrivateNotes/);
  assert.match(source, /initialMarketState/);
  assert.match(source, /initialContacts/);
  assert.match(source, /initialRequests/);
  assert.match(source, /initialSpendJobs/);
  assert.match(source, /initialNotifications/);
  assert.match(source, /prepareWallet=\{bootstrapWalletData\}/);
  assert.doesNotMatch(source, /WalletBootstrapScreen/);
  assert.doesNotMatch(source, /function Skeleton/);
});
