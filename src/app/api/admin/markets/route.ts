import { NextResponse } from "next/server";

import { getPgPool } from "@/lib/server/db";
import {
  createPredictionMarketDraft,
  ensureMarketPool,
  listMarkets,
  upsertMarketSeeds,
  type MarketPoolRow,
} from "@/lib/server/markets/marketRepository";
import { requireMarketAdmin } from "@/lib/server/markets/marketAuth";
import { buildInitialMarketSeeds } from "@/lib/server/markets/marketSeeds";
import {
  serializeMarket,
  serializeMarketPool,
} from "@/lib/server/markets/marketSerialization";
import { getWalletServerEnv } from "@/lib/server/serverEnv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SERVER_ENV = getWalletServerEnv();

function adminError(error: unknown) {
  const status = typeof (error as { status?: unknown })?.status === "number"
    ? (error as { status: number }).status
    : 500;
  return NextResponse.json(
    { error: error instanceof Error ? error.message : String(error) },
    { status },
  );
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readPoolStatus(contractId: string | null): MarketPoolRow["status"] {
  return contractId ? "active" : "planned";
}

function readMarketPoolConfig() {
  const contractId =
    readString(SERVER_ENV.MARKET_POOL_CONTRACT_ID) ||
    readString(SERVER_ENV.NEXT_PUBLIC_MARKET_POOL_CONTRACT_ID) ||
    null;
  const deployerKeyId =
    readString(SERVER_ENV.MARKET_POOL_DEPLOYER_KEY_ID) ||
    readString(SERVER_ENV.POOL_DEPLOYER_KEY_ID) ||
    "wallet-pool-deployer";
  return {
    poolId: readString(SERVER_ENV.MARKET_POOL_ID) || "veil_market_pool_v1",
    contractId,
    deployerKeyId,
    treeDepth: readInteger(SERVER_ENV.MARKET_POOL_TREE_DEPTH, 10),
    deploymentLedger: readInteger(SERVER_ENV.MARKET_POOL_DEPLOYMENT_LEDGER, 1),
    status: readPoolStatus(contractId),
  };
}

export async function GET() {
  try {
    const session = await requireMarketAdmin();
    const markets = await listMarkets(getPgPool(), {
      includeAdminStatuses: true,
      includeDemo: false,
    });
    return NextResponse.json({
      adminEmail: session?.user?.email ?? "abhinavpangaria2003@gmail.com",
      markets: markets.map(serializeMarket),
    });
  } catch (error) {
    return adminError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireMarketAdmin();
    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const action = readString(payload.action);
    if (action !== "seed" && action !== "create") {
      return NextResponse.json({ error: "Unsupported admin market action" }, { status: 400 });
    }

    const poolConfig = readMarketPoolConfig();
    const includeDemo = false;
    const includeSmokeDemo = payload.smokeOnly === true && payload.includeDemo === true;
    const db = getPgPool();
    const pool = await ensureMarketPool(db, {
      ...poolConfig,
      metadata: {
        seededBy: "admin",
        deployerKeyId: poolConfig.deployerKeyId,
        deployerKeyPolicy: "reuse_wallet_pool_deployer_without_exposing_secret",
        poolBoundary: poolConfig.contractId ? "live_contract_configured" : "contract_pending",
      },
    });

    if (action === "create") {
      const market = await createPredictionMarketDraft(db, {
        poolId: poolConfig.poolId,
        slug: readString(payload.slug),
        title: readString(payload.title),
        category: readString(payload.category),
        closesAt: readString(payload.closesAt),
        resolvesAt: readString(payload.resolvesAt) || null,
        rules: readString(payload.rules),
        resolutionSource: readString(payload.resolutionSource),
        iconName: readString(payload.iconName) || "circle-dot",
        displayOrder: Number.isFinite(Number(payload.displayOrder))
          ? Number(payload.displayOrder)
          : 100,
        adminEmail: session?.user?.email ?? "abhinavpangaria2003@gmail.com",
      });
      if (!market) {
        return NextResponse.json({ error: "Market draft could not be created" }, { status: 409 });
      }
      const markets = await listMarkets(db, {
        includeAdminStatuses: true,
        includeDemo: false,
      });
      return NextResponse.json({
        pool: pool ? serializeMarketPool(pool) : null,
        market: serializeMarket(market),
        markets: markets.map(serializeMarket),
      });
    }

    const markets = await upsertMarketSeeds(db, {
      poolId: poolConfig.poolId,
      seeds: buildInitialMarketSeeds({ includeDemo: includeDemo || includeSmokeDemo }),
    });

    return NextResponse.json({
      pool: pool ? serializeMarketPool(pool) : null,
      markets: markets.map(serializeMarket),
    });
  } catch (error) {
    return adminError(error);
  }
}
