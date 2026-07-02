import type { PrivateNoteSecrets } from "@/lib/noteCrypto";
import type { RelayBody, TransferResponse, WithdrawResponse } from "@/types";

import {
  classifySpendJobError,
  retryAfterFor,
  shouldReconcileSpendJobFailure,
  shouldRetrySpendJobFailure,
  type SpendJobErrorClass,
} from "./spendJobEngine";
import {
  isBackgroundExecutionPackageExpired,
  parseEncryptedBackgroundExecutionPackage,
  type BackgroundSpendPendingStep,
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
  execution_package_ciphertext?: string | null;
  execution_package_expires_at?: Date | null;
}

interface BackgroundClaimedStep {
  id: string;
  ordinal: number;
  recipient_address: string;
  amount_units: string;
  source_note_id: string | null;
  source_leaf_index: number | null;
  attempts?: number;
  recipient_user_id: string | null;
  recipient_handle: string | null;
  recipient_note_public_hex: string | null;
  recipient_x25519_public_hex: string | null;
}

interface BackgroundReconcilableStep extends BackgroundClaimedStep {
  status: string;
  source_commitment_hex: string;
  source_amount_units: string;
  source_leaf_index: number | null;
  relay_body: Record<string, unknown> | null;
  tx_hash: string | null;
  output_commitment_hex: string | null;
  output_amount_units: string | null;
  output_leaf_index: number | null;
  encrypted_change_note_ciphertext: string | null;
  recipient_output_commitment_hex: string | null;
  recipient_output_leaf_index: number | null;
  recipient_encrypted_output: string | null;
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
  claimNextReconcilableBackgroundSpendJobStep(input: {
    leaseOwner: string;
    leaseSeconds: number;
  }): Promise<{ job: BackgroundClaimedJob; step: BackgroundReconcilableStep } | null>;
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
  markSpendJobStepPrepared(input: {
    userId: string;
    jobId: string;
    stepId: string;
    relayBody: Record<string, unknown>;
    outputCommitmentHex: string;
    outputAmountUnits: string;
    encryptedChangeNoteCiphertext: string | null;
    inputNullifierHex?: string | null;
    recipientOutputCommitmentHex?: string | null;
    recipientEncryptedOutput?: string | null;
    leaseOwner: string;
    leaseSeconds: number;
  }): Promise<void>;
  markSpendJobStepRelaying(input: {
    userId: string;
    jobId: string;
    stepId: string;
    leaseOwner?: string | null;
    leaseSeconds?: number | null;
  }): Promise<void>;
  markSpendJobSubmitted(input: {
    userId: string;
    jobId: string;
    stepId: string;
    txHash: string;
    outputCommitmentHex: string;
    outputAmountUnits: string;
    encryptedChangeNoteCiphertext?: string | null;
    leaseOwner?: string | null;
    leaseSeconds?: number | null;
  }): Promise<void>;
  markSpendJobRecoveredSubmittedTx(input: {
    userId: string;
    jobId: string;
    stepId: string;
    txHash: string;
    leaseOwner: string;
    leaseSeconds: number;
  }): Promise<void>;
  storeSpendJobStepResult(input: {
    userId: string;
    jobId: string;
    stepId: string;
    sourceNoteId: string;
    changeNote: ChangeNoteInput | null;
    recipientNote?: RecipientNoteInput | null;
    isFinalStep: boolean;
    nextExecutionPackage?: {
      encryptedPackageCiphertext: string;
      expiresAt: Date;
    } | null;
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
  heartbeatSpendJobLease(input: {
    userId: string;
    jobId: string;
    stepId: string;
    leaseOwner: string;
    leaseSeconds: number;
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
  findPoolCommitmentEvent?: (
    commitmentHex: string,
    startLedger: number,
  ) => Promise<{ leafIndex: number; ledger: number; txHash: string }>;
  getLatestLedger?: () => Promise<number>;
}

export type BackgroundSpendWorkerResult =
  | { status: "idle" }
  | { status: "claimed_by_other"; jobId: string }
  | { status: "expired"; jobId: string }
  | { status: "advanced"; jobId: string; stepId: string; txHash: string }
  | { status: "reconciled"; jobId: string; stepId: string; txHash: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  job: { id: string; user_id: string };
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

function pendingStepMatches(input: {
  pending: BackgroundSpendPendingStep | null | undefined;
  stepId: string;
}) {
  return input.pending?.stepId === input.stepId ? input.pending : null;
}

async function currentLedgerHint(deps: BackgroundSpendWorkerDependencies) {
  try {
    return deps.getLatestLedger ? await deps.getLatestLedger() : null;
  } catch {
    return null;
  }
}

async function updatePackage(input: {
  deps: BackgroundSpendWorkerDependencies;
  userId: string;
  jobId: string;
  payload: BackgroundSpendExecutionPackage;
}) {
  const encryptedPackage = await input.deps.encryptPackage(input.payload);
  await input.deps.repository.updateSpendJobExecutionPackage({
    userId: input.userId,
    jobId: input.jobId,
    package: input.payload,
    encryptedPackage,
  });
}

function normalizedLeaseSeconds(deps: BackgroundSpendWorkerDependencies) {
  return deps.leaseSeconds ?? 900;
}

async function heartbeat(input: {
  deps: BackgroundSpendWorkerDependencies;
  userId: string;
  jobId: string;
  stepId: string;
}) {
  await input.deps.repository.heartbeatSpendJobLease({
    userId: input.userId,
    jobId: input.jobId,
    stepId: input.stepId,
    leaseOwner: input.deps.leaseOwner,
    leaseSeconds: normalizedLeaseSeconds(input.deps),
  });
}

function isCommitmentNotFoundError(error: unknown): boolean {
  return /NewCommitment event .* not found/i.test(errorMessage(error));
}

async function checkpointPreparedStep(input: {
  deps: BackgroundSpendWorkerDependencies;
  payload: BackgroundSpendExecutionPackage;
  step: BackgroundClaimedStep;
  relayBody: RelayBody;
  outputCommitmentHex: string;
  outputAmountUnits: string;
  changeNote: PrivateNoteSecrets;
  inputNullifierHex: string | null;
  recipientOutputCommitmentHex: string | null;
  recipientEncryptedOutput: string | null;
}): Promise<{
  payload: BackgroundSpendExecutionPackage;
  encryptedChangeNoteCiphertext: string | null;
  pendingStep: BackgroundSpendPendingStep;
}> {
  const pendingChangeNote: PrivateNoteSecrets = {
    ...input.changeNote,
    leafIndex: null,
    amountUnits: input.outputAmountUnits,
  };
  const encryptedChangeNoteCiphertext =
    BigInt(input.outputAmountUnits) > BigInt(0)
      ? await input.deps.encryptChangeNote(pendingChangeNote, input.payload)
      : null;
  const pendingStep: BackgroundSpendPendingStep = {
    stepId: input.step.id,
    sourceNoteId: input.step.source_note_id ?? "",
    sourceCommitmentHex: input.payload.activeNote.commitmentHex,
    sourceAmountUnits: input.payload.activeNote.amountUnits,
    sourceLeafIndex: input.payload.activeNote.leafIndex,
    changeNote: pendingChangeNote,
    outputCommitmentHex: input.outputCommitmentHex,
    outputAmountUnits: input.outputAmountUnits,
    recipientOutputCommitmentHex: input.recipientOutputCommitmentHex,
    recipientEncryptedOutput: input.recipientEncryptedOutput,
    relayStartLedger: await currentLedgerHint(input.deps),
    createdAt: Date.now(),
  };
  const nextPayload: BackgroundSpendExecutionPackage = {
    ...input.payload,
    pendingStep,
  };

  await updatePackage({
    deps: input.deps,
    userId: input.payload.userId,
    jobId: input.payload.jobId,
    payload: nextPayload,
  });
  await input.deps.repository.markSpendJobStepPrepared({
    userId: input.payload.userId,
    jobId: input.payload.jobId,
    stepId: input.step.id,
    relayBody: input.relayBody as unknown as Record<string, unknown>,
    outputCommitmentHex: input.outputCommitmentHex,
    outputAmountUnits: input.outputAmountUnits,
    encryptedChangeNoteCiphertext,
    inputNullifierHex: input.inputNullifierHex,
    recipientOutputCommitmentHex: input.recipientOutputCommitmentHex,
    recipientEncryptedOutput: input.recipientEncryptedOutput,
    leaseOwner: input.deps.leaseOwner,
    leaseSeconds: normalizedLeaseSeconds(input.deps),
  });

  return {
    payload: nextPayload,
    encryptedChangeNoteCiphertext,
    pendingStep,
  };
}

async function finalizeSubmittedStep(input: {
  deps: BackgroundSpendWorkerDependencies;
  payload: BackgroundSpendExecutionPackage;
  job: BackgroundClaimedJob;
  step: BackgroundClaimedStep;
  txHash: string;
  outputCommitmentHex: string;
  outputAmountUnits: string;
  encryptedChangeNoteCiphertext: string | null;
  changeNoteSecrets: PrivateNoteSecrets | null;
  recipientOutputCommitmentHex: string | null;
  recipientEncryptedOutput: string | null;
  outputLeafIndexHint?: number | null;
  recipientOutputLeafIndexHint?: number | null;
}): Promise<void> {
  if (!input.step.source_note_id) {
    throw new Error("Background spend job step has no source note");
  }

  await heartbeat({
    deps: input.deps,
    userId: input.payload.userId,
    jobId: input.payload.jobId,
    stepId: input.step.id,
  });
  const minedLedger = await input.deps.waitForTransaction(input.txHash);

  await heartbeat({
    deps: input.deps,
    userId: input.payload.userId,
    jobId: input.payload.jobId,
    stepId: input.step.id,
  });
  const outputLeafIndex =
    BigInt(input.outputAmountUnits) > BigInt(0)
      ? input.outputLeafIndexHint ??
        (await input.deps.findNoteLeafIndex(input.outputCommitmentHex, minedLedger))
      : (input.payload.activeNote.leafIndex ?? input.step.source_leaf_index ?? 0) + 2;
  const recipientOutputLeafIndex =
    input.job.kind === "lane2_transfer" && input.recipientOutputCommitmentHex
      ? input.recipientOutputLeafIndexHint ??
        (await input.deps.findNoteLeafIndex(input.recipientOutputCommitmentHex, minedLedger))
      : null;
  const finalStep = isFinalStep({
    step: input.step,
    job: input.job,
    changeAmountUnits: input.outputAmountUnits,
  });

  if (BigInt(input.outputAmountUnits) > BigInt(0) && !input.encryptedChangeNoteCiphertext) {
    throw new Error("Background spend job step is missing encrypted change note");
  }
  if (!finalStep && BigInt(input.outputAmountUnits) > BigInt(0) && !input.changeNoteSecrets) {
    throw new Error("Background spend job step is missing pending change note secrets");
  }

  let nextExecutionPackage: { encryptedPackageCiphertext: string; expiresAt: Date } | null = null;
  if (!finalStep && input.changeNoteSecrets && BigInt(input.outputAmountUnits) > BigInt(0)) {
    const nextPackage: BackgroundSpendExecutionPackage = {
      ...input.payload,
      pendingStep: null,
      activeNote: {
        ...input.changeNoteSecrets,
        commitmentHex: input.outputCommitmentHex,
        amountUnits: input.outputAmountUnits,
        leafIndex: outputLeafIndex,
      },
    };
    const encryptedNextPackage = await input.deps.encryptPackage(nextPackage);
    nextExecutionPackage = {
      encryptedPackageCiphertext: JSON.stringify(encryptedNextPackage),
      expiresAt: new Date(nextPackage.expiresAt),
    };
  }

  await heartbeat({
    deps: input.deps,
    userId: input.payload.userId,
    jobId: input.payload.jobId,
    stepId: input.step.id,
  });
  await input.deps.repository.storeSpendJobStepResult({
    userId: input.payload.userId,
    jobId: input.payload.jobId,
    stepId: input.step.id,
    sourceNoteId: input.step.source_note_id,
    changeNote:
      BigInt(input.outputAmountUnits) > BigInt(0) && input.encryptedChangeNoteCiphertext
        ? {
            commitmentHex: input.outputCommitmentHex,
            encryptedNoteCiphertext: input.encryptedChangeNoteCiphertext,
            amountUnits: input.outputAmountUnits,
            leafIndex: outputLeafIndex,
            txHash: input.txHash,
          }
        : null,
    recipientNote:
      input.job.kind === "lane2_transfer" &&
      input.step.recipient_user_id &&
      input.recipientOutputCommitmentHex &&
      input.recipientEncryptedOutput &&
      recipientOutputLeafIndex !== null
        ? {
            recipientUserId: input.step.recipient_user_id,
            commitmentHex: input.recipientOutputCommitmentHex,
            encryptedOutput: input.recipientEncryptedOutput,
            amountUnits: input.step.amount_units,
            leafIndex: recipientOutputLeafIndex,
            txHash: input.txHash,
          }
        : null,
    isFinalStep: finalStep,
    nextExecutionPackage,
  });
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
      retryAfter: retryAfterFor(errorClass, input.attempts),
    });
    return;
  }

  await input.repository.markSpendJobRetryableFailure({
    userId: input.userId,
    jobId: input.jobId,
    stepId: input.stepId,
    errorClass,
    errorMessage: message,
    retryAfter: null,
  });
}

async function reconcileOneBackgroundSpendStep(
  deps: BackgroundSpendWorkerDependencies,
): Promise<BackgroundSpendWorkerResult | null> {
  const claimed = await deps.repository.claimNextReconcilableBackgroundSpendJobStep({
    leaseOwner: deps.leaseOwner,
    leaseSeconds: normalizedLeaseSeconds(deps),
  });
  if (!claimed) return null;

  const { job, step } = claimed;
  const encryptedPackageCiphertext = job.execution_package_ciphertext;
  if (!encryptedPackageCiphertext) {
    return null;
  }

  let txHash = step.tx_hash;
  try {
    const encrypted = parseEncryptedBackgroundExecutionPackage(encryptedPackageCiphertext);
    const payload = await deps.decryptPackage(encrypted);
    assertPackageMatchesJob({ payload, job });

    const pendingStep = pendingStepMatches({
      pending: payload.pendingStep,
      stepId: step.id,
    });
    const outputCommitmentHex =
      step.output_commitment_hex ?? pendingStep?.outputCommitmentHex ?? null;
    const outputAmountUnits =
      step.output_amount_units ?? pendingStep?.outputAmountUnits ?? null;
    const recipientOutputCommitmentHex =
      step.recipient_output_commitment_hex ??
      pendingStep?.recipientOutputCommitmentHex ??
      null;
    const recipientEncryptedOutput =
      step.recipient_encrypted_output ?? pendingStep?.recipientEncryptedOutput ?? null;
    let encryptedChangeNoteCiphertext = step.encrypted_change_note_ciphertext;

    if (!outputCommitmentHex || !outputAmountUnits) {
      throw new Error("Reconcilable spend job step is missing prepared output data");
    }

    let outputLeafIndexHint: number | null = step.output_leaf_index ?? null;
    if (!txHash) {
      if (deps.findPoolCommitmentEvent) {
        try {
          const recovered = await deps.findPoolCommitmentEvent(
            outputCommitmentHex,
            Math.max(1, pendingStep?.relayStartLedger ?? 1),
          );
          outputLeafIndexHint = recovered.leafIndex;
          if (!recovered.txHash) {
            throw new Error("Recovered commitment event did not include a transaction hash");
          }
          txHash = recovered.txHash;
          await deps.repository.markSpendJobRecoveredSubmittedTx({
            userId: payload.userId,
            jobId: payload.jobId,
            stepId: step.id,
            txHash,
            leaseOwner: deps.leaseOwner,
            leaseSeconds: normalizedLeaseSeconds(deps),
          });
        } catch (error) {
          if (!isCommitmentNotFoundError(error)) throw error;
        }
      }

      if (!txHash) {
        if (!step.relay_body) {
          throw new Error("Reconcilable spend job step is missing relay body");
        }
        if (!encryptedChangeNoteCiphertext && pendingStep && BigInt(outputAmountUnits) > BigInt(0)) {
          encryptedChangeNoteCiphertext = await deps.encryptChangeNote(
            pendingStep.changeNote,
            payload,
          );
        }
        await deps.repository.markSpendJobStepRelaying({
          userId: payload.userId,
          jobId: payload.jobId,
          stepId: step.id,
          leaseOwner: deps.leaseOwner,
          leaseSeconds: normalizedLeaseSeconds(deps),
        });
        await heartbeat({
          deps,
          userId: payload.userId,
          jobId: payload.jobId,
          stepId: step.id,
        });
        const relayed = await deps.relay(step.relay_body as unknown as RelayBody);
        txHash = relayed.txHash;
        await deps.repository.markSpendJobSubmitted({
          userId: payload.userId,
          jobId: payload.jobId,
          stepId: step.id,
          txHash,
          outputCommitmentHex,
          outputAmountUnits,
          encryptedChangeNoteCiphertext,
          leaseOwner: deps.leaseOwner,
          leaseSeconds: normalizedLeaseSeconds(deps),
        });
      }
    }

    await finalizeSubmittedStep({
      deps,
      payload,
      job,
      step,
      txHash,
      outputCommitmentHex,
      outputAmountUnits,
      encryptedChangeNoteCiphertext,
      changeNoteSecrets: pendingStep?.changeNote ?? null,
      recipientOutputCommitmentHex,
      recipientEncryptedOutput,
      outputLeafIndexHint,
      recipientOutputLeafIndexHint: step.recipient_output_leaf_index ?? null,
    });

    return {
      status: "reconciled",
      jobId: payload.jobId,
      stepId: step.id,
      txHash,
    };
  } catch (error) {
    await markWorkerFailure({
      repository: deps.repository,
      userId: job.user_id,
      jobId: job.id,
      stepId: step.id,
      attempts: step.attempts ?? 0,
      error,
      txHash,
    });
    throw error;
  }
}

export async function advanceOneBackgroundSpendStep(
  deps: BackgroundSpendWorkerDependencies,
): Promise<BackgroundSpendWorkerResult> {
  const reconciled = await reconcileOneBackgroundSpendStep(deps);
  if (reconciled) return reconciled;

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
    leaseSeconds: normalizedLeaseSeconds(deps),
  });
  if (!claimed) return { status: "claimed_by_other", jobId: candidate.job.id };

