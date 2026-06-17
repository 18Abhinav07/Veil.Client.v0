import type { PrivateNoteSecrets } from "@/lib/noteCrypto";
import type { RelayBody, TransferResponse, WithdrawResponse } from "@/types";

import {
  classifySpendJobError,
  shouldReconcileSpendJobFailure,
  shouldRetrySpendJobFailure,
  type SpendJobErrorClass,
} from "./spendJobEngine";
import {
  isBackgroundExecutionPackageExpired,
  parseEncryptedBackgroundExecutionPackage,
  type BackgroundSpendExecutionPackage,
  type EncryptedBackgroundExecutionPackage,
} from "./backgroundExecutionPackage";

type BackgroundJobKind = "lane1_withdraw" | "lane2_transfer";

interface BackgroundCandidateJob {
  id: string;
  user_id: string;
  kind: string;
  pool_id: string;
  total_recipients?: number;
  execution_package_ciphertext: string | null;
  execution_package_expires_at?: Date | null;
}

interface BackgroundClaimedJob {
  id: string;
  user_id: string;
  kind: string;
  pool_id: string;
  total_recipients?: number;
}

interface BackgroundClaimedStep {
  id: string;
  ordinal: number;
  recipient_address: string;
  amount_units: string;
  source_note_id: string | null;
  attempts?: number;
  recipient_user_id: string | null;
  recipient_handle: string | null;
  recipient_note_public_hex: string | null;
  recipient_x25519_public_hex: string | null;
}

interface ChangeNoteInput {
  commitmentHex: string;
  encryptedNoteCiphertext: string;
  amountUnits: string;
  leafIndex: number;
  txHash: string;
}

interface RecipientNoteInput {
  recipientUserId: string;
  commitmentHex: string;
  amountUnits: string;
  encryptedOutput: string;
  leafIndex: number;
  txHash: string;
}

export interface BackgroundSpendWorkerRepository {
  getNextBackgroundSpendJobCandidate(input?: {
    limit?: number;
  }): Promise<{ job: BackgroundCandidateJob } | null>;
  claimNextRunnableSpendJobStep(input: {
    userId: string;
    jobId: string;
    sourceCommitmentHex: string;
    sourceAmountUnits: string;
    sourceLeafIndex: number | null;
    leaseOwner: string;
    leaseSeconds: number;
  }): Promise<{ job: BackgroundClaimedJob; step: BackgroundClaimedStep } | null>;
  markSpendJobStepProofReady(input: {
    userId: string;
    jobId: string;
    stepId: string;
    relayBody: Record<string, unknown>;
    outputCommitmentHex: string;
    outputAmountUnits: string;
    inputNullifierHex?: string | null;
    recipientOutputCommitmentHex?: string | null;
    recipientEncryptedOutput?: string | null;
  }): Promise<void>;
  markSpendJobStepRelaying(input: {
    userId: string;
    jobId: string;
    stepId: string;
  }): Promise<void>;
  markSpendJobSubmitted(input: {
    userId: string;
    jobId: string;
    stepId: string;
    txHash: string;
    outputCommitmentHex: string;
    outputAmountUnits: string;
    encryptedChangeNoteCiphertext?: string | null;
  }): Promise<void>;
  storeSpendJobStepResult(input: {
    userId: string;
    jobId: string;
    stepId: string;
    sourceNoteId: string;
    changeNote: ChangeNoteInput | null;
    recipientNote?: RecipientNoteInput | null;
    isFinalStep: boolean;
  }): Promise<void>;
  updateSpendJobExecutionPackage(input: {
    userId: string;
    jobId: string;
    package: BackgroundSpendExecutionPackage;
    encryptedPackage: EncryptedBackgroundExecutionPackage;
  }): Promise<void>;
  deleteSpendJobExecutionPackage(input: {
    userId: string;
    jobId: string;
    reason: string;
  }): Promise<void>;
  markSpendJobRetryableFailure(input: {
    userId: string;
    jobId: string;
    stepId: string;
    errorClass: SpendJobErrorClass;
    errorMessage: string;
    retryAfter?: Date | null;
  }): Promise<void>;
  markSpendJobNeedsReconcile(input: {
    userId: string;
    jobId: string;
    stepId: string;
    errorClass: SpendJobErrorClass;
    errorMessage: string;
  }): Promise<void>;
}

