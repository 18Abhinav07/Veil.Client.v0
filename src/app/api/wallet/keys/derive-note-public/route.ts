import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { createAuthOptions } from "@/lib/server/auth";
import { getInternalServiceHeaders } from "@/lib/server/internalServiceAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PROVER_API = process.env.PROVER_API_URL ?? "http://localhost:3001";

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

function readHex32(value: unknown, label: string): string {
  const text = typeof value === "string" ? value.trim().replace(/^0x/, "") : "";
  if (!/^[0-9a-fA-F]{64}$/.test(text)) {
    throw new Error(`${label} must be 32-byte hex`);
  }
  return text.toLowerCase();
}

export async function POST(request: Request) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const notePrivateKeyHex = readHex32(
      payload.notePrivateKeyHex,
      "notePrivateKeyHex",
    );
    const upstream = await fetch(`${PROVER_API}/keys/derive-note-public`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getInternalServiceHeaders() },
      body: JSON.stringify({ notePrivateKeyHex }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return NextResponse.json(data, { status: upstream.status });
    }
    return NextResponse.json({
      notePublicKeyHex: readHex32(data.notePublicKeyHex, "notePublicKeyHex"),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
