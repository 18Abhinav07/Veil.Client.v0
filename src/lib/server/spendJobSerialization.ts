import type {
  ActivityEventRow,
  SpendJobDetail,
  SpendJobRow,
  SpendJobStepRow,
} from "./walletRepositoryCore";

export function serializeSpendJob(job: SpendJobRow) {
  return {
    id: job.id,
    requestId: job.request_id,
    kind: job.kind,
    executionMode: job.execution_mode,
    status: job.status,
    idempotencyKey: job.idempotency_key,
    sourceNoteId: job.source_note_id,
    sourceCommitmentHex: job.source_commitment_hex,
    sourceAmountUnits: job.source_amount_units,
    sourceLeafIndex: job.source_leaf_index,
    activeNoteId: job.active_note_id,
    activeCommitmentHex: job.active_commitment_hex,
    activeAmountUnits: job.active_amount_units,
    activeLeafIndex: job.active_leaf_index,
    poolId: job.pool_id,
    totalAmountUnits: job.total_amount_units,
    totalRecipients: job.total_recipients,
    completedCount: job.completed_count,
    retryAfter: job.retry_after,
    errorClass: job.error_class,
    errorMessage: job.error_message,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

export function serializeSpendJobStep(step: SpendJobStepRow) {
  return {
    id: step.id,
    jobId: step.job_id,
    ordinal: step.ordinal,
    recipientAddress: step.recipient_address,
    amountUnits: step.amount_units,
    status: step.status,
    sourceNoteId: step.source_note_id,
    sourceCommitmentHex: step.source_commitment_hex,
    sourceAmountUnits: step.source_amount_units,
    sourceLeafIndex: step.source_leaf_index,
    txHash: step.tx_hash,
    outputCommitmentHex: step.output_commitment_hex,
    outputAmountUnits: step.output_amount_units,
    outputLeafIndex: step.output_leaf_index,
    recipientUserId: step.recipient_user_id,
    recipientHandle: step.recipient_handle,
    recipientNotePublicHex: step.recipient_note_public_hex,
    recipientX25519PublicHex: step.recipient_x25519_public_hex,
    recipientOutputCommitmentHex: step.recipient_output_commitment_hex,
    recipientOutputLeafIndex: step.recipient_output_leaf_index,
    recipientEncryptedOutput: step.recipient_encrypted_output,
    attempts: step.attempts,
    errorClass: step.error_class,
    errorMessage: step.error_message,
    retryAfter: step.retry_after,
    createdAt: step.created_at,
    updatedAt: step.updated_at,
  };
}

function normalizeSpendJobForSteps(detail: SpendJobDetail): SpendJobRow {
  const completedCount = detail.steps.filter((step) => step.status === "confirmed").length;
  const reconcileStep = detail.steps.find((step) => step.status === "needs_reconcile");
  const retryStep = detail.steps.find((step) => step.status === "retry_wait");
  const activeStep = detail.steps.find((step) =>
    ["proving", "proof_ready", "relaying", "submitted", "mined", "indexing", "stored"].includes(
      step.status,
    ),
  );

  if (completedCount === detail.job.total_recipients) {
    return {
      ...detail.job,
      status: "completed",
      completed_count: completedCount,
      error_class: null,
      error_message: null,
    };
  }

  if (reconcileStep) {
    return {
      ...detail.job,
      status: "needs_reconcile",
      completed_count: completedCount,
      error_class: reconcileStep.error_class ?? detail.job.error_class,
      error_message: reconcileStep.error_message ?? detail.job.error_message,
    };
  }

  if (retryStep) {
    return {
      ...detail.job,
      status: "waiting_retry",
      completed_count: completedCount,
      error_class: retryStep.error_class ?? detail.job.error_class,
      error_message: retryStep.error_message ?? detail.job.error_message,
      retry_after: retryStep.retry_after ?? detail.job.retry_after,
    };
  }

  if (activeStep) {
    return {
      ...detail.job,
      status: "running",
      completed_count: completedCount,
    };
  }

  return {
    ...detail.job,
    completed_count: completedCount,
  };
}

export function serializeSpendJobDetail(detail: SpendJobDetail) {
  const job = normalizeSpendJobForSteps(detail);
  return {
    job: serializeSpendJob(job),
    steps: detail.steps.map(serializeSpendJobStep),
  };
}

export function serializeActivityEvent(event: ActivityEventRow) {
  return {
    id: event.id,
    jobId: event.spend_job_id ?? event.job_id,
    legacyJobId: event.job_id,
    spendJobId: event.spend_job_id,
    noteId: event.note_id,
    requestId: event.request_id,
    eventType: event.event_type,
    eventData: event.event_data,
    txHash: event.tx_hash,
    createdAt: event.created_at,
  };
}
