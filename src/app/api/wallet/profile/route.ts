import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { createAuthOptions } from "@/lib/server/auth";
import { getPgPool } from "@/lib/server/db";
import {
  getWalletProfileByUserId,
  updateWalletProfileHandle,
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

function normalizeHandle(handle: string) {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

function readHandle(value: unknown) {
  const handle = typeof value === "string" ? value.trim().replace(/^@/, "") : "";
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(handle)) {
    throw new Error("VEIL ID must be 3-24 letters, numbers, or underscores");
  }
  return handle;
}

function serializeProfile(profile: NonNullable<Awaited<ReturnType<typeof getWalletProfileByUserId>>>) {
  return {
    userId: profile.user_id,
    email: profile.email,
    handle: profile.handle,
    handleNormalized: profile.handle_normalized,
    stellarPublicKey: profile.stellar_public_key,
    registeredInPool: profile.registered_in_pool,
    bn254PublicHex: profile.bn254_public_hex,
    x25519PublicHex: profile.x25519_public_hex,
  };
}

export async function GET() {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  const profile = await getWalletProfileByUserId(getPgPool(), { userId: auth.userId });
  if (!profile) {
    return NextResponse.json({ profile: null }, { status: 404 });
  }
  return NextResponse.json({ profile: serializeProfile(profile) });
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

  let handle: string;
  try {
    handle = readHandle(payload.handle);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  try {
    const profile = await updateWalletProfileHandle(getPgPool(), {
      userId: auth.userId,
      handle,
    });
    if (!profile) {
      return NextResponse.json({ error: "Wallet profile not found" }, { status: 404 });
    }
    return NextResponse.json({
      profile: {
        ...serializeProfile(profile),
        handleNormalized: normalizeHandle(handle),
      },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505"
    ) {
      return NextResponse.json({ error: "This VEIL ID is already taken" }, { status: 409 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
