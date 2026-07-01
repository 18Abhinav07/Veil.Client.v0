import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { findNoteLeafIndex, waitForTransaction } from "@/lib/stellar";
import { createAuthOptions } from "@/lib/server/auth";
import { getPgPool } from "@/lib/server/db";
import {
  classifySpendJobError,
  shouldReconcileSpendJobFailure,
  type SpendJobErrorClass,
} from "@/lib/server/spendJobEngine";
import { getInternalServiceHeaders } from "@/lib/server/internalServiceAuth";
import { fetchJsonWithRetry } from "@/lib/server/upstreamRetry";
import {
  claimNextRunnableSpendJobStep,
  getSpendJobDetail,
  markSpendJobNeedsReconcile,
  markSpendJobRetryableFailure,
  markSpendJobStepProofReady,
  markSpendJobStepRelaying,
  markSpendJobSubmitted,
  storeSpendJobStepResult,
} from "@/lib/server/walletRepository";
import { serializeSpendJobDetail } from "@/lib/server/spendJobSerialization";
import {
  isTransientProverLag,
  isTransientRelayLag,
} from "@/lib/server/bulkWithdraw";
import type { RelayBody, TransferResponse, WithdrawResponse } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

const PROVER_API = process.env.PROVER_API_URL ?? "http://127.0.0.1:3001";
const RELAYER_URL =
  process.env.RELAYER_URL ??
  process.env.NEXT_PUBLIC_RELAYER_URL ??
  "http://127.0.0.1:3000";

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

function readHex32(value: unknown, label: string): string {
  const text = readString(value).replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(text)) {
    throw new Error(`${label} must be 32-byte hex`);
  }
  return text.toLowerCase();
}

async function proveWithdraw(body: unknown): Promise<WithdrawResponse> {
  return fetchJsonWithRetry<WithdrawResponse>(
    `${PROVER_API}/prove/withdraw`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getInternalServiceHeaders() },
      body: JSON.stringify(body),
    },
    {
      serviceName: "prover-api /prove/withdraw",
      tries: 12,
      delayMs: 5000,
      isRetryableStatus: isTransientProverLag,
    },
  );
}

async function proveTransfer(body: unknown): Promise<TransferResponse> {
  return fetchJsonWithRetry<TransferResponse>(
    `${PROVER_API}/prove/transfer`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getInternalServiceHeaders() },
      body: JSON.stringify(body),
    },
    {
      serviceName: "prover-api /prove/transfer",
      tries: 12,
      delayMs: 5000,
      isRetryableStatus: isTransientProverLag,
    },
  );
}

async function relayWithRetry(relayBody: RelayBody): Promise<{ txHash: string }> {
  return fetchJsonWithRetry<{ txHash: string }>(
    `${RELAYER_URL}/relay`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getInternalServiceHeaders() },
      body: JSON.stringify(relayBody),
    },
    {
      serviceName: "relayer /relay",
      tries: 18,
      delayMs: 5000,
      isRetryableStatus: isTransientRelayLag,
    },
  );
}

function firstInputNullifier(result: WithdrawResponse): string | null {
  return result.relayBody.public.inputNullifiers[0] ?? null;
}

function firstTransferInputNullifier(result: TransferResponse): string | null {
  return result.relayBody.public.inputNullifiers[0] ?? null;
}

