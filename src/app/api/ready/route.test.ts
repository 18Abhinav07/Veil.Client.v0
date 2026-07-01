import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("readiness route checks env and database without exposing secrets", () => {
  const source = readFileSync(join(root, "src", "app", "api", "ready", "route.ts"), "utf8");

  assert.match(source, /runtime = "nodejs"/);
  assert.match(source, /DATABASE_URL/);
  assert.match(source, /AUTH_SECRET/);
  assert.match(source, /INTERNAL_SERVICE_AUTH_TOKEN/);
  assert.match(source, /JOB_EXECUTION_ENCRYPTION_KEY/);
  assert.match(source, /PROVER_API_URL/);
  assert.match(source, /RELAYER_URL/);
  assert.match(source, /STELLAR_RPC_URL/);
  assert.match(source, /MARKET_POOL_ID/);
  assert.match(source, /MARKET_POOL_CONTRACT_ID/);
  assert.match(source, /MARKET_POOL_DEPLOYMENT_LEDGER/);
  assert.match(source, /MARKET_ESCROW_BN254_PUBLIC_HEX/);
  assert.match(source, /MARKET_ESCROW_X25519_PUBLIC_HEX/);
  assert.match(source, /MARKET_ESCROW_BN254_PRIVATE_HEX/);
  assert.match(source, /MARKET_ESCROW_X25519_PRIVATE_HEX/);
  assert.match(source, /MARKET_ESCROW_MEMBERSHIP_BLINDING_HEX/);
  assert.match(source, /select 1 as ok/i);
  assert.match(source, /PROVER_API_URL[\s\S]*\/health/);
  assert.match(source, /RELAYER_URL[\s\S]*\/health/);
  assert.match(source, /NextResponse\.json/);
  assert.doesNotMatch(source, /AUTH_GOOGLE_SECRET.*value/);
  assert.doesNotMatch(source, /DATABASE_URL.*value/);
});

test("deploy check script validates env, schema, services, and app readiness", () => {
  const packageJson = readFileSync(join(root, "package.json"), "utf8");
  const source = readFileSync(join(root, "scripts", "deploy-check.mjs"), "utf8");

  assert.match(packageJson, /"deploy:check": "node scripts\/deploy-check\.mjs"/);
  assert.match(source, /REQUIRED_ENV/);
  assert.match(source, /loadBackendEnvFallback/);
  assert.match(source, /backend.*\.env/);
  assert.match(source, /NEXT_PUBLIC_APP_URL = "http:\/\/localhost:3002"/);
  assert.match(source, /db:check/);
  assert.match(source, /\/api\/ready/);
  assert.match(source, /PROVER_API_URL[\s\S]*\/health/);
  assert.match(source, /RELAYER_URL[\s\S]*\/health/);
  assert.doesNotMatch(source, /PROVER_API_URL\.replace[\s\S]*\/ready/);
  assert.doesNotMatch(source, /RELAYER_URL\.replace[\s\S]*\/ready/);
  assert.match(source, /PROVER_API_URL/);
  assert.match(source, /RELAYER_URL/);
  assert.match(source, /MARKET_POOL_ID/);
  assert.match(source, /MARKET_POOL_CONTRACT_ID/);
  assert.match(source, /MARKET_POOL_DEPLOYMENT_LEDGER/);
  assert.match(source, /MARKET_ESCROW_BN254_PUBLIC_HEX/);
  assert.match(source, /MARKET_ESCROW_X25519_PUBLIC_HEX/);
  assert.match(source, /MARKET_ESCROW_BN254_PRIVATE_HEX/);
  assert.match(source, /MARKET_ESCROW_X25519_PRIVATE_HEX/);
  assert.match(source, /MARKET_ESCROW_MEMBERSHIP_BLINDING_HEX/);
  assert.match(source, /AbortSignal\.timeout/);
});
