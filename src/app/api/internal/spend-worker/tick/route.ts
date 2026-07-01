import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { encryptPrivateNote } from "@/lib/noteCrypto";
import { findNoteLeafIndex, waitForTransaction } from "@/lib/stellar";
import {
  decryptBackgroundExecutionPackage,
  encryptBackgroundExecutionPackage,
  readBackgroundExecutionKey,
} from "@/lib/server/backgroundExecutionPackage";
import {
  advanceOneBackgroundSpendStep,
  type BackgroundSpendWorkerRepository,
} from "@/lib/server/backgroundSpendWorker";
import { isTransientProverLag, isTransientRelayLag } from "@/lib/server/bulkWithdraw";
import { getPgPool } from "@/lib/server/db";
import { getInternalServiceHeaders, requireInternalServiceAccess } from "@/lib/server/internalServiceAuth";
import { fetchJsonWithRetry } from "@/lib/server/upstreamRetry";
import {
  claimNextRunnableSpendJobStep,
  deleteSpendJobExecutionPackage,
  getNextBackgroundSpendJobCandidate,
  markSpendJobNeedsReconcile,
  markSpendJobRetryableFailure,
  markSpendJobStepProofReady,
  markSpendJobStepRelaying,
  markSpendJobSubmitted,
  storeSpendJobStepResult,
  updateSpendJobExecutionPackage,
} from "@/lib/server/walletRepository";
import type { WalletSecrets } from "@/lib/vaultCrypto";
import type { RelayBody, TransferResponse, WithdrawResponse } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

const PROVER_API = process.env.PROVER_API_URL ?? "http://127.0.0.1:3001";
const RELAYER_URL =
  process.env.RELAYER_URL ??
  process.env.NEXT_PUBLIC_RELAYER_URL ??
  "http://127.0.0.1:3000";

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

async function relay(relayBody: RelayBody): Promise<{ txHash: string }> {
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

function repository(): BackgroundSpendWorkerRepository {
  const db = getPgPool();
  return {
    getNextBackgroundSpendJobCandidate: (input) =>
      getNextBackgroundSpendJobCandidate(db, input),
    claimNextRunnableSpendJobStep: (input) =>
      claimNextRunnableSpendJobStep(db, input),
    markSpendJobStepProofReady: (input) =>
      markSpendJobStepProofReady(db, {
        ...input,
        relayBody: input.relayBody,
      }),
    markSpendJobStepRelaying: (input) => markSpendJobStepRelaying(db, input),
    markSpendJobSubmitted: (input) => markSpendJobSubmitted(db, input),
    storeSpendJobStepResult: (input) => storeSpendJobStepResult(db, input),
    updateSpendJobExecutionPackage: (input) =>
      updateSpendJobExecutionPackage(db, {
        userId: input.userId,
        jobId: input.jobId,
        encryptedPackageCiphertext: JSON.stringify(input.encryptedPackage),
        expiresAt: new Date(input.package.expiresAt),
      }),
    deleteSpendJobExecutionPackage: (input) =>
      deleteSpendJobExecutionPackage(db, input),
    markSpendJobRetryableFailure: (input) =>
      markSpendJobRetryableFailure(db, input),
    markSpendJobNeedsReconcile: (input) => markSpendJobNeedsReconcile(db, input),
  };
}

export async function POST(request: Request) {
  const access = requireInternalServiceAccess(request.headers);
  if (!access.ok) {
    return NextResponse.json({ error: access.code }, { status: access.status });
  }

  let key: string;
  try {
    key = readBackgroundExecutionKey({
      JOB_EXECUTION_ENCRYPTION_KEY: process.env.JOB_EXECUTION_ENCRYPTION_KEY,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    );
  }

  const result = await advanceOneBackgroundSpendStep({
    leaseOwner: `spend-worker-${randomUUID()}`,
    repository: repository(),
    decryptPackage: (encrypted) =>
      decryptBackgroundExecutionPackage(encrypted, { key }),
    encryptPackage: (payload) =>
      encryptBackgroundExecutionPackage(payload, { key }),
    encryptChangeNote: async (note, payload) => {
      const wallet = {
        bn254NotePrivateKeyHex: payload.notePrivateKeyHex,
      } as unknown as WalletSecrets;
      return JSON.stringify(await encryptPrivateNote(note, wallet));
    },
    proveWithdraw,
    proveTransfer,
    relay,
    waitForTransaction,
    findNoteLeafIndex,
  });

  return NextResponse.json({ result });
}