export interface BackgroundSpendWorkerDependencies {
  now?: Date;
  leaseOwner: string;
  leaseSeconds?: number;
  repository: BackgroundSpendWorkerRepository;
  decryptPackage: (
    encrypted: EncryptedBackgroundExecutionPackage,
  ) => Promise<BackgroundSpendExecutionPackage>;
  encryptPackage: (
    payload: BackgroundSpendExecutionPackage,
  ) => Promise<EncryptedBackgroundExecutionPackage>;
  encryptChangeNote: (
    note: PrivateNoteSecrets,
    payload: BackgroundSpendExecutionPackage,
  ) => Promise<string>;
  proveWithdraw: (body: unknown) => Promise<WithdrawResponse>;
  proveTransfer: (body: unknown) => Promise<TransferResponse>;
  relay: (relayBody: RelayBody) => Promise<{ txHash: string }>;
  waitForTransaction: (txHash: string) => Promise<number>;
  findNoteLeafIndex: (commitmentHex: string, minedLedger: number) => Promise<number>;
}

export type BackgroundSpendWorkerResult =
  | { status: "idle" }
  | { status: "claimed_by_other"; jobId: string }
  | { status: "expired"; jobId: string }
  | { status: "advanced"; jobId: string; stepId: string; txHash: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function retryAfterFor(errorClass: SpendJobErrorClass): Date | null {
  if (errorClass === "unknown" || errorClass === "already_spent_nullifier") {
    return null;
  }
  return new Date(Date.now() + 15_000);
}

function firstInputNullifier(result: WithdrawResponse | TransferResponse): string | null {
  return result.relayBody.public.inputNullifiers[0] ?? null;
}

function transferRecipientOutput(input: {
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

function assertPackageMatchesJob(input: {
  payload: BackgroundSpendExecutionPackage;
  job: BackgroundCandidateJob;
}) {
  if (input.payload.userId !== input.job.user_id || input.payload.jobId !== input.job.id) {
    throw new Error("Background execution package does not match spend job");
  }
}

function isFinalStep(input: {
  step: BackgroundClaimedStep;
  job: BackgroundClaimedJob;
  changeAmountUnits: string;
}): boolean {
  return (
    BigInt(input.changeAmountUnits) === BigInt(0) ||
    (typeof input.job.total_recipients === "number" &&
      input.step.ordinal >= input.job.total_recipients)
  );
}

async function markWorkerFailure(input: {
  repository: BackgroundSpendWorkerRepository;
  userId: string;
  jobId: string;
  stepId: string;
  attempts: number;
  error: unknown;
  txHash: string | null;
}) {
  const errorClass = classifySpendJobError(input.error);
  const message = input.txHash
    ? `${errorMessage(input.error)} after tx submission ${input.txHash}`
    : errorMessage(input.error);

  if (shouldReconcileSpendJobFailure({ errorClass, submittedTxHash: input.txHash })) {
    await input.repository.markSpendJobNeedsReconcile({
      userId: input.userId,
      jobId: input.jobId,
      stepId: input.stepId,
      errorClass,
      errorMessage: message,
    });
    return;
  }

  if (
    shouldRetrySpendJobFailure({
      errorClass,
      attempts: input.attempts,
      submittedTxHash: input.txHash,
    })
  ) {
    await input.repository.markSpendJobRetryableFailure({
      userId: input.userId,
      jobId: input.jobId,
      stepId: input.stepId,
      errorClass,
      errorMessage: message,
      retryAfter: retryAfterFor(errorClass),
    });
    return;
  }

  await input.repository.markSpendJobNeedsReconcile({
    userId: input.userId,
    jobId: input.jobId,
    stepId: input.stepId,
    errorClass,
    errorMessage: message,
  });
}

export async function advanceOneBackgroundSpendStep(
  deps: BackgroundSpendWorkerDependencies,
): Promise<BackgroundSpendWorkerResult> {
  const candidate = await deps.repository.getNextBackgroundSpendJobCandidate({ limit: 1 });
  if (!candidate?.job.execution_package_ciphertext) return { status: "idle" };

  const encrypted = parseEncryptedBackgroundExecutionPackage(
    candidate.job.execution_package_ciphertext,
  );
  const payload = await deps.decryptPackage(encrypted);
  assertPackageMatchesJob({ payload, job: candidate.job });

  if (isBackgroundExecutionPackageExpired(payload, deps.now ?? new Date())) {
    await deps.repository.deleteSpendJobExecutionPackage({
      userId: candidate.job.user_id,
      jobId: candidate.job.id,
      reason: "expired",
    });
    return { status: "expired", jobId: candidate.job.id };
  }

  const claimed = await deps.repository.claimNextRunnableSpendJobStep({
    userId: payload.userId,
    jobId: payload.jobId,
    sourceCommitmentHex: payload.activeNote.commitmentHex,
    sourceAmountUnits: payload.activeNote.amountUnits,
    sourceLeafIndex: payload.activeNote.leafIndex,
    leaseOwner: deps.leaseOwner,
    leaseSeconds: deps.leaseSeconds ?? 180,
  });
  if (!claimed) return { status: "claimed_by_other", jobId: candidate.job.id };

  const { job, step } = claimed;
  const kind = job.kind === "lane2_transfer" ? "lane2_transfer" : "lane1_withdraw";
  let txHash: string | null = null;

  try {
    let relayBody: RelayBody;
    let outputCommitmentHex: string;
    let outputAmountUnits: string;
    let changeNote: PrivateNoteSecrets;
    let recipientOutputCommitmentHex: string | null = null;
    let recipientEncryptedOutput: string | null = null;

    if (kind === "lane2_transfer") {
      if (!step.recipient_user_id || !step.recipient_note_public_hex || !step.recipient_x25519_public_hex) {
        throw new Error("Note-2-Note recipient registration data is missing");
      }
      const proof = await deps.proveTransfer({
        notePrivateKeyHex: payload.notePrivateKeyHex,
        senderEncryptionPublicHex: payload.senderEncryptionPublicHex,
        membershipBlindingHex: payload.membershipBlindingHex,
        noteBlindingHex: payload.activeNote.blindingHex,
        noteAmountUnits: payload.activeNote.amountUnits,
        noteLeafIndex: payload.activeNote.leafIndex,
        transferAmountUnits: step.amount_units,
        recipientNotePublicHex: step.recipient_note_public_hex,
        recipientX25519PublicHex: step.recipient_x25519_public_hex,
        poolId: job.pool_id,
      });
      relayBody = proof.relayBody;
      outputCommitmentHex = proof.senderChangeCommitmentHex;
      outputAmountUnits = proof.senderChangeAmountUnits;
      recipientOutputCommitmentHex = proof.recipientNoteCommitmentHex;
      recipientEncryptedOutput = transferRecipientOutput({
        proof,
        recipientNotePublicHex: step.recipient_note_public_hex,
        recipientX25519PublicHex: step.recipient_x25519_public_hex,
      });
      changeNote = {
        blindingHex: proof.senderChangeBlindingHex,
        commitmentHex: proof.senderChangeCommitmentHex,
        amountUnits: proof.senderChangeAmountUnits,
        leafIndex: -1,
        dummyBlindingHex: "",
        dummyCommitmentHex: "",
        createdAt: Date.now(),
      };
      await deps.repository.markSpendJobStepProofReady({
        userId: payload.userId,
        jobId: payload.jobId,
        stepId: step.id,
        relayBody: relayBody as unknown as Record<string, unknown>,
        outputCommitmentHex,
        outputAmountUnits,
        inputNullifierHex: firstInputNullifier(proof),
        recipientOutputCommitmentHex,
        recipientEncryptedOutput,
      });
    } else {
      const proof = await deps.proveWithdraw({
        notePrivateKeyHex: payload.notePrivateKeyHex,
        senderEncryptionPublicHex: payload.senderEncryptionPublicHex,
        membershipBlindingHex: payload.membershipBlindingHex,
        noteBlindingHex: payload.activeNote.blindingHex,
        noteAmountUnits: payload.activeNote.amountUnits,
        noteLeafIndex: payload.activeNote.leafIndex,
        dummyBlindingHex: payload.activeNote.dummyBlindingHex || undefined,
        withdrawAmountUnits: step.amount_units,
        recipientStellarAddress: step.recipient_address,
        poolId: job.pool_id,
      });
      relayBody = proof.relayBody;
      outputCommitmentHex = proof.changeNoteCommitmentHex;
      outputAmountUnits = proof.changeAmountUnits;
      changeNote = {
        blindingHex: proof.changeNoteBlindingHex,
        commitmentHex: proof.changeNoteCommitmentHex,
        amountUnits: proof.changeAmountUnits,
        leafIndex: -1,
        dummyBlindingHex: proof.nextDummyBlindingHex,
        dummyCommitmentHex: proof.nextDummyCommitmentHex,
        createdAt: Date.now(),
      };
      await deps.repository.markSpendJobStepProofReady({
        userId: payload.userId,
        jobId: payload.jobId,
        stepId: step.id,
        relayBody: relayBody as unknown as Record<string, unknown>,
        outputCommitmentHex,
        outputAmountUnits,
        inputNullifierHex: firstInputNullifier(proof),
      });
    }

    await deps.repository.markSpendJobStepRelaying({
      userId: payload.userId,
      jobId: payload.jobId,
      stepId: step.id,
    });
    const relayed = await deps.relay(relayBody);
    txHash = relayed.txHash;

    await deps.repository.markSpendJobSubmitted({
      userId: payload.userId,
      jobId: payload.jobId,
      stepId: step.id,
      txHash,
      outputCommitmentHex,
      outputAmountUnits,
      encryptedChangeNoteCiphertext: null,
    });

    const minedLedger = await deps.waitForTransaction(txHash);
    const outputLeafIndex =
      BigInt(outputAmountUnits) > BigInt(0)
        ? await deps.findNoteLeafIndex(outputCommitmentHex, minedLedger)
        : (payload.activeNote.leafIndex ?? 0) + 2;
    const recipientOutputLeafIndex =
      kind === "lane2_transfer" && recipientOutputCommitmentHex
        ? await deps.findNoteLeafIndex(recipientOutputCommitmentHex, minedLedger)
        : null;
    const storedChangeNote =
      BigInt(outputAmountUnits) > BigInt(0)
        ? {
            ...changeNote,
            leafIndex: outputLeafIndex,
            amountUnits: outputAmountUnits,
          }
        : null;
    const encryptedChangeNoteCiphertext = storedChangeNote
      ? await deps.encryptChangeNote(storedChangeNote, payload)
      : null;

    const finalStep = isFinalStep({ step, job, changeAmountUnits: outputAmountUnits });
    if (!step.source_note_id) {
      throw new Error("Background spend job step has no source note");
    }
    await deps.repository.storeSpendJobStepResult({
      userId: payload.userId,
      jobId: payload.jobId,
      stepId: step.id,
      sourceNoteId: step.source_note_id,
      changeNote:
        storedChangeNote && encryptedChangeNoteCiphertext
          ? {
              commitmentHex: storedChangeNote.commitmentHex,
              encryptedNoteCiphertext: encryptedChangeNoteCiphertext,
              amountUnits: storedChangeNote.amountUnits,
              leafIndex: storedChangeNote.leafIndex ?? outputLeafIndex,
              txHash,
            }
          : null,
      recipientNote:
        kind === "lane2_transfer" &&
        step.recipient_user_id &&
        recipientOutputCommitmentHex &&
        recipientEncryptedOutput &&
        recipientOutputLeafIndex !== null
          ? {
              recipientUserId: step.recipient_user_id,
              commitmentHex: recipientOutputCommitmentHex,
              encryptedOutput: recipientEncryptedOutput,
              amountUnits: step.amount_units,
              leafIndex: recipientOutputLeafIndex,
              txHash,
            }
          : null,
      isFinalStep: finalStep,
    });

    if (finalStep || !storedChangeNote) {
      await deps.repository.deleteSpendJobExecutionPackage({
        userId: payload.userId,
        jobId: payload.jobId,
        reason: "completed",
      });
    } else {
      const nextPackage: BackgroundSpendExecutionPackage = {
        ...payload,
        activeNote: storedChangeNote,
      };
      const encryptedNextPackage = await deps.encryptPackage(nextPackage);
      await deps.repository.updateSpendJobExecutionPackage({
        userId: payload.userId,
        jobId: payload.jobId,
        package: nextPackage,
        encryptedPackage: encryptedNextPackage,
      });
    }

    return {
      status: "advanced",
      jobId: payload.jobId,
      stepId: step.id,
      txHash,
    };
  } catch (error) {
    await markWorkerFailure({
      repository: deps.repository,
      userId: payload.userId,
      jobId: payload.jobId,
      stepId: step.id,
      attempts: step.attempts ?? 0,
      error,
      txHash,
    });
    throw error;
  }
}