function encodeRecipientEncryptedOutput(input: {
  proof: TransferResponse;
  recipientNotePublicHex: string;
  recipientX25519PublicHex: string;
}): string {
  return JSON.stringify({
    version: 1,
    encryptedOutputKind: "spp-x25519-output-note",
    outputIndex: 0,
    commitmentHex: input.proof.recipientNoteCommitmentHex,
    amountUnits: input.proof.recipientAmountUnits,
    recipientNotePublicHex: input.recipientNotePublicHex,
    recipientX25519PublicHex: input.recipientX25519PublicHex,
    encryptedOutput: input.proof.relayBody.extData.encryptedOutput0,
    extAmount: input.proof.relayBody.extData.extAmount,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function retryAfterFor(errorClass: SpendJobErrorClass): Date | null {
  if (errorClass === "unknown" || errorClass === "already_spent_nullifier") {
    return null;
  }
  return new Date(Date.now() + 15_000);
}

async function markFailure(input: {
  userId: string;
  jobId: string;
  stepId: string;
  error: unknown;
  txHash?: string | null;
}) {
  const errorClass = classifySpendJobError(input.error);
  const message = input.txHash
    ? `${errorMessage(input.error)} after tx submission ${input.txHash}`
    : errorMessage(input.error);

  if (
    shouldReconcileSpendJobFailure({
      errorClass,
      submittedTxHash: input.txHash,
    })
  ) {
    await markSpendJobNeedsReconcile(getPgPool(), {
      userId: input.userId,
      jobId: input.jobId,
      stepId: input.stepId,
      errorClass,
      errorMessage: message,
    });
    return;
  }

  await markSpendJobRetryableFailure(getPgPool(), {
    userId: input.userId,
    jobId: input.jobId,
    stepId: input.stepId,
    errorClass,
    errorMessage: message,
    retryAfter: retryAfterFor(errorClass),
  });
}

async function handleProve(input: {
  userId: string;
  jobId: string;
  payload: Record<string, unknown>;
}) {
  const notePrivateKeyHex = readHex32(input.payload.notePrivateKeyHex, "notePrivateKeyHex");
  const senderEncryptionPublicHex = readHex32(
    input.payload.senderEncryptionPublicHex,
    "senderEncryptionPublicHex",
  );
  const membershipBlindingHex = readHex32(
    input.payload.membershipBlindingHex,
    "membershipBlindingHex",
  );
  const noteCommitmentHex = readString(input.payload.noteCommitmentHex);
  const noteBlindingHex = readString(input.payload.noteBlindingHex);
  const noteAmountUnits = readString(input.payload.noteAmountUnits);
  const noteLeafIndex = Number(input.payload.noteLeafIndex);
  const dummyBlindingHex = readString(input.payload.dummyBlindingHex);
  if (
    !noteCommitmentHex ||
    !noteBlindingHex ||
    !noteAmountUnits ||
    !Number.isFinite(noteLeafIndex)
  ) {
    return NextResponse.json({ error: "Missing spend material" }, { status: 400 });
  }

  const runnable = await claimNextRunnableSpendJobStep(getPgPool(), {
    userId: input.userId,
    jobId: input.jobId,
    sourceCommitmentHex: noteCommitmentHex,
    sourceAmountUnits: noteAmountUnits,
    sourceLeafIndex: noteLeafIndex,
  });
  if (!runnable) {
    return NextResponse.json(
      {
        error:
          "No runnable spend job step for the supplied active note. Refresh the wallet state and resume with the latest active note.",
      },
      { status: 409 },
    );
  }

  const { job, step } = runnable;
  try {
    if (job.kind === "lane2_transfer") {
      const recipientNotePublicHex = step.recipient_note_public_hex;
      const recipientX25519PublicHex = step.recipient_x25519_public_hex;
      if (!step.recipient_user_id || !recipientNotePublicHex || !recipientX25519PublicHex) {
        throw new Error("Note-2-Note recipient registration data is missing");
      }

      const proof = await proveTransfer({
        notePrivateKeyHex,
        senderEncryptionPublicHex,
        membershipBlindingHex,
        noteBlindingHex,
        noteAmountUnits,
        noteLeafIndex,
        transferAmountUnits: step.amount_units,
        recipientNotePublicHex,
        recipientX25519PublicHex,
        poolId: job.pool_id,
      });
      const recipientEncryptedOutput = encodeRecipientEncryptedOutput({
        proof,
        recipientNotePublicHex,
        recipientX25519PublicHex,
      });

      await markSpendJobStepProofReady(getPgPool(), {
        userId: input.userId,
        jobId: input.jobId,
        stepId: step.id,
        relayBody: proof.relayBody as unknown as Record<string, unknown>,
        outputCommitmentHex: proof.senderChangeCommitmentHex,
        outputAmountUnits: proof.senderChangeAmountUnits,
        inputNullifierHex: firstTransferInputNullifier(proof),
        recipientOutputCommitmentHex: proof.recipientNoteCommitmentHex,
        recipientEncryptedOutput,
      });

      const detail = await getSpendJobDetail(getPgPool(), {
        userId: input.userId,
        jobId: input.jobId,
      });

      return NextResponse.json({
        result: {
          status: "proof_ready",
          jobId: input.jobId,
          stepId: step.id,
          ordinal: step.ordinal,
          recipientAddress: step.recipient_address,
          recipientUserId: step.recipient_user_id,
          recipientHandle: step.recipient_handle,
          amountUnits: step.amount_units,
          recipientOutputCommitmentHex: proof.recipientNoteCommitmentHex,
          recipientEncryptedOutput,
          changeNote: {
            blindingHex: proof.senderChangeBlindingHex,
            commitmentHex: proof.senderChangeCommitmentHex,
            amountUnits: proof.senderChangeAmountUnits,
            leafIndex: -1,
            dummyBlindingHex: "",
            dummyCommitmentHex: "",
            createdAt: Date.now(),
          },
        },
        job: detail ? serializeSpendJobDetail(detail) : null,
      });
    }

    const proof = await proveWithdraw({
      notePrivateKeyHex,
      senderEncryptionPublicHex,
      membershipBlindingHex,
      noteBlindingHex,
      noteAmountUnits,
      noteLeafIndex,
      dummyBlindingHex: dummyBlindingHex || undefined,
      withdrawAmountUnits: step.amount_units,
      recipientStellarAddress: step.recipient_address,
      poolId: job.pool_id,
    });

    await markSpendJobStepProofReady(getPgPool(), {
      userId: input.userId,
      jobId: input.jobId,
      stepId: step.id,
      relayBody: proof.relayBody as unknown as Record<string, unknown>,
      outputCommitmentHex: proof.changeNoteCommitmentHex,
      outputAmountUnits: proof.changeAmountUnits,
      inputNullifierHex: firstInputNullifier(proof),
    });

    const detail = await getSpendJobDetail(getPgPool(), {
      userId: input.userId,
      jobId: input.jobId,
    });

    return NextResponse.json({
      result: {
        status: "proof_ready",
        jobId: input.jobId,
        stepId: step.id,
        ordinal: step.ordinal,
        recipientAddress: step.recipient_address,
        amountUnits: step.amount_units,
        changeNote: {
          blindingHex: proof.changeNoteBlindingHex,
          commitmentHex: proof.changeNoteCommitmentHex,
          amountUnits: proof.changeAmountUnits,
          leafIndex: -1,
          dummyBlindingHex: proof.nextDummyBlindingHex,
          dummyCommitmentHex: proof.nextDummyCommitmentHex,
          createdAt: Date.now(),
        },
      },
      job: detail ? serializeSpendJobDetail(detail) : null,
    });
  } catch (error) {
    await markFailure({
      userId: input.userId,
      jobId: input.jobId,
      stepId: step.id,
      error,
    });
    return NextResponse.json({ error: errorMessage(error) }, { status: 502 });
  }
}

async function handleSubmit(input: {
  userId: string;
  jobId: string;
  payload: Record<string, unknown>;
}) {
  const stepId = readString(input.payload.stepId);
  const encryptedChangeNoteCiphertext = readString(
    input.payload.encryptedChangeNoteCiphertext,
  );
  if (!stepId) {
    return NextResponse.json(
      { error: "stepId is required" },
      { status: 400 },
    );
  }

  const detail = await getSpendJobDetail(getPgPool(), {
    userId: input.userId,
    jobId: input.jobId,
  });
  const step = detail?.steps.find((item) => item.id === stepId);
  if (!detail || !step) {
    return NextResponse.json({ error: "Spend job step not found" }, { status: 404 });
  }
  if (!step.relay_body || !step.output_commitment_hex || !step.output_amount_units) {
    return NextResponse.json({ error: "Spend job step is not proof-ready" }, { status: 409 });
  }
  if (!step.source_note_id) {
    return NextResponse.json({ error: "Spend job step has no source note" }, { status: 409 });
  }

  let txHash: string | null = null;
  try {
    await markSpendJobStepRelaying(getPgPool(), {
      userId: input.userId,
      jobId: input.jobId,
      stepId,
    });

    const relayed = await relayWithRetry(step.relay_body as unknown as RelayBody);
    txHash = relayed.txHash;

    await markSpendJobSubmitted(getPgPool(), {
      userId: input.userId,
      jobId: input.jobId,
      stepId,
      txHash,
      outputCommitmentHex: step.output_commitment_hex,
      outputAmountUnits: step.output_amount_units,
      encryptedChangeNoteCiphertext,
    });

    const minedLedger = await waitForTransaction(txHash);
    const recipientOutputLeafIndex =
      detail.job.kind === "lane2_transfer" && step.recipient_output_commitment_hex
        ? await findNoteLeafIndex(step.recipient_output_commitment_hex, minedLedger)
        : null;
    const outputLeafIndex =
      BigInt(step.output_amount_units) > BigInt(0)
        ? await findNoteLeafIndex(step.output_commitment_hex, minedLedger)
        : (step.source_leaf_index ?? 0) + 2;
    const isFinalStep =
      step.ordinal >= detail.steps.length || BigInt(step.output_amount_units) === BigInt(0);

    await storeSpendJobStepResult(getPgPool(), {
      userId: input.userId,
      jobId: input.jobId,
      stepId,
      sourceNoteId: step.source_note_id,
      changeNote:
        BigInt(step.output_amount_units) > BigInt(0)
          ? {
              commitmentHex: step.output_commitment_hex,
              encryptedNoteCiphertext: encryptedChangeNoteCiphertext,
              amountUnits: step.output_amount_units,
              leafIndex: outputLeafIndex,
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
      userId: input.userId,
      jobId: input.jobId,
    });
    return NextResponse.json({
      result: {
        status: "stored",
        stepId,
        txHash,
        changeLeaf: outputLeafIndex,
        changeNoteCommitmentHex: step.output_commitment_hex,
        changeAmountUnits: step.output_amount_units,
        recipientOutputCommitmentHex: step.recipient_output_commitment_hex,
        recipientOutputLeafIndex,
      },
      job: nextDetail ? serializeSpendJobDetail(nextDetail) : null,
    });
  } catch (error) {
    await markFailure({
      userId: input.userId,
      jobId: input.jobId,
      stepId,
      error,
      txHash,
    });
    return NextResponse.json({ error: errorMessage(error), txHash }, { status: 502 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { jobId } = await context.params;
  const intent = readString(payload.intent);
  if (intent === "prove") {
    return handleProve({ userId: auth.userId, jobId, payload });
  }
  if (intent === "submit") {
    return handleSubmit({ userId: auth.userId, jobId, payload });
  }
  return NextResponse.json({ error: "intent must be prove or submit" }, { status: 400 });
}
