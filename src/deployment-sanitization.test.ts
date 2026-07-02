import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const walletPoolContract = "CDEB3AIFRAGHGPLM24EDHHETSH4Y4L4NAYGSHHW7MQWXUQ65G7LEDBFY";

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("production wallet fallbacks use the live depth-10 wallet pool", () => {
  for (const path of [
    "next.config.ts",
    "scripts/lib.mjs",
    "src/lib/stellar.ts",
    "src/components/unified/PrivateDashboard.tsx",
  ]) {
    const contents = source(path);
    assert.match(contents, new RegExp(walletPoolContract), `${path} should default to the live wallet pool`);
  }
  assert.doesNotMatch(source("next.config.ts"), /NEXT_PUBLIC_RELAYER_URL:\s*process\.env\.RELAYER_URL/);
});

test("market pool defaults stay on the currently deployed depth-10 circuit", () => {
  assert.match(source("scripts/seed-markets.mjs"), /MARKET_POOL_TREE_DEPTH,\s*10/);
  assert.match(source("src/app/api/admin/markets/route.ts"), /MARKET_POOL_TREE_DEPTH,\s*10/);
  assert.match(source("MARKET_DEPLOYMENT.md"), /MARKET_POOL_TREE_DEPTH`: defaults to `10`/);
  assert.match(source("db/migrations/0002_prediction_markets.sql"), /tree_depth integer not null default 10/);
});

test("payment request spends do not use placeholder pool ids", () => {
  const contents = source("src/components/unified/RequestsTab.tsx");
  assert.doesNotMatch(contents, /const POOL_ID = "veil_usdc_pool"/);
  assert.match(contents, /process\.env\.NEXT_PUBLIC_POOL_ID/);
  assert.match(contents, new RegExp(walletPoolContract));
});

test("tracked runtime proof and browser scratch artifacts are absent", () => {
  for (const path of [
    "lane2-spike-result.json",
    "market-smoke-evidence.json",
    "market-visual-proof/manifest.json",
    "next-dev.log",
    "note.json",
    "stellar-address",
    "test-page.js",
    "withdraw-state.json",
  ]) {
    assert.equal(existsSync(join(root, path)), false, `${path} should not be checked into the deploy tree`);
  }
});

test("Railway frontend start is explicit and can run web or worker roles", () => {
  const packageJson = JSON.parse(source("package.json"));
  const packageLock = JSON.parse(source("package-lock.json"));
  const railwayStart = source("scripts/railway-start.mjs");
  const railpack = JSON.parse(source("railpack.json"));

  assert.equal(packageJson.dependencies.next, "15.5.19");
  assert.equal(packageLock.packages["node_modules/next"].version, "15.5.19");
  assert.equal(packageJson.scripts.start, "node scripts/railway-start.mjs");
  assert.match(packageJson.scripts["smoke:check"], /scripts\/railway-start\.mjs/);
  assert.match(railwayStart, /VEIL_PROCESS/);
  assert.match(railwayStart, /process\.env\.PORT \?\? "3002"/);
  assert.match(railwayStart, /scripts\/spend-worker\.mjs/);
  assert.equal(railpack.provider, "node");
  assert.equal(railpack.deploy.startCommand, "npm run start");
  assert.equal(existsSync(join(root, "nixpacks.toml")), false, "Railway uses Railpack for this deploy");
});
