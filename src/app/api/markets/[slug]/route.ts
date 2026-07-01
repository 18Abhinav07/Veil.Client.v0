import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { createAuthOptions } from "@/lib/server/auth";
import { getPgPool } from "@/lib/server/db";
import { requireInternalServiceAccess } from "@/lib/server/internalServiceAuth";
import {
  getMarketBySlug,
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

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  const { slug } = await context.params;
  const db = getPgPool();
  const publicMarket = await getMarketBySlug(db, { slug, includeDemo: false });
  const demoMarket = publicMarket
    ? null
    : allowInternalDemoMarketAccess(request)
      ? await getMarketBySlug(db, { slug, includeDemo: true })
      : null;
  const resolvedMarket = publicMarket ?? demoMarket;
  const [market, portfolio] = await Promise.all([
    Promise.resolve(resolvedMarket),
    listUserMarketPortfolio(db, { userId: auth.userId }),
  ]);
  if (!market) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }

  return NextResponse.json({
    market: serializeMarket(market),
    portfolio: serializeMarketPortfolio(portfolio),
  });
}
