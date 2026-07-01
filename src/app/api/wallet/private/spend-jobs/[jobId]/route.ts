import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { createAuthOptions } from "@/lib/server/auth";
import { getPgPool } from "@/lib/server/db";
import { getSpendJobDetail } from "@/lib/server/walletRepository";
import { serializeSpendJobDetail } from "@/lib/server/spendJobSerialization";

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

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  const { jobId } = await context.params;
  const detail = await getSpendJobDetail(getPgPool(), {
    userId: auth.userId,
    jobId,
  });
  if (!detail) {
    return NextResponse.json({ error: "Spend job not found" }, { status: 404 });
  }
  return NextResponse.json({ job: serializeSpendJobDetail(detail) });
}
