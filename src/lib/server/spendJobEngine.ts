import type { RelayBody, WithdrawResponse } from "@/types";

export type SpendJobErrorClass =
  | "already_spent_nullifier"
  | "invalid_proof"
  | "prover_pool_state_lag"
  | "relayer_simulation_lag"
  | "network_fetch"
  | "unknown";

export interface SpendJobAdvanceMaterial {
  notePrivateKeyHex: string;
  senderEncryptionPublicHex: string;
  membershipBlindingHex: string;
  noteBlindingHex: string;
  noteAmountUnits: string;
  noteLeafIndex: number;
  dummyBlindingHex: string;
  encryptedChangeNoteCiphertext: string;
}

export interface SpendJobAdvanceStep {
  id: string;
  ordinal: number;
  recipientAddress: string;
  amountUnits: string;
  sourceNoteId: string;
  attempts?: number;
}

export interface SpendJobAdvanceRepository {
  getNextRunnableStep(input: {
    userId: string;
    jobId: string;
  }): Promise<{
    job: {
      id: string;
      userId: string;
      poolId: string;
      status: string;
    };
    step: SpendJobAdvanceStep;
  } | null>;
  markStepProving(input: {
    userId: string;
    jobId: string;
    stepId: string;
  }): Promise<void>;
  markStepProofReady(input: {
    userId: string;
    jobId: string;
    stepId: string;
    relayBody: RelayBody;
    outputCommitmentHex: string;
    outputAmountUnits: string;
    inputNullifierHex?: string | null;
  }): Promise<void>;
  markStepRelaying(input: {
    userId: string;
    jobId: string;
    stepId: string;
  }): Promise<void>;
  markStepSubmitted(input: {
    userId: string;
    jobId: string;
    stepId: string;
    txHash: string;
    outputCommitmentHex: string;
    outputAmountUnits: string;
    encryptedChangeNoteCiphertext: string;
  }): Promise<void>;
  storeStepResult(input: {
    userId: string;
    jobId: string;
    stepId: string;
    sourceNoteId: string;
    changeNote: {
      commitmentHex: string;
      encryptedNoteCiphertext: string;
      amountUnits: string;
      leafIndex: number;
      txHash: string;
    } | null;
    isFinalStep: boolean;
  }): Promise<void>;
  markNeedsReconcile(input: {
    userId: string;
    jobId: string;
    stepId: string;
    errorClass: SpendJobErrorClass;
    errorMessage: string;
  }): Promise<void>;
  markRetryableFailure(input: {
    userId: string;
    jobId: string;
    stepId: string;
    errorClass: SpendJobErrorClass;
    errorMessage: string;
    retryAfter?: Date | null;
  }): Promise<void>;
}

export interface SpendJobAdvanceDependencies {
  userId: string;
  jobId: string;
  spendMaterial: SpendJobAdvanceMaterial;
  repository: SpendJobAdvanceRepository;
  proveWithdraw: (body: unknown) => Promise<WithdrawResponse>;
  relay: (relayBody: RelayBody) => Promise<{ txHash: string }>;
  waitForTransaction: (txHash: string) => Promise<number>;
  findNoteLeafIndex: (commitmentHex: string, minedLedger: number) => Promise<number>;
}

export interface SpendJobAdvanceResult {
  status: "stored";
  txHash: string;
  stepId: string;
  changeNoteCommitmentHex: string;
  changeAmountUnits: string;
  changeLeaf: number;
}

export class AlreadySpentNullifierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlreadySpentNullifierError";
  }
}

