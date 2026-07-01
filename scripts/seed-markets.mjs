import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

import { getDirectDatabaseUrl, loadMigrationEnv, parseDotEnv } from "./apply-migration.mjs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const backendEnvPath = join(root, "..", "backend", ".env");

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function readString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readPoolStatus(contractId) {
  return contractId ? "active" : "planned";
}

export function loadMarketSeedEnv(env = process.env) {
  loadMigrationEnv(env);
  if (!existsSync(backendEnvPath)) return;
  const backendEnv = parseDotEnv(readFileSync(backendEnvPath, "utf8"));
  for (const [key, value] of Object.entries(backendEnv)) {
    if (!env[key] && value) env[key] = value;
  }
}

export function readMarketPoolConfig(env = process.env) {
  const contractId =
    readString(env.MARKET_POOL_CONTRACT_ID) ||
    readString(env.NEXT_PUBLIC_MARKET_POOL_CONTRACT_ID) ||
    null;
  const deployerKeyId =
    readString(env.MARKET_POOL_DEPLOYER_KEY_ID) ||
    readString(env.POOL_DEPLOYER_KEY_ID) ||
    "wallet-pool-deployer";
  return {
    poolId: readString(env.MARKET_POOL_ID) || "veil_market_pool_v1",
    contractId,
    deployerKeyId,
    treeDepth: readInteger(env.MARKET_POOL_TREE_DEPTH, 10),
    deploymentLedger: readInteger(env.MARKET_POOL_DEPLOYMENT_LEDGER, 1),
    status: readPoolStatus(contractId),
  };
}

export function buildMarketSeedRows({
  seededAt = new Date(),
  includeDemo = false,
} = {}) {
  const rows = [
    {
      slug: "btc-higher-after-21d",
      title: "Will Bitcoin be higher 21 days after this market opens?",
      category: "Crypto",
      status: "open",
      closesAt: addDays(seededAt, 21).toISOString(),
      resolvesAt: addDays(seededAt, 22).toISOString(),
      rules:
        "Resolves YES if the BTC/USD spot index at market close is strictly higher than the launch snapshot recorded when the market is seeded.",
      resolutionSource: "Coinbase BTC-USD spot market and CoinMarketCap public BTC/USD reference cross-check",
      iconName: "bitcoin",
      displayOrder: 10,
      demoOnly: false,
    },
    {
      slug: "eth-higher-after-21d",
      title: "Will Ethereum be higher 21 days after this market opens?",
      category: "Crypto",
      status: "open",
      closesAt: addDays(seededAt, 21).toISOString(),
      resolvesAt: addDays(seededAt, 22).toISOString(),
      rules:
        "Resolves YES if the ETH/USD spot index at market close is strictly higher than the launch snapshot recorded when the market is seeded.",
      resolutionSource: "Coinbase ETH-USD spot market and CoinMarketCap public ETH/USD reference cross-check",
      iconName: "coins",
      displayOrder: 20,
      demoOnly: false,
    },
    {
      slug: "xlm-higher-after-14d",
      title: "Will Stellar XLM be higher 14 days after this market opens?",
      category: "Crypto",
      status: "open",
      closesAt: addDays(seededAt, 14).toISOString(),
      resolvesAt: addDays(seededAt, 15).toISOString(),
      rules:
        "Resolves YES if the XLM/USD spot index at market close is strictly higher than the launch snapshot recorded when the market is seeded.",
      resolutionSource: "CoinMarketCap and CoinGecko public XLM/USD reference cross-check",
      iconName: "sparkles",
      displayOrder: 30,
      demoOnly: false,
    },
    {
      slug: "sp500-higher-after-21d",
      title: "Will the S&P 500 close higher 21 days after this market opens?",
      category: "Finance",
      status: "open",
      closesAt: addDays(seededAt, 21).toISOString(),
      resolvesAt: addDays(seededAt, 22).toISOString(),
      rules:
        "Resolves YES if the official S&P 500 close at market close is strictly higher than the launch snapshot recorded when the market is seeded.",
      resolutionSource: "S&P Dow Jones Indices official S&P 500 close and Nasdaq/Yahoo Finance public cross-check",
      iconName: "line-chart",
      displayOrder: 40,
      demoOnly: false,
    },
    {
      slug: "nvidia-higher-after-14d",
      title: "Will NVIDIA close higher 14 days after this market opens?",
      category: "Tech",
      status: "open",
      closesAt: addDays(seededAt, 14).toISOString(),
      resolvesAt: addDays(seededAt, 15).toISOString(),
      rules:
        "Resolves YES if NVIDIA's regular-session closing price at market close is strictly higher than the launch snapshot recorded when the market is seeded.",
      resolutionSource: "Nasdaq official NVDA close and Yahoo Finance public cross-check",
      iconName: "cpu",
      displayOrder: 50,
      demoOnly: false,
    },
    {
      slug: "demo-settlement-yes",
      title: "Demo market: resolves YES for settlement testing",
      category: "Demo",
      status: "open",
      closesAt: addDays(seededAt, 1).toISOString(),
      resolvesAt: addDays(seededAt, 1).toISOString(),
      rules:
        "Controlled demo market for testing private bet recording, admin resolution, and payout calculation.",
      resolutionSource: "Internal demo resolver",
      iconName: "flask-conical",
      displayOrder: 60,
      demoOnly: true,
    },
  ];

  return includeDemo ? rows : rows.filter((row) => !row.demoOnly);
}

