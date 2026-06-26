import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const backendEnvPath = join(root, "..", "backend", ".env");
const { loadEnvConfig } = nextEnv;

export const REQUIRED_ENV = [
  "DATABASE_URL",
  "DIRECT_DATABASE_URL",
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "INTERNAL_SERVICE_AUTH_TOKEN",
  "JOB_EXECUTION_ENCRYPTION_KEY",
  "PROVER_API_URL",
  "RELAYER_URL",
  "STELLAR_RPC_URL",
  "NETWORK_PASSPHRASE",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_POOL_ID",
  "NEXT_PUBLIC_USDC_CONTRACT_ID",
  "MARKET_POOL_ID",
  "MARKET_POOL_CONTRACT_ID",
  "MARKET_POOL_DEPLOYMENT_LEDGER",
  "MARKET_ESCROW_BN254_PUBLIC_HEX",
  "MARKET_ESCROW_X25519_PUBLIC_HEX",
  "MARKET_ESCROW_BN254_PRIVATE_HEX",
  "MARKET_ESCROW_X25519_PRIVATE_HEX",
  "MARKET_ESCROW_MEMBERSHIP_BLINDING_HEX",
];

function run(name, command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${name} failed`);
  }
}

function parseDotEnv(text) {
  const parsed = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function loadBackendEnvFallback(env) {
  if (existsSync(backendEnvPath)) {
    const backendEnv = parseDotEnv(readFileSync(backendEnvPath, "utf8"));
    for (const [key, value] of Object.entries(backendEnv)) {
      if (!env[key] && value) env[key] = value;
    }
  }
  if (!env.NEXT_PUBLIC_APP_URL) env.NEXT_PUBLIC_APP_URL = "http://localhost:3002";
}

async function fetchReady(name, url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    throw new Error(`${name} readiness failed: HTTP ${response.status}`);
  }
}

export async function main(env = process.env) {
  loadEnvConfig(root);
  loadBackendEnvFallback(env);
  const missing = REQUIRED_ENV.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }

  run("db:check", "npm", ["run", "db:check"]);

  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002";
  await fetchReady("app", `${appUrl.replace(/\/$/, "")}/api/ready`);

  if (env.PROVER_API_URL) {
    await fetchReady("prover", `${env.PROVER_API_URL.replace(/\/$/, "")}/health`);
  }
  if (env.RELAYER_URL) {
    await fetchReady("relayer", `${env.RELAYER_URL.replace(/\/$/, "")}/health`);
  }

  console.log("Deploy check passed");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