function messageHasClass(message: string, errorClass: string): boolean {
  return new RegExp(`"class"\\s*:\\s*"${errorClass}"`).test(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function classifySpendJobError(error: unknown): SpendJobErrorClass {
  const message = errorMessage(error);
  if (messageHasClass(message, "already_spent_nullifier")) {
    return "already_spent_nullifier";
  }
  if (messageHasClass(message, "invalid_proof")) {
    return "invalid_proof";
  }
  if (messageHasClass(message, "pool_state_lag")) {
    return "prover_pool_state_lag";
  }
  if (messageHasClass(message, "unknown_root")) {
    return "relayer_simulation_lag";
  }
  if (/Error\(Contract,\s*#9\)|AlreadySpentNullifier|already spent|nullifier/i.test(message)) {
    return "already_spent_nullifier";
  }
  if (/Error\(Contract,\s*#0\)|Groth16Error::InvalidProof|InvalidProof/i.test(message)) {
    return "invalid_proof";
  }
  if (
    /contracts_data_for_pool|asp_state|out of range|not been indexed|only has \d+ commitments|indexed yet/i.test(
      message,
    )
  ) {
    return "prover_pool_state_lag";
  }
  if (/Error\(Contract,\s*#8\)|UnknownRoot|unknown root|invalid root|root/i.test(message)) {
    return "relayer_simulation_lag";
  }
  if (/fetch failed|network|RPC|range lag|ledger range|startLedger|timeout/i.test(message)) {
    return "network_fetch";
  }
  return "unknown";
}

const BASE_SPEND_JOB_RETRY_DELAY_MS = 15_000;
export const MAX_SPEND_JOB_RETRY_DELAY_MS = 5 * 60_000;

export function retryAfterFor(errorClass: SpendJobErrorClass, attempts = 0): Date | null {
  if (
    errorClass === "unknown" ||
    errorClass === "already_spent_nullifier" ||
    errorClass === "invalid_proof"
  ) {
    return null;
  }
  const retryIndex = Math.max(0, attempts - 1);
  const delayMs = Math.min(
    BASE_SPEND_JOB_RETRY_DELAY_MS * 2 ** Math.min(retryIndex, 5),
    MAX_SPEND_JOB_RETRY_DELAY_MS,
  );
  return new Date(Date.now() + delayMs);
}

export function shouldReconcileSpendJobFailure(input: {
  errorClass: SpendJobErrorClass;
  submittedTxHash?: string | null;
}): boolean {
  return Boolean(input.submittedTxHash) || input.errorClass === "already_spent_nullifier";
}

export function shouldRetrySpendJobFailure(input: {
  errorClass: SpendJobErrorClass;
  attempts: number;
  submittedTxHash?: string | null;
}): boolean {
  if (shouldReconcileSpendJobFailure(input)) return false;
  return retryAfterFor(input.errorClass, input.attempts) !== null;
}

function firstInputNullifier(result: WithdrawResponse): string | null {
  return result.relayBody.public.inputNullifiers[0] ?? null;
}

export async function advanceSpendJob(
  deps: SpendJobAdvanceDependencies,
): Promise<SpendJobAdvanceResult> {
  const runnable = await deps.repository.getNextRunnableStep({
    userId: deps.userId,
    jobId: deps.jobId,
  });
  if (!runnable) {
    throw new Error("No runnable spend job step");
  }

  const { step } = runnable;
  let proof: WithdrawResponse | null = null;
  let submittedTxHash: string | null = null;

  try {
    await deps.repository.markStepProving({
      userId: deps.userId,
      jobId: deps.jobId,
      stepId: step.id,
    });

    proof = await deps.proveWithdraw({
      notePrivateKeyHex: deps.spendMaterial.notePrivateKeyHex,
      senderEncryptionPublicHex: deps.spendMaterial.senderEncryptionPublicHex,
      membershipBlindingHex: deps.spendMaterial.membershipBlindingHex,
      noteBlindingHex: deps.spendMaterial.noteBlindingHex,
      noteAmountUnits: deps.spendMaterial.noteAmountUnits,
      noteLeafIndex: deps.spendMaterial.noteLeafIndex,
      dummyBlindingHex: deps.spendMaterial.dummyBlindingHex,
      withdrawAmountUnits: step.amountUnits,
      recipientStellarAddress: step.recipientAddress,
      poolId: runnable.job.poolId,
    });

    await deps.repository.markStepProofReady({
      userId: deps.userId,
      jobId: deps.jobId,
      stepId: step.id,
      relayBody: proof.relayBody,
      outputCommitmentHex: proof.changeNoteCommitmentHex,
      outputAmountUnits: proof.changeAmountUnits,
      inputNullifierHex: firstInputNullifier(proof),
    });

    await deps.repository.markStepRelaying({
      userId: deps.userId,
      jobId: deps.jobId,
      stepId: step.id,
    });

    const { txHash } = await deps.relay(proof.relayBody);
    submittedTxHash = txHash;

    await deps.repository.markStepSubmitted({
      userId: deps.userId,
      jobId: deps.jobId,
      stepId: step.id,
      txHash,
      outputCommitmentHex: proof.changeNoteCommitmentHex,
      outputAmountUnits: proof.changeAmountUnits,
      encryptedChangeNoteCiphertext: deps.spendMaterial.encryptedChangeNoteCiphertext,
    });

    const minedLedger = await deps.waitForTransaction(txHash);
    const changeLeaf =
      BigInt(proof.changeAmountUnits) > BigInt(0)
        ? await deps.findNoteLeafIndex(proof.changeNoteCommitmentHex, minedLedger)
        : deps.spendMaterial.noteLeafIndex + 2;

    await deps.repository.storeStepResult({
      userId: deps.userId,
      jobId: deps.jobId,
      stepId: step.id,
      sourceNoteId: step.sourceNoteId,
      changeNote:
        BigInt(proof.changeAmountUnits) > BigInt(0)
          ? {
              commitmentHex: proof.changeNoteCommitmentHex,
              encryptedNoteCiphertext: deps.spendMaterial.encryptedChangeNoteCiphertext,
              amountUnits: proof.changeAmountUnits,
              leafIndex: changeLeaf,
              txHash,
            }
          : null,
      isFinalStep: BigInt(proof.changeAmountUnits) === BigInt(0),
    });

    return {
      status: "stored",
      txHash,
      stepId: step.id,
      changeNoteCommitmentHex: proof.changeNoteCommitmentHex,
      changeAmountUnits: proof.changeAmountUnits,
      changeLeaf,
    };
  } catch (error) {
    const errorClass = classifySpendJobError(error);
    const message = errorMessage(error);
    if (shouldReconcileSpendJobFailure({ errorClass, submittedTxHash })) {
      await deps.repository.markNeedsReconcile({
        userId: deps.userId,
        jobId: deps.jobId,
        stepId: step.id,
        errorClass,
        errorMessage: submittedTxHash
          ? `${message} after tx submission ${submittedTxHash}`
          : message,
      });
      if (errorClass === "already_spent_nullifier") {
        throw new AlreadySpentNullifierError(message);
      }
      throw error;
    }

    const retryable = shouldRetrySpendJobFailure({
      errorClass,
      attempts: step.attempts ?? 0,
      submittedTxHash,
    });

    await deps.repository.markRetryableFailure({
      userId: deps.userId,
      jobId: deps.jobId,
      stepId: step.id,
      errorClass,
      errorMessage: submittedTxHash
        ? `${message} after tx submission ${submittedTxHash}`
        : message,
      retryAfter: retryable ? retryAfterFor(errorClass, step.attempts ?? 0) : null,
    });
    throw error;
  }
}
