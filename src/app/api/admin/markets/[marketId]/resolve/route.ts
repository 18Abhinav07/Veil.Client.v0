import { NextResponse } from "next/server";

import { getPgPool } from "@/lib/server/db";
import { requireMarketAdmin } from "@/lib/server/markets/marketAuth";
import { resolveMarketAndCreateSettlement } from "@/lib/server/markets/marketRepository";
import type { MarketOutcome } from "@/lib/server/markets/marketTypes";

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

function readOutcome(value: unknown): MarketOutcome | null {
  return value === "YES" || value === "NO" ? value : null;
}

export async function POST(
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

    const outcome = readOutcome(payload.outcome);
    if (!outcome) {
      return NextResponse.json({ error: "outcome must be YES or NO" }, { status: 400 });
    }
    const { marketId } = await context.params;
    const result = await resolveMarketAndCreateSettlement(getPgPool(), {
      marketId,
      winningOutcome: outcome,
      resolverEmail: session?.user?.email ?? "abhinavpangaria2003@gmail.com",
      evidenceText: readString(payload.evidenceText) || null,
      evidenceUrl: readString(payload.evidenceUrl) || null,
    });

    return NextResponse.json({
      resolution: result.resolution,
      settlementJob: result.settlementJob,
      payouts: result.payouts,
      settlement: result.settlement,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/winningPool/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return adminError(error);
  }
}
