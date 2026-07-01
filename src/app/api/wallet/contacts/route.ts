import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { createAuthOptions } from "@/lib/server/auth";
import { getPgPool } from "@/lib/server/db";
import {
  createWalletContactRequest,
  createNotification,
  findWalletProfileForContact,
  listWalletContacts,
  recordActivityEvent,
  type ContactViewRow,
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

function serializeContact(row: ContactViewRow) {
  return {
    id: row.id,
    requesterUserId: row.requester_user_id,
    contactUserId: row.contact_user_id,
    status: row.status,
    direction: row.direction,
    otherUserId: row.other_user_id,
    otherEmail: row.other_email,
    otherHandle: row.other_handle,
    otherStellarPublicKey: row.other_stellar_public_key,
    otherRegisteredInPool: row.other_registered_in_pool,
    otherBn254PublicHex: row.other_bn254_public_hex,
    otherX25519PublicHex: row.other_x25519_public_hex,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  const contacts = await listWalletContacts(getPgPool(), { userId: auth.userId });
  return NextResponse.json({ contacts: contacts.map(serializeContact) });
}

export async function POST(request: Request) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = readString(payload.query);
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const profile = await findWalletProfileForContact(getPgPool(), { query });
  if (!profile) {
    return NextResponse.json({ error: "No VEIL wallet found for this contact" }, { status: 404 });
  }
  if (profile.user_id === auth.userId) {
    return NextResponse.json({ error: "Cannot add your own wallet as a contact" }, { status: 400 });
  }

  const contact = await createWalletContactRequest(getPgPool(), {
    requesterUserId: auth.userId,
    contactUserId: profile.user_id,
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact request could not be created" }, { status: 409 });
  }

  const db = getPgPool();
  const [senderEvent, recipientEvent] = await Promise.all([
    recordActivityEvent(db, {
      userId: auth.userId,
      eventType: "contact_request_sent",
      eventData: { contactId: contact.id, contactUserId: profile.user_id },
    }),
    recordActivityEvent(db, {
      userId: profile.user_id,
      eventType: "contact_request_received",
      eventData: { contactId: contact.id, requesterUserId: auth.userId },
    }),
  ]);
  const profileLabel = profile.handle ? `@${profile.handle}` : profile.email;
  await Promise.all([
    createNotification(db, {
      userId: auth.userId,
      activityEventId: senderEvent?.id,
      type: "contact_request_sent",
      entityKind: "contact",
      entityId: contact.id,
      title: "Contact request sent",
      body: profileLabel ? `Waiting for ${profileLabel} to accept.` : "Waiting for the wallet to accept.",
      actionUrl: "/wallet?tab=contacts",
    }),
    createNotification(db, {
      userId: profile.user_id,
      activityEventId: recipientEvent?.id,
      type: "contact_request_received",
      entityKind: "contact",
      entityId: contact.id,
      title: "New contact request",
      body: "Review the request in Contacts.",
      actionUrl: "/wallet?tab=contacts",
    }),
  ]);

  return NextResponse.json({ contact });
}