export function buildSeedMarketsSql() {
  return `
insert into market_pools (
  pool_id, contract_id, tree_depth, deployment_ledger, status, metadata
) values ($1, $2, $3, $4, $5, $6::jsonb)
on conflict (pool_id) do update set
  contract_id = excluded.contract_id,
  tree_depth = excluded.tree_depth,
  deployment_ledger = excluded.deployment_ledger,
  status = excluded.status,
  metadata = excluded.metadata,
  updated_at = now();

insert into prediction_markets (
  pool_id, slug, title, category, status, closes_at, resolves_at,
  rules, resolution_source, icon_name, display_order, demo_only
) values (...)
on conflict (slug) do update set
  pool_id = excluded.pool_id,
  title = excluded.title,
  category = excluded.category,
  status = excluded.status,
  closes_at = excluded.closes_at,
  resolves_at = excluded.resolves_at,
  rules = excluded.rules,
  resolution_source = excluded.resolution_source,
  icon_name = excluded.icon_name,
  display_order = excluded.display_order,
  demo_only = excluded.demo_only,
  updated_at = now();
`;
}

export async function seedMarketsWithClient(client, {
  env = process.env,
  seededAt = new Date(),
  includeDemo = false,
} = {}) {
  const poolConfig = readMarketPoolConfig(env);
  const rows = buildMarketSeedRows({ seededAt, includeDemo });

  await client.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into market_pools (
         pool_id, contract_id, tree_depth, deployment_ledger, status, metadata
       ) values ($1, $2, $3, $4, $5, $6::jsonb)
       on conflict (pool_id) do update set
         contract_id = excluded.contract_id,
         tree_depth = excluded.tree_depth,
         deployment_ledger = excluded.deployment_ledger,
         status = excluded.status,
         metadata = excluded.metadata,
         updated_at = now()`,
      [
        poolConfig.poolId,
        poolConfig.contractId,
        poolConfig.treeDepth,
        poolConfig.deploymentLedger,
        poolConfig.status,
        JSON.stringify({
          seededBy: "script",
          deployerKeyId: poolConfig.deployerKeyId,
          deployerKeyPolicy: "reuse_wallet_pool_deployer_without_exposing_secret",
          poolBoundary: poolConfig.contractId ? "live_contract_configured" : "contract_pending",
        }),
      ],
    );

    for (const row of rows) {
      await client.query(
        `insert into prediction_markets (
           pool_id, slug, title, category, status, closes_at, resolves_at,
           rules, resolution_source, icon_name, display_order, demo_only
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         on conflict (slug) do update set
           pool_id = excluded.pool_id,
           title = excluded.title,
           category = excluded.category,
           status = excluded.status,
           closes_at = excluded.closes_at,
           resolves_at = excluded.resolves_at,
           rules = excluded.rules,
           resolution_source = excluded.resolution_source,
           icon_name = excluded.icon_name,
           display_order = excluded.display_order,
           demo_only = excluded.demo_only,
           updated_at = now()`,
        [
          poolConfig.poolId,
          row.slug,
          row.title,
          row.category,
          row.status,
          row.closesAt,
          row.resolvesAt,
          row.rules,
          row.resolutionSource,
          row.iconName,
          row.displayOrder,
          row.demoOnly,
        ],
      );
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }

  return { pool: poolConfig, markets: rows };
}

export async function main(env = process.env) {
  loadMarketSeedEnv(env);
  const includeDemo = env.MARKET_INCLUDE_DEMO === "true";
  const client = new pg.Client({ connectionString: getDirectDatabaseUrl(env) });
  const result = await seedMarketsWithClient(client, { env, includeDemo });
  console.log(`Seeded ${result.markets.length} markets into ${result.pool.poolId}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
