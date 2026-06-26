import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildMarketEnvUpdates,
  upsertDotEnv,
  upsertMarketPoolDeployment,
} from "./setup-market-env.mjs";

const root = process.cwd();

test("market env setup injects market config without persisting backend secrets", () => {
  const updates = buildMarketEnvUpdates({
    backendEnv: {
      DATABASE_URL: "postgres://pooled",
      DIRECT_DATABASE_URL: "postgres://direct",
      AUTH_SECRET: "auth-secret",
      AUTH_GOOGLE_ID: "google-id",
      AUTH_GOOGLE_SECRET: "google-secret",
      PROVER_API_URL: "http://127.0.0.1:4000",
      NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
      NEXT_PUBLIC_USDC_CONTRACT_ID: "CUSDC",
    },
    frontendEnv: {
      RELAYER_URL: "http://127.0.0.1:5000",
      MARKET_ESCROW_BN254_PRIVATE_HEX: "aa".repeat(32),
      MARKET_ESCROW_BN254_PUBLIC_HEX: "bb".repeat(32),
      MARKET_ESCROW_X25519_PRIVATE_HEX: "cc".repeat(32),
      MARKET_ESCROW_X25519_PUBLIC_HEX: "dd".repeat(32),
      MARKET_ESCROW_MEMBERSHIP_BLINDING_HEX: "ee".repeat(32),
    },
    marketPoolContractId: "CMARKETPOOL",
    marketPoolDeploymentLedger: "3365825",
    marketPoolTreeDepth: "10",
  });

  assert.equal(updates.DATABASE_URL, undefined);
  assert.equal(updates.DIRECT_DATABASE_URL, undefined);
  assert.equal(updates.AUTH_SECRET, undefined);
  assert.equal(updates.AUTH_GOOGLE_ID, undefined);
  assert.equal(updates.AUTH_GOOGLE_SECRET, undefined);
  assert.equal(updates.PROVER_API_URL, undefined);
  assert.equal(updates.NETWORK_PASSPHRASE, undefined);
  assert.equal(updates.MARKET_POOL_ID, "veil_market_pool_v1");
  assert.equal(updates.MARKET_POOL_CONTRACT_ID, "CMARKETPOOL");
  assert.equal(updates.NEXT_PUBLIC_MARKET_POOL_CONTRACT_ID, "CMARKETPOOL");
  assert.equal(updates.MARKET_POOL_DEPLOYMENT_LEDGER, "3365825");
  assert.equal(updates.MARKET_POOL_TREE_DEPTH, "10");
  assert.equal(updates.MARKET_POOL_DEPLOYER_KEY_ID, "private-payments-deployer");
  assert.equal(updates.MARKET_ADMIN_EMAIL, "abhinavpangaria2003@gmail.com");
  assert.equal(updates.MARKET_ESCROW_BN254_PRIVATE_HEX, "aa".repeat(32));
  assert.equal(updates.MARKET_ESCROW_X25519_PUBLIC_HEX, "dd".repeat(32));
});

test("market env setup updates existing keys and appends missing keys without duplicate entries", () => {
  const result = upsertDotEnv(
    [
      "RELAYER_URL=http://127.0.0.1:5000",
      "MARKET_POOL_CONTRACT_ID=COLD",
      "UNCHANGED=value",
    ].join("\n"),
    {
      MARKET_POOL_CONTRACT_ID: "CNEW",
      MARKET_POOL_DEPLOYMENT_LEDGER: "3365825",
    },
  );

  assert.match(result, /^RELAYER_URL=http:\/\/127\.0\.0\.1:5000$/m);
  assert.match(result, /^MARKET_POOL_CONTRACT_ID=CNEW$/m);
  assert.match(result, /^MARKET_POOL_DEPLOYMENT_LEDGER=3365825$/m);
  assert.match(result, /^UNCHANGED=value$/m);
  assert.equal((result.match(/^MARKET_POOL_CONTRACT_ID=/gm) ?? []).length, 1);
});

test("market env setup upserts the market pool into backend deployments config", () => {
  const result = upsertMarketPoolDeployment(
    JSON.stringify({
      network: "testnet",
      pools: [
        {
          poolContractId: "CWALLET",
          tokenContractId: "CUSDC",
          deploymentLedger: 100,
          enabled: true,
          asset: { kind: "classic", code: "USDC", issuer: "GISSUER" },
        },
      ],
    }),
    {
      poolContractId: "CMARKET",
      tokenContractId: "CUSDC",
      deploymentLedger: "3365825",
    },
  );

  const parsed = JSON.parse(result);
  assert.equal(parsed.pools.length, 2);
  assert.deepEqual(parsed.pools[1], {
    poolContractId: "CMARKET",
    tokenContractId: "CUSDC",
    deploymentLedger: 3365825,
    enabled: true,
    asset: { kind: "classic", code: "USDC", issuer: "GISSUER" },
  });
});

test("market env setup replaces an existing market pool deployment without duplicating it", () => {
  const result = upsertMarketPoolDeployment(
    JSON.stringify({
      pools: [
        {
          poolContractId: "CMARKET",
          tokenContractId: "COLD",
          deploymentLedger: 1,
          enabled: false,
          asset: { kind: "contract", contractId: "COLD", symbol: "OLD" },
        },
      ],
    }),
    {
      poolContractId: "CMARKET",
      tokenContractId: "CNEW",
      deploymentLedger: "42",
    },
  );

  const parsed = JSON.parse(result);
  assert.equal(parsed.pools.length, 1);
  assert.equal(parsed.pools[0].tokenContractId, "CNEW");
  assert.equal(parsed.pools[0].deploymentLedger, 42);
  assert.equal(parsed.pools[0].enabled, true);
});

test("package scripts expose the market env setup command and smoke check parses it", () => {
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const setupSource = readFileSync(join(root, "scripts", "setup-market-env.mjs"), "utf8");
  assert.equal(packageJson.scripts["market:setup-env"], "node scripts/setup-market-env.mjs");
  assert.match(packageJson.scripts["smoke:check"], /node --check scripts\/setup-market-env\.mjs/);
  assert.match(setupSource, /writeFileSync\(backendEnvPath/);
  assert.doesNotMatch(setupSource, /writeFileSync\(frontendEnvPath/);
  assert.match(setupSource, /deploymentsPath/);
  assert.match(setupSource, /"deployments", "testnet", "deployments\.json"/);
  assert.match(setupSource, /upsertMarketPoolDeployment/);
});
