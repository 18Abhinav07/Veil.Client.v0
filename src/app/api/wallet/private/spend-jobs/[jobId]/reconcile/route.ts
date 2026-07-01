import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { findNoteLeafIndex, waitForTransaction } from "@/lib/stellar";
import { createAuthOptions } from "@/lib/server/auth";
import { getPgPool } from "@/lib/server/db";
import {
  getSpendJobDetail,
  markSpendJobNeedsReconcile,
  storeSpendJobStepResult,
} from "@/lib/server/walletRepository";
import { serializeSpendJobDetail } from "@/lib/server/spendJobSerialization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

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

export async function POST(
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

  const step = detail.steps.find(
    (item) =>
      item.tx_hash &&
      item.output_commitment_hex &&
      item.output_amount_units &&
      item.encrypted_change_note_ciphertext &&
      ["submitted", "retry_wait", "needs_reconcile", "relaying"].includes(item.status),
  );

  if (!step) {
    const ambiguous = detail.steps.find((item) =>
      ["needs_reconcile", "retry_wait"].includes(item.status),
    );
    if (ambiguous) {
      await markSpendJobNeedsReconcile(getPgPool(), {
        userId: auth.userId,
        jobId,
        stepId: ambiguous.id,
        errorClass: "already_spent_nullifier",
        errorMessage:
          "No submitted transaction hash was recorded. This note is unsafe to reuse until manually recovered.",
      });
    }
    return NextResponse.json(
      { error: "No submitted step with encrypted change note is available to reconcile" },
      { status: 409 },
    );
  }

  if (!step.source_note_id) {
    return NextResponse.json(
      { error: "Submitted step is missing its source note" },
      { status: 409 },
    );
  }
  const txHash = step.tx_hash;
  const outputCommitmentHex = step.output_commitment_hex;
  const outputAmountUnits = step.output_amount_units;
  const encryptedChangeNoteCiphertext = step.encrypted_change_note_ciphertext;
  if (!txHash || !outputCommitmentHex || !outputAmountUnits || !encryptedChangeNoteCiphertext) {
    return NextResponse.json(
      { error: "Submitted step is missing reconciliation data" },
      { status: 409 },
    );
  }

  const minedLedger = await waitForTransaction(txHash);
  const recipientOutputLeafIndex =
    detail.job.kind === "lane2_transfer" && step.recipient_output_commitment_hex
      ? await findNoteLeafIndex(step.recipient_output_commitment_hex, minedLedger)
      : null;
  const leafIndex =
    BigInt(outputAmountUnits) > BigInt(0)
      ? await findNoteLeafIndex(outputCommitmentHex, minedLedger)
      : (step.source_leaf_index ?? 0) + 2;
  const isFinalStep =
    step.ordinal >= detail.steps.length || BigInt(outputAmountUnits) === BigInt(0);

  await storeSpendJobStepResult(getPgPool(), {
    userId: auth.userId,
    jobId,
    stepId: step.id,
    sourceNoteId: step.source_note_id,
      changeNote:
        BigInt(outputAmountUnits) > BigInt(0)
          ? {
            commitmentHex: outputCommitmentHex,
            encryptedNoteCiphertext: encryptedChangeNoteCiphertext,
            amountUnits: outputAmountUnits,
            leafIndex,
            txHash,
          }
        : null,
    recipientNote:
      detail.job.kind === "lane2_transfer" &&
      step.recipient_user_id &&
      step.recipient_output_commitment_hex &&
      step.recipient_encrypted_output &&
      recipientOutputLeafIndex !== null
        ? {
            recipientUserId: step.recipient_user_id,
            commitmentHex: step.recipient_output_commitment_hex,
            encryptedOutput: step.recipient_encrypted_output,
            amountUnits: step.amount_units,
            leafIndex: recipientOutputLeafIndex,
            txHash,
          }
        : null,
    isFinalStep,
  });

  const nextDetail = await getSpendJobDetail(getPgPool(), {
    userId: auth.userId,
    jobId,
  });
  return NextResponse.json({
    job: nextDetail ? serializeSpendJobDetail(nextDetail) : null,
    reconciledStepId: step.id,
    recipientOutputLeafIndex,
  });
}
