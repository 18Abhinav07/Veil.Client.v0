import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { createAuthOptions } from "@/lib/server/auth";
import { getPgPool } from "@/lib/server/db";
import {
  acceptContactRequest,
  createNotification,
  declineContactRequest,
  recordActivityEvent,
  removeWalletContact,
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

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ contactId: string }> },
) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  const { contactId } = await context.params;
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = readString(payload.action);
  const db = getPgPool();
  const contact =
    action === "accept"
      ? await acceptContactRequest(db, { userId: auth.userId, contactId })
      : action === "decline"
        ? await declineContactRequest(db, { userId: auth.userId, contactId })
        : action === "remove"
          ? await removeWalletContact(db, { userId: auth.userId, contactId })
          : null;

  if (!contact) {
    return NextResponse.json({ error: "Contact action is not available" }, { status: 409 });
  }

  const eventType =
    action === "accept"
      ? "contact_request_accepted"
      : action === "decline"
        ? "contact_request_declined"
        : "contact_removed";
  const peerUserId =
    contact.requester_user_id === auth.userId ? contact.contact_user_id : contact.requester_user_id;
  const [actorEvent, peerEvent] = await Promise.all([
    recordActivityEvent(db, {
      userId: auth.userId,
      eventType,
      eventData: { contactId: contact.id, peerUserId },
    }),
    recordActivityEvent(db, {
      userId: peerUserId,
      eventType,
      eventData: { contactId: contact.id, peerUserId: auth.userId },
    }),
  ]);
  const notificationTitle =
    action === "accept"
      ? "Contact accepted"
      : action === "decline"
        ? "Contact request declined"
        : "Contact removed";
  const notificationType =
    action === "accept"
      ? "contact_request_accepted"
      : action === "decline"
        ? "contact_request_declined"
        : "contact_removed";
  await Promise.all([
    createNotification(db, {
      userId: auth.userId,
      activityEventId: actorEvent?.id,
      type: notificationType,
      severity: action === "decline" ? "warning" : "info",
      entityKind: "contact",
      entityId: contact.id,
      title: notificationTitle,
      body: "Your contact list was updated.",
      actionUrl: "/wallet?tab=contacts",
    }),
    createNotification(db, {
      userId: peerUserId,
      activityEventId: peerEvent?.id,
      type: notificationType,
      severity: action === "decline" ? "warning" : "info",
      entityKind: "contact",
      entityId: contact.id,
      title: notificationTitle,
      body: "A contact relationship changed.",
      actionUrl: "/wallet?tab=contacts",
    }),
  ]);

  return NextResponse.json({ contact });
}
