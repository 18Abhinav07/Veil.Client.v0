import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { createAuthOptions } from "@/lib/server/auth";
import { getPgPool } from "@/lib/server/db";
import {
  createPaymentRequest,
  createNotification,
  findAcceptedContactProfile,
  listPaymentRequests,
  recordActivityEvent,
  type PaymentRequestViewRow,
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

function serializeRequest(row: PaymentRequestViewRow) {
  return {
    id: row.id,
    requesterUserId: row.requester_user_id,
    payerUserId: row.payer_user_id,
    payerEmail: row.payer_email,
    amountUnits: row.amount_units,
    assetCode: row.asset_code,
    memoCiphertext: row.memo_ciphertext,
    status: row.status,
    paidSpendJobId: row.paid_spend_job_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    direction: row.direction,
    requesterEmail: row.requester_email,
    requesterHandle: row.requester_handle,
    requesterStellarPublicKey: row.requester_stellar_public_key,
    requesterBn254PublicHex: row.requester_bn254_public_hex,
    requesterX25519PublicHex: row.requester_x25519_public_hex,
    payerHandle: row.payer_handle,
  };
}

export async function GET() {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  const requests = await listPaymentRequests(getPgPool(), { userId: auth.userId });
  return NextResponse.json({ requests: requests.map(serializeRequest) });
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

  const payerQuery = readString(payload.payerQuery);
  const amountUnits = readString(payload.amountUnits);
  const memoCiphertext = readString(payload.memoCiphertext);
  const expiresAtText = readString(payload.expiresAt);
  if (!payerQuery || !amountUnits || !memoCiphertext) {
    return NextResponse.json(
      { error: "payerQuery, amountUnits, and memoCiphertext are required" },
      { status: 400 },
    );
  }

  const payer = await findAcceptedContactProfile(getPgPool(), {
    userId: auth.userId,
    query: payerQuery,
  });
  if (!payer) {
    return NextResponse.json(
      { error: "Payment requests require an accepted contact" },
      { status: 403 },
    );
  }

  const created = await createPaymentRequest(getPgPool(), {
    requesterUserId: auth.userId,
    payerUserId: payer.user_id,
    payerEmail: payer.email,
    amountUnits,
    assetCode: "USDC",
    memoCiphertext,
    expiresAt: expiresAtText ? new Date(expiresAtText) : null,
  });
  if (!created) {
    return NextResponse.json(
      { error: "Payment request could not be created for this contact" },
      { status: 409 },
    );
  }

  const db = getPgPool();
  const [requesterEvent, payerEvent] = await Promise.all([
    recordActivityEvent(db, {
      userId: auth.userId,
      requestId: created.id,
      eventType: "payment_request_created",
      eventData: { payerUserId: payer.user_id, amountUnits },
    }),
    recordActivityEvent(db, {
      userId: payer.user_id,
      requestId: created.id,
      eventType: "payment_request_received",
      eventData: { requesterUserId: auth.userId, amountUnits },
    }),
  ]);
  await Promise.all([
    createNotification(db, {
      userId: auth.userId,
      activityEventId: requesterEvent?.id,
      type: "payment_request_created",
      entityKind: "payment_request",
      entityId: created.id,
      title: "Request sent",
      body: `${amountUnits} USDC request is waiting for approval.`,
      actionUrl: "/wallet?tab=requests",
    }),
    createNotification(db, {
      userId: payer.user_id,
      activityEventId: payerEvent?.id,
      type: "payment_request_received",
      severity: "info",
      entityKind: "payment_request",
      entityId: created.id,
      title: "Payment request received",
      body: `${amountUnits} USDC request is ready to review.`,
      actionUrl: "/wallet?tab=requests",
    }),
  ]);

  return NextResponse.json({ request: created });
}
