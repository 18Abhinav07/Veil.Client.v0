import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { createAuthOptions } from "@/lib/server/auth";
import { getInternalServiceHeaders } from "@/lib/server/internalServiceAuth";
import { fetchJsonWithRetry } from "@/lib/server/upstreamRetry";

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

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readHex32(value: unknown, label: string) {
  const text = readString(value).replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(text)) {
    throw new Error(`${label} must be 32-byte hex`);
  }
  return text.toLowerCase();
}

function readEncryptedOutput(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new Error("encryptedOutput must be an array of bytes");
  }
  return value.map((byte) => {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new Error("encryptedOutput must contain bytes");
    }
    return byte;
  });
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

  let body: Record<string, unknown>;
  try {
    body = {
      notePrivateKeyHex: readHex32(payload.notePrivateKeyHex, "notePrivateKeyHex"),
      encryptionPrivateKeyHex: readHex32(
        payload.encryptionPrivateKeyHex,
        "encryptionPrivateKeyHex",
      ),
      commitmentHex: readString(payload.commitmentHex),
      leafIndex: Number(payload.leafIndex),
      encryptedOutput: readEncryptedOutput(payload.encryptedOutput),
    };
    if (!Number.isInteger(body.leafIndex) || Number(body.leafIndex) < 0) {
      throw new Error("leafIndex must be a non-negative integer");
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  try {
    const decrypted = await fetchJsonWithRetry<Record<string, unknown>>(
      `${PROVER_API}/keys/decrypt-output-note`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getInternalServiceHeaders() },
        body: JSON.stringify(body),
      },
      {
        serviceName: "prover-api /keys/decrypt-output-note",
        tries: 3,
        delayMs: 750,
        isRetryableStatus: (status) => status === 429 || status >= 500,
      },
    );
    return NextResponse.json(decrypted);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 422 },
    );
  }
}
