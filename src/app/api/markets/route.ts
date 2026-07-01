import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { createAuthOptions } from "@/lib/server/auth";
import { getPgPool } from "@/lib/server/db";
import { requireInternalServiceAccess } from "@/lib/server/internalServiceAuth";
import {
  listMarkets,
  listUserMarketPortfolio,
} from "@/lib/server/markets/marketRepository";
import {
  serializeMarket,
  serializeMarketPortfolio,
} from "@/lib/server/markets/marketSerialization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireUserId() {
  const session = await getServerSession(createAuthOptions());
  const userId = session?.user?.id;
  if (!userId) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      userId: null,
    };
  }
  return { error: null, userId };
}

function allowInternalDemoMarketAccess(request: Request) {
  const url = new URL(request.url);
  return (
    url.searchParams.get("includeDemo") === "smoke" &&
    requireInternalServiceAccess(request.headers).ok
  );
}

export async function GET(request: Request) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  const db = getPgPool();
  const includeDemo = false;
  const includeInternalDemo = allowInternalDemoMarketAccess(request);
  const [markets, portfolio] = await Promise.all([
    listMarkets(db, { includeClosed: true, includeDemo: includeDemo || includeInternalDemo }),
    listUserMarketPortfolio(db, { userId: auth.userId }),
  ]);

  return NextResponse.json({
    markets: markets.map(serializeMarket),
    portfolio: serializeMarketPortfolio(portfolio),
  });
}
