import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { createAuthOptions } from "@/lib/server/auth";
import { getPgPool } from "@/lib/server/db";
import {
  getEncryptedNotesForUser,
  setNoteStatus,
  upsertEncryptedNote,
  type NoteStatus,
} from "@/lib/server/walletRepository";
import { assertEncryptedNotePayload } from "@/lib/privateNoteStorage";

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

  const notes = await getEncryptedNotesForUser(getPgPool(), {
    userId: auth.userId,
  });
  return NextResponse.json({
    notes: notes.map((note) => ({
      id: note.id,
      commitmentHex: note.commitment_hex,
      encryptedNoteCiphertext: note.encrypted_note_ciphertext,
      assetCode: note.asset_code,
      amountUnits: note.amount_units,
      leafIndex: note.leaf_index,
      status: note.status,
      source: note.source,
      txHash: note.tx_hash,
      activeJobId: note.active_job_id ?? null,
      spendVersion: note.spend_version ?? 0,
      lastChainCheckedAt: note.last_chain_checked_at ?? null,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
    })),
  });
}

export async function PUT(request: Request) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  const payload = await request.json();
  assertEncryptedNotePayload(payload);

  const saved = await upsertEncryptedNote(getPgPool(), {
    userId: auth.userId,
    commitmentHex: payload.commitmentHex,
    encryptedNoteCiphertext: payload.encryptedNoteCiphertext,
    amountUnits: payload.amountUnits,
    status: payload.status,
    source: payload.source,
    assetCode: payload.assetCode,
    leafIndex: payload.leafIndex,
    txHash: payload.txHash,
  });

  return NextResponse.json({
    note: {
      id: saved?.id,
      commitmentHex: saved?.commitment_hex ?? payload.commitmentHex,
      status: saved?.status ?? payload.status,
    },
  });
}

export async function PATCH(request: Request) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  const payload = (await request.json()) as {
    commitmentHex?: unknown;
    status?: unknown;
    txHash?: unknown;
  };
  const commitmentHex =
    typeof payload.commitmentHex === "string" ? payload.commitmentHex.trim() : "";
  if (!commitmentHex) {
    return NextResponse.json({ error: "commitmentHex is required" }, { status: 400 });
  }
  if (
    ![
      "unspent",
      "spent",
      "pending_deposit",
      "pending_spend",
      "received",
      "failed_recovery",
    ].includes(String(payload.status))
  ) {
    return NextResponse.json({ error: "invalid note status" }, { status: 400 });
  }

  const saved = await setNoteStatus(getPgPool(), {
    userId: auth.userId,
    commitmentHex,
    status: payload.status as NoteStatus,
    txHash: typeof payload.txHash === "string" ? payload.txHash : null,
  });
  return NextResponse.json({
    note: {
      id: saved?.id,
      commitmentHex: saved?.commitment_hex ?? commitmentHex,
      status: saved?.status ?? payload.status,
    },
  });
}
