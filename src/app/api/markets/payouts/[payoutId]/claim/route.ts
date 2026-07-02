import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { createAuthOptions } from "@/lib/server/auth";
import { getPgPool } from "@/lib/server/db";
import {
  claimMarketPayoutNote,
  recordMarketActivity,
} from "@/lib/server/markets/marketRepository";
import { emitMarketUserNotification } from "@/lib/server/markets/marketNotifications";
import {
  serializeMarketPayout,
  serializeMarketUserNote,
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

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ payoutId: string }> },
) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { payoutId } = await context.params;
  const commitmentHex = readString(payload.commitmentHex);
  const encryptedNoteCiphertext = readString(payload.encryptedNoteCiphertext);
  if (!commitmentHex || !encryptedNoteCiphertext) {
    return NextResponse.json(
      { error: "commitmentHex and encryptedNoteCiphertext are required" },
      { status: 400 },
    );
  }

  let claimed;
  const db = getPgPool();
  try {
    claimed = await claimMarketPayoutNote(db, {
      userId: auth.userId,
      payoutId,
      commitmentHex,
      encryptedNoteCiphertext,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  if (!claimed) {
    return NextResponse.json(
      { error: "Payout is not ready to claim" },
      { status: 409 },
    );
  }

  await recordMarketActivity(db, {
    userId: auth.userId,
    marketId: claimed.payout.market_id,
    payoutId: claimed.payout.id,
    eventType: "market_payout_claimed",
    eventData: { commitmentHex },
    txHash: claimed.payout.tx_hash,
  });
  await emitMarketUserNotification(db, {
    userId: auth.userId,
    eventType: "market_payout_claimed",
    marketId: claimed.payout.market_id,
    payoutId: claimed.payout.id,
    noteId: claimed.note.id,
    entityKind: "market_payout",
    entityId: claimed.payout.id,
    amountUnits: String(claimed.payout.amount_units),
    title: "Market payout claimed",
    actionUrl: "/market?view=portfolio&tab=notes",
    txHash: claimed.payout.tx_hash,
    eventData: {
      commitmentHex,
      noteId: claimed.note.id,
    },
  });

  return NextResponse.json({
    payout: serializeMarketPayout(claimed.payout),
    note: serializeMarketUserNote(claimed.note),
  });
}
