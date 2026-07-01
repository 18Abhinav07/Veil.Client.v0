import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { createAuthOptions } from "@/lib/server/auth";
import { getPgPool } from "@/lib/server/db";
import { getWalletBadgeCounts } from "@/lib/server/walletRepository";

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

export async function GET() {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  const badges = await getWalletBadgeCounts(getPgPool(), { userId: auth.userId });
  return NextResponse.json({
    badges: {
      incomingContactRequests: badges.incomingContactRequests,
      openPaymentRequests: badges.openPaymentRequests,
      unreadNotifications: badges.unreadNotifications,
      recoverableJobs: badges.recoverableJobs,
    },
  });
}
