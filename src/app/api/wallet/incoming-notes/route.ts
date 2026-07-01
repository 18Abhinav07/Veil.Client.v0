import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { createAuthOptions } from "@/lib/server/auth";
import { getPgPool } from "@/lib/server/db";
import { listIncomingNotes, markIncomingNoteClaimed } from "@/lib/server/walletRepository";

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

function normalizeStatus(value: string | null) {
  if (value === "pending" || value === "claimed" || value === "failed") return value;
  return "pending";
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const incoming = await listIncomingNotes(getPgPool(), {
    userId: auth.userId,
    status: normalizeStatus(url.searchParams.get("status")),
  });

  return NextResponse.json({
    incomingNotes: incoming.map((note) => ({
      id: note.id,
      senderUserId: note.sender_user_id,
      spendJobId: note.spend_job_id,
      spendJobStepId: note.spend_job_step_id,
      commitmentHex: note.commitment_hex,
      amountUnits: note.amount_units,
      encryptedOutput: note.encrypted_output,
      txHash: note.tx_hash,
      leafIndex: note.leaf_index,
      status: note.status,
      claimedNoteId: note.claimed_note_id,
      errorMessage: note.error_message,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
    })),
  });
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

  const incomingNoteId = readString(payload.incomingNoteId);
  const commitmentHex = readString(payload.commitmentHex);
  if (!incomingNoteId || !commitmentHex) {
    return NextResponse.json(
      { error: "incomingNoteId and commitmentHex are required" },
      { status: 400 },
    );
  }

  const claimed = await markIncomingNoteClaimed(getPgPool(), {
    userId: auth.userId,
    incomingNoteId,
    commitmentHex,
  });
  if (!claimed) {
    return NextResponse.json(
      { error: "Incoming note was not claimed. Save the received note first." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    incomingNote: {
      id: claimed.id,
      commitmentHex: claimed.commitment_hex,
      status: claimed.status,
      claimedNoteId: claimed.claimed_note_id,
    },
  });
}
