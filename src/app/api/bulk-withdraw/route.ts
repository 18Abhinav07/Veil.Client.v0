import { NextRequest, NextResponse } from "next/server";
import { waitForTransaction, findNoteLeafIndex } from "@/lib/stellar";
import {
  BulkWithdrawExecutionError,
  executeBulkWithdraw,
  isTransientProverLag,
  isTransientRelayLag,
  type BulkWithdrawBody,
} from "@/lib/server/bulkWithdraw";
import { fetchJsonWithRetry } from "@/lib/server/upstreamRetry";
import {
  getInternalServiceHeaders,
  requireLegacyProofRouteAccess,
} from "@/lib/server/internalServiceAuth";
import type { WithdrawResponse, RelayBody } from "@/types";

// Path 1 — server-side orchestration of the prove → relay → wait → index chain.
//
// The browser fires ONE request and gets back the full result. All the multi-step
// fragility lives here, behind bounded retries, instead of in the client:
//
//   For each recipient:
//     prove-withdraw  (retried through RPC indexing lag)        — prover rebuilds
//        the pool Merkle tree from getEvents off a load-balanced node that can
//        trail the node that saw our last relay → transient "leaf out of range".
//     relay           (retried through simulation lag)          — the node that
//        simulates the relay can trail the node that mined the previous change
//        note, so the pool's on-chain root set doesn't yet include the (valid)
//        root the prover used → Error(Contract, #8) / SIMULATION_REJECTED. The
//        proof is genuinely valid; the SAME body passes once the relayer lands on
//        a caught-up node — so retry the identical body (no re-prove) with backoff.
//     wait + find leaf (between steps) — the next step spends this step's change
//        note, whose commitment must be mined AND indexed before we can prove again.
//
// Retries are safe: a simulation rejection means nothing was submitted on-chain,
// and the pool's nullifier check independently blocks any double-spend.

export const runtime = "nodejs";
// Long chain: proof (~30–120 s) + relay retries + per-step waits. Only enforced on
// serverless platforms; the local dev server runs without this ceiling.
export const maxDuration = 800;

const PROVER_API = process.env.PROVER_API_URL ?? "http://127.0.0.1:3001";
const RELAYER_URL =
  process.env.RELAYER_URL ??
  process.env.NEXT_PUBLIC_RELAYER_URL ??
  "http://127.0.0.1:3000";

// prove-withdraw via the prover, retried through RPC indexing lag.
async function proveWithdraw(
  body: unknown,
  { tries = 12, delayMs = 5000 } = {},
): Promise<WithdrawResponse> {
	return fetchJsonWithRetry<WithdrawResponse>(
    `${PROVER_API}/prove/withdraw`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getInternalServiceHeaders() },
      body: JSON.stringify(body),
    },
    {
      serviceName: "prover-api /prove/withdraw",
      tries,
      delayMs,
      isRetryableStatus: isTransientProverLag,
    },
  );
}

// relay via the relayer, retried through simulation lag. Re-POSTs the IDENTICAL
// body (no re-prove) — the proof is valid, it just references a root a lagging
// node hasn't indexed yet.
async function relayWithRetry(
  relayBody: RelayBody,
  { tries = 18, delayMs = 5000 } = {},
): Promise<{ txHash: string }> {
	  return fetchJsonWithRetry<{ txHash: string }>(
    `${RELAYER_URL}/relay`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getInternalServiceHeaders() },
      body: JSON.stringify(relayBody),
    },
    {
      serviceName: "relayer /relay",
      tries,
      delayMs,
      isRetryableStatus: isTransientRelayLag,
    },
  );
}

export async function POST(req: NextRequest) {
  const access = requireLegacyProofRouteAccess(req.headers);
  if (!access.ok) {
    const error =
      access.code === "LEGACY_ROUTE_DISABLED"
        ? "LEGACY_ROUTE_DISABLED"
        : "SERVICE_AUTH_REQUIRED";
    return NextResponse.json({ error }, { status: access.status });
  }

  let body: BulkWithdrawBody;
  try {
    body = (await req.json()) as BulkWithdrawBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { recipients } = body;
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json({ error: "No recipients" }, { status: 400 });
  }

  // Pre-flight: the note must cover the sum of all payouts.
  const totalOut = recipients.reduce(
    (s, r) => s + BigInt(r.amountUnits),
    BigInt(0),
  );
  if (totalOut > BigInt(body.noteAmountUnits)) {
    return NextResponse.json(
      {
        error: `Insufficient note balance: sending ${totalOut} but the note holds ${body.noteAmountUnits}`,
      },
      { status: 400 },
    );
  }

  try {
    const steps = await executeBulkWithdraw(body, {
      proveWithdraw,
      relay: relayWithRetry,
      waitForTransaction,
      findNoteLeafIndex,
    });
    return NextResponse.json({ steps, completed: steps.length });
  } catch (e) {
    const steps = e instanceof BulkWithdrawExecutionError ? e.steps : [];
    // Partial progress: whatever settled on-chain is returned so the client can
    // reconcile its note list (mark the original spent, adopt the last change
    // note) instead of losing the unrecoverable change blinding.
    return NextResponse.json(
      { error: String(e), steps, completed: steps.length },
      { status: 502 },
    );
  }
}
