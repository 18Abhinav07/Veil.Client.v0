import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { createAuthOptions } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireSession() {
  const session = await getServerSession(createAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(request: Request) {
  const authError = await requireSession();
  if (authError) return authError;

  const body = (await request.json()) as { address?: unknown };
  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (!/^G[A-Z2-7]{55}$/.test(address)) {
    return NextResponse.json({ error: "Valid Stellar address required" }, { status: 400 });
  }

  const response = await fetch(
    `https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`,
    { cache: "no-store" },
  );
  const text = await response.text();
  let payload: unknown = text;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { message: text };
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: "Friendbot funding failed", detail: payload },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, friendbot: payload });
}
