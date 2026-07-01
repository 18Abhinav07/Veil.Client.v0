import { NextResponse } from "next/server";

import { getPgPool } from "@/lib/server/db";
import { requireMarketAdmin } from "@/lib/server/markets/marketAuth";
import {
  cancelMarket,
  closeMarketForResolution,
  openPredictionMarketDraft,
  updatePredictionMarketDraft,
} from "@/lib/server/markets/marketRepository";
import { serializeMarket } from "@/lib/server/markets/marketSerialization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ marketId: string }> },
) {
  try {
    const session = await requireMarketAdmin();
    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const action = readString(payload.action);
    const { marketId } = await context.params;
    const adminEmail = session?.user?.email ?? "abhinavpangaria2003@gmail.com";
    const db = getPgPool();

    if (action === "update") {
      const market = await updatePredictionMarketDraft(db, {
        marketId,
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
        adminEmail,
      });
      if (!market) {
        return NextResponse.json({ error: "Market draft cannot be updated" }, { status: 409 });
      }
      return NextResponse.json({ market: serializeMarket(market) });
    }

    if (action === "open") {
      const market = await openPredictionMarketDraft(db, { marketId, adminEmail });
      if (!market) {
        return NextResponse.json({ error: "Market draft cannot be opened" }, { status: 409 });
      }
      return NextResponse.json({ market: serializeMarket(market) });
    }

    if (action === "close") {
      const market = await closeMarketForResolution(db, { marketId, adminEmail });
      if (!market) {
        return NextResponse.json({ error: "Market cannot be closed" }, { status: 409 });
      }
      return NextResponse.json({ market: serializeMarket(market) });
    }

    if (action === "cancel") {
      const market = await cancelMarket(db, {
        marketId,
        adminEmail,
        reason: readString(payload.reason) || null,
      });
      if (!market) {
        return NextResponse.json({ error: "Market cannot be cancelled" }, { status: 409 });
      }
      return NextResponse.json({ market: serializeMarket(market) });
    }

    return NextResponse.json({ error: "Unsupported market admin action" }, { status: 400 });
  } catch (error) {
    return adminError(error);
  }
}
