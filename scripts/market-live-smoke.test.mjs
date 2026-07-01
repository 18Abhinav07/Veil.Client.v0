import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  REQUIRED_MARKET_SMOKE_ENV,
  decimalToUnits,
  selectSmokeMarket,
  selectSmokePayoutIds,
} from "./market-live-smoke.mjs";

const root = process.cwd();

test("market live smoke script is exposed and syntax-checked", () => {
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

  assert.equal(packageJson.scripts["smoke:live:market"], "node scripts/market-live-smoke.mjs");
  assert.equal(packageJson.scripts["smoke:live:market:auto"], "node scripts/market-e2e-run.mjs");
  assert.match(packageJson.scripts["smoke:check"], /node --check scripts\/market-live-smoke\.mjs/);
  assert.match(packageJson.scripts["smoke:check"], /node --check scripts\/market-e2e-run\.mjs/);
});

test("market auto smoke runner creates transient Auth.js sessions without writing secret env files", () => {
  const source = readFileSync(join(root, "scripts", "market-e2e-run.mjs"), "utf8");
  const liveSource = readFileSync(join(root, "scripts", "market-live-smoke.mjs"), "utf8");

  assert.match(liveSource, /export async function main/);
  assert.doesNotMatch(liveSource, /executedCount === 1/);
  assert.match(source, /next-auth\.session-token/);
  assert.match(source, /__Secure-next-auth\.session-token/);
  assert.match(source, /insert into users/i);
  assert.match(source, /insert into sessions/i);
  assert.match(source, /insert into wallet_profiles/i);
  assert.match(source, /api\/wallet\/registration/);
  assert.match(source, /bn254NotePublicKeyHex/);
  assert.match(source, /prove\/register-asp-membership/);
  assert.match(source, /MARKET_ESCROW_BN254_PUBLIC_HEX/);
  assert.match(source, /ASP_MEMBERSHIP_ADMIN_SECRET/);
  assert.match(source, /MARKET_SMOKE_USER_COOKIE/);
  assert.match(source, /MARKET_SMOKE_USER_WALLET_JSON/);
  assert.match(source, /stellar-address/);
  assert.match(source, /DIRECT_DATABASE_URL/);
  assert.doesNotMatch(source, /writeFileSync/);
  assert.doesNotMatch(source, /MARKET_SMOKE_USER_COOKIE=.*>/);
});

test("market deployment runbook names the required env and live smoke flow", () => {
  const source = readFileSync(join(root, "MARKET_DEPLOYMENT.md"), "utf8");

  assert.match(source, /MARKET_POOL_CONTRACT_ID/);
  assert.match(source, /MARKET_POOL_DEPLOYMENT_LEDGER/);
  assert.match(source, /MARKET_ESCROW_BN254_PUBLIC_HEX/);
  assert.match(source, /MARKET_ESCROW_X25519_PRIVATE_HEX/);
  assert.match(source, /MARKET_ADMIN_EMAIL/);
  assert.match(source, /npm run smoke:live:market/);
  assert.match(source, /MARKET_SMOKE_CONFIRM_RESOLVE=demo-settlement-yes/);
  assert.match(source, /db:migrate/);
  assert.match(source, /db:seed:markets/);
  assert.match(source, /deploy:check/);
});

test("market live smoke declares the real authenticated inputs it needs", () => {
  assert.deepEqual(REQUIRED_MARKET_SMOKE_ENV, [
    "MARKET_SMOKE_USER_COOKIE",
    "MARKET_SMOKE_ADMIN_COOKIE",
    "MARKET_SMOKE_USER_ID",
    "MARKET_SMOKE_USER_WALLET_JSON",
    "MARKET_SMOKE_CONFIRM_RESOLVE",
  ]);
});

test("market live smoke converts USDC decimals without floating point math", () => {
  assert.equal(decimalToUnits("1"), "10000000");
  assert.equal(decimalToUnits("1.25"), "12500000");
  assert.equal(decimalToUnits("0.0000001"), "1");
  assert.throws(() => decimalToUnits("0"), /positive/);
  assert.throws(() => decimalToUnits("1.12345678"), /7 decimals/);
});

test("market live smoke selects an open pool-active market by slug or first available", () => {
  const markets = [
    { slug: "closed", status: "resolved", poolActive: true },
    { slug: "pending-pool", status: "open", poolActive: false },
    { slug: "btc-higher-after-21d", status: "open", poolActive: true },
  ];

  assert.equal(selectSmokeMarket(markets)?.slug, "btc-higher-after-21d");
  assert.equal(selectSmokeMarket(markets, "btc-higher-after-21d")?.slug, "btc-higher-after-21d");
  assert.equal(selectSmokeMarket(markets, "missing"), null);
});

test("market live smoke filters payout execution to the current smoke user", () => {
  const payouts = [
    { id: "stale-submitted", userId: "old-user", status: "submitted" },
    { id: "current-pending", userId: "current-user", status: "pending" },
    { id: "stale-pending", userId: "other-user", status: "pending" },
  ];

  assert.deepEqual(selectSmokePayoutIds(payouts, "current-user"), ["current-pending"]);
  assert.deepEqual(selectSmokePayoutIds(payouts, "missing-user"), []);
});
