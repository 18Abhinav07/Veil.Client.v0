import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { createAuthOptions } from "@/lib/server/auth";
import { getPgPool } from "@/lib/server/db";
import {
  createNotification,
  declinePaymentRequest,
  expirePaymentRequest,
  markPaymentRequestPaid,
  recordActivityEvent,
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
  context: { params: Promise<{ requestId: string }> },
) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  const { requestId } = await context.params;
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = readString(payload.action);
  const paidSpendJobId = readString(payload.paidSpendJobId);
  const db = getPgPool();
  const updated =
    action === "decline"
      ? await declinePaymentRequest(db, { requestId, payerUserId: auth.userId })
      : action === "expire"
        ? await expirePaymentRequest(db, { requestId, userId: auth.userId })
        : action === "mark_paid" && paidSpendJobId
          ? await markPaymentRequestPaid(db, {
              requestId,
              payerUserId: auth.userId,
              spendJobId: paidSpendJobId,
            })
          : null;

  if (!updated) {
    return NextResponse.json({ error: "Payment request action is not available" }, { status: 409 });
  }

  const eventType =
    updated.status === "paid"
      ? "payment_request_paid"
      : updated.status === "declined"
        ? "payment_request_declined"
        : "payment_request_expired";
  const requesterEvent = await recordActivityEvent(db, {
    userId: updated.requester_user_id,
    requestId: updated.id,
    spendJobId: updated.paid_spend_job_id,
    eventType,
    eventData: {
      payerUserId: updated.payer_user_id,
      paidSpendJobId: updated.paid_spend_job_id,
    },
  });
  const payerEvent = updated.payer_user_id
    ? await recordActivityEvent(db, {
        userId: updated.payer_user_id,
        requestId: updated.id,
        spendJobId: updated.paid_spend_job_id,
        eventType,
        eventData: {
          requesterUserId: updated.requester_user_id,
          paidSpendJobId: updated.paid_spend_job_id,
        },
      })
    : null;
  const title =
    updated.status === "paid"
      ? "Request paid"
      : updated.status === "declined"
        ? "Request declined"
        : "Request expired";
  await Promise.all([
    createNotification(db, {
      userId: updated.requester_user_id,
      activityEventId: requesterEvent?.id,
      type: eventType,
      severity: updated.status === "declined" ? "warning" : "info",
      entityKind: "payment_request",
      entityId: updated.id,
      title,
      body: "Payment request status changed.",
      actionUrl: "/wallet?tab=requests",
    }),
    updated.payer_user_id
      ? createNotification(db, {
          userId: updated.payer_user_id,
          activityEventId: payerEvent?.id,
          type: eventType,
          severity: updated.status === "declined" ? "warning" : "info",
          entityKind: "payment_request",
          entityId: updated.id,
          title,
          body: "Payment request status changed.",
          actionUrl: "/wallet?tab=requests",
        })
      : Promise.resolve(null),
  ]);

  return NextResponse.json({ request: updated });
}
