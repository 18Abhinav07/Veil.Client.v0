import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { createAuthOptions } from "@/lib/server/auth";
import { getPgPool } from "@/lib/server/db";
import { findRegisteredRecipient, findWalletProfileForContact } from "@/lib/server/walletRepository";

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

function readQuery(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function serializeRecipient(
  recipient: Awaited<ReturnType<typeof findRegisteredRecipient>>,
) {
  if (!recipient) return null;
  return {
    userId: recipient.user_id,
    email: recipient.email,
    handle: recipient.handle,
    stellarPublicKey: recipient.stellar_public_key,
    registeredInPool: recipient.registered_in_pool,
    bn254PublicHex: recipient.bn254_public_hex,
    x25519PublicHex: recipient.x25519_public_hex,
  };
}

async function resolveRecipient(query: string, mode: string) {
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const recipient =
    mode === "public" || mode === "direct"
      ? await findWalletProfileForContact(getPgPool(), { query })
      : await findRegisteredRecipient(getPgPool(), { query });
  if (!recipient) {
    return NextResponse.json({
      recipient: null,
      registeredInPool: false,
      error: "No registered VEIL wallet found for this recipient",
    });
  }

  return NextResponse.json({
    recipient: serializeRecipient(recipient),
    registeredInPool: recipient.registered_in_pool,
  });
}

export async function GET(request: Request) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  const params = new URL(request.url).searchParams;
  const query = params.get("query") ?? "";
  return resolveRecipient(readQuery(query), readQuery(params.get("mode")));
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

  return resolveRecipient(readQuery(payload.query), readQuery(payload.mode));
}