  const { job, step } = claimed;
  const kind = job.kind === "lane2_transfer" ? "lane2_transfer" : "lane1_withdraw";
  let txHash: string | null = null;

  try {
    let outputCommitmentHex: string;
    let outputAmountUnits: string;
    let changeNote: PrivateNoteSecrets;
    let relayBody: RelayBody;
    let recipientOutputCommitmentHex: string | null = null;
    let recipientEncryptedOutput: string | null = null;
    let inputNullifierHex: string | null = null;
    let encryptedChangeNoteCiphertext: string | null;
    let preparedPayload = payload;
    let pendingStep: BackgroundSpendPendingStep;

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
      inputNullifierHex = firstInputNullifier(proof);
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
        leafIndex: null,
        dummyBlindingHex: "",
        dummyCommitmentHex: "",
        createdAt: Date.now(),
      };
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
      inputNullifierHex = firstInputNullifier(proof);
      outputCommitmentHex = proof.changeNoteCommitmentHex;
      outputAmountUnits = proof.changeAmountUnits;
      changeNote = {
        blindingHex: proof.changeNoteBlindingHex,
        commitmentHex: proof.changeNoteCommitmentHex,
        amountUnits: proof.changeAmountUnits,
        leafIndex: null,
        dummyBlindingHex: proof.nextDummyBlindingHex,
        dummyCommitmentHex: proof.nextDummyCommitmentHex,
        createdAt: Date.now(),
      };
    }

    const prepared = await checkpointPreparedStep({
      deps,
      payload,
      step,
      relayBody,
      outputCommitmentHex,
      outputAmountUnits,
      changeNote,
      inputNullifierHex,
      recipientOutputCommitmentHex,
      recipientEncryptedOutput,
    });
    preparedPayload = prepared.payload;
    pendingStep = prepared.pendingStep;
    encryptedChangeNoteCiphertext = prepared.encryptedChangeNoteCiphertext;

    await deps.repository.markSpendJobStepRelaying({
      userId: payload.userId,
      jobId: payload.jobId,
      stepId: step.id,
      leaseOwner: deps.leaseOwner,
      leaseSeconds: normalizedLeaseSeconds(deps),
    });
    await heartbeat({
      deps,
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
      encryptedChangeNoteCiphertext,
      leaseOwner: deps.leaseOwner,
      leaseSeconds: normalizedLeaseSeconds(deps),
    });

    await finalizeSubmittedStep({
      deps,
      payload: preparedPayload,
      job,
      step,
      txHash,
      outputCommitmentHex,
      outputAmountUnits,
      encryptedChangeNoteCiphertext,
      changeNoteSecrets: pendingStep.changeNote,
      recipientOutputCommitmentHex,
      recipientEncryptedOutput,
    });

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
