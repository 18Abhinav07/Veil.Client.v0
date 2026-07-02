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
import {
  getWalletBadgeCounts,
  listNotifications,
  type NotificationRow,
} from "@/lib/server/walletRepository";

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

function serializeNotification(row: NotificationRow) {
  return {
    id: row.id,
    activityEventId: row.activity_event_id,
    type: row.type,
    severity: row.severity,
    entityKind: row.entity_kind,
    entityId: row.entity_id,
    title: row.title,
    body: row.body,
    actionUrl: row.action_url,
    readAt: row.read_at,
    seenAt: row.seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: Request) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  const db = getPgPool();
  const includeDemo = false;
  const includeInternalDemo = allowInternalDemoMarketAccess(request);
  const [markets, portfolio, notifications, badges] = await Promise.all([
    listMarkets(db, { includeClosed: true, includeDemo: includeDemo || includeInternalDemo }),
    listUserMarketPortfolio(db, { userId: auth.userId }),
    listNotifications(db, { userId: auth.userId, unreadOnly: false, limit: 20 }),
    getWalletBadgeCounts(db, { userId: auth.userId }),
  ]);

  return NextResponse.json({
    markets: markets.map(serializeMarket),
    portfolio: serializeMarketPortfolio(portfolio),
    notifications: notifications.map(serializeNotification),
    notificationUnreadCount: badges.unreadNotifications,
  });
}
