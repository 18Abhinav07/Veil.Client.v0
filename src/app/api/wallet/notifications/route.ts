import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { createAuthOptions } from "@/lib/server/auth";
import { getPgPool } from "@/lib/server/db";
import {
  listNotifications,
  markNotificationsRead,
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

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";
  const rawLimit = Number(url.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 100) : 50;
  const notifications = await listNotifications(getPgPool(), {
    userId: auth.userId,
    unreadOnly,
    limit,
  });
  return NextResponse.json({ notifications: notifications.map(serializeNotification) });
}

export async function PATCH(request: Request) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const notificationIds = Array.isArray(payload.notificationIds)
    ? payload.notificationIds.filter((id): id is string => typeof id === "string" && id.trim() !== "")
    : [];
  if (notificationIds.length === 0) {
    return NextResponse.json({ error: "notificationIds is required" }, { status: 400 });
  }

  const notifications = await markNotificationsRead(getPgPool(), {
    userId: auth.userId,
    notificationIds,
  });
  return NextResponse.json({ notifications: notifications.map(serializeNotification) });
}
