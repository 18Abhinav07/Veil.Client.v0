"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode, useMemo } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock, Loader2, ShieldCheck, Check } from "lucide-react";
import type { WalletSecrets } from "@/lib/vaultCrypto";
import { formatStellarUnits } from "@/lib/publicWalletCore";
import ExpandableCard from "./ExpandableCard";
import {
  decryptPrivateNote,
  encryptPrivateNote,
  type EncryptedPrivateNotePayload,
  type PrivateNoteSecrets,
} from "@/lib/noteCrypto";
import { useWalletRealtimeEvent } from "./WalletRealtimeProvider";

interface SpendJobStepView {
  id: string;
  ordinal: number;
  recipientAddress: string;
  amountUnits: string;
  status: string;
  txHash: string | null;
  outputCommitmentHex: string | null;
  outputAmountUnits: string | null;
  outputLeafIndex: number | null;
  attempts: number;
  errorClass: string | null;
  errorMessage: string | null;
  retryAfter: string | null;
}

interface SpendJobView {
  job: {
    id: string;
    executionMode?: "interactive" | "background";
    status: string;
    sourceCommitmentHex: string;
    activeCommitmentHex: string;
    activeAmountUnits: string;
    activeLeafIndex: number | null;
    totalAmountUnits: string;
    totalRecipients: number;
    completedCount: number;
    retryAfter: string | null;
    errorClass: string | null;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
  };
  steps: SpendJobStepView[];
}

type NoteStatus =
  | "unspent"
  | "spent"
  | "pending_deposit"
  | "pending_spend"
  | "received"
  | "failed_recovery";
type NoteSource = "deposit" | "change" | "received";

interface StoredNoteRow {
  id: string;
  commitmentHex: string;
  encryptedNoteCiphertext: string;
  assetCode: string;
  amountUnits: string;
  leafIndex: number | null;
  status: NoteStatus;
  source: NoteSource;
  txHash: string | null;
  activeJobId: string | null;
  spendVersion: number;
  lastChainCheckedAt: string | null;
  createdAt: string;
}

interface DecryptedNote {
  row: StoredNoteRow;
  note: PrivateNoteSecrets;
}

interface ProveResult {
  result: {
    status: "proof_ready";
    jobId: string;
    stepId: string;
    ordinal: number;
    recipientAddress: string;
    amountUnits: string;
    changeNote: PrivateNoteSecrets;
  };
  job: SpendJobView | null;
}

interface SubmitResult {
  result: {
    status: "stored";
    stepId: string;
    txHash: string;
    changeLeaf: number;
    changeNoteCommitmentHex: string;
    changeAmountUnits: string;
  };
  job: SpendJobView | null;
}

interface PrivateActivityProps {
  wallet: WalletSecrets;
  initialJobs?: SpendJobView[];
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
  return data as T;
}

function shortHash(value: string) {
  return value.length <= 18 ? value : `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function titleCaseStatus(status: string) {
  return status.replace(/_/g, " ");
}

function formatActivityDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function jobProgress(job: SpendJobView) {
  if (job.job.totalRecipients <= 0) return 0;
  return Math.round((job.job.completedCount / job.job.totalRecipients) * 100);
}

function jobTone(status: string) {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "needs_reconcile" || status === "waiting_retry" || status === "paused_needs_unlock") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  if (status.startsWith("failed")) return "border-red-200 bg-red-50 text-red-800";
  return "border-stone-200 bg-stone-50 text-stone-700";
}

function hasRecoverableStepToReconcile(job: SpendJobView) {
  return job.steps.some(
    (step) =>
      Boolean(step.txHash) &&
      ["retry_wait", "needs_reconcile"].includes(step.status),
  );
}

function canReconcileSpendJob(job: SpendJobView) {
  return job.job.status === "needs_reconcile" && hasRecoverableStepToReconcile(job);
}

function hasProofReadyStepToResume(job: SpendJobView) {
  return (
    job.job.status === "running" &&
    job.steps.some((step) => step.status === "proof_ready" && !step.txHash)
  );
}

function hasQueuedStepToResume(job: SpendJobView) {
  return (
    isInteractiveSpendJob(job) &&
    ["queued", "running"].includes(job.job.status) &&
    job.steps.some((step) => step.status === "queued" && !step.txHash)
  );
}

function canResumeSpendJob(job: SpendJobView) {
  return (
    ["paused_needs_unlock", "waiting_retry", "failed_recoverable"].includes(job.job.status) ||
    hasQueuedStepToResume(job) ||
    hasProofReadyStepToResume(job)
  );
}

const spendJobStageItems = [
  {
    key: "proof",
    label: "Proof",
    activeStatuses: ["proving"],
    doneStatuses: ["proof_ready", "relaying", "submitted", "mined", "indexing", "stored", "confirmed"],
  },
  {
    key: "relay",
    label: "Relay",
    activeStatuses: ["proof_ready", "relaying"],
    doneStatuses: ["submitted", "mined", "indexing", "stored", "confirmed"],
  },
  {
    key: "mined",
    label: "Mined",
    activeStatuses: ["submitted", "mined"],
    doneStatuses: ["indexing", "stored", "confirmed"],
  },
  {
    key: "indexed",
    label: "Indexed",
    activeStatuses: ["indexing"],
    doneStatuses: ["stored", "confirmed"],
  },
  {
    key: "stored",
    label: "Stored",
    activeStatuses: ["stored"],
    doneStatuses: ["confirmed"],
  },
];

function spendJobStageState(stepStatus: string, stage: (typeof spendJobStageItems)[number]) {
  if (stepStatus === "retry_wait") return "retry";
  if (stepStatus === "needs_reconcile") return "reconcile";
  if (stepStatus === "failed_final") return "failed";
  if (stage.doneStatuses.includes(stepStatus)) return "done";
  if (stage.activeStatuses.includes(stepStatus)) return "active";
  return "pending";
}

function spendJobStageTone(state: string) {
  if (state === "done") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "active") return "border-stone-300 bg-stone-100 text-stone-950";
  if (state === "retry" || state === "reconcile") return "border-amber-200 bg-amber-50 text-amber-900";
  if (state === "failed") return "border-red-200 bg-red-50 text-red-800";
  return "border-stone-200 bg-stone-50 text-stone-500";
}

function stageDotTone(state: string) {
  if (state === "done") return "bg-emerald-600";
  if (state === "active") return "bg-stone-950";
  if (state === "retry" || state === "reconcile") return "bg-amber-600";
  if (state === "failed") return "bg-red-600";
  return "bg-stone-300";
}

function recoveryCopy(step: SpendJobStepView) {
  if (step.status === "retry_wait") {
    return "Retry is waiting for a fresh prover or relayer state. Resume after the retry window.";
  }
  if (step.status === "needs_reconcile") {
    return "Reconcile this submitted or already-used note before attempting another spend.";
  }
  if (step.status === "failed_final") {
    return "This step reached a final failure and needs manual review.";
  }
  return "";
}

const primaryButtonClass =
  "inline-flex h-10 items-center justify-center rounded-lg bg-stone-950 px-4 text-sm font-medium text-stone-50 transition hover:bg-stone-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2";
const secondaryButtonClass =
  "inline-flex h-10 items-center justify-center rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-800 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2";
const MAX_INTERACTIVE_RECIPIENTS = 5;
const PRIVATE_SPEND_UNLOAD_MESSAGE =
  "Private transaction in progress. Please wait until the current private transfer finishes before refreshing.";

function isInteractiveSpendJob(job: SpendJobView) {
  return (
    job.job.executionMode === "interactive" ||
    (!job.job.executionMode && job.job.totalRecipients <= MAX_INTERACTIVE_RECIPIENTS)
  );
}

function isInteractiveSpendJobInFlight(job: SpendJobView) {
  return (
    isInteractiveSpendJob(job) &&
    job.job.status === "running" &&
    job.job.completedCount < job.job.totalRecipients &&
    job.steps.some((step) =>
      ["queued", "proving", "proof_ready", "relaying", "submitted", "mined", "indexing", "stored"].includes(
        step.status,
      ),
    )
  );
}

export default function PrivateActivity({ wallet, initialJobs }: PrivateActivityProps) {
  const [jobs, setJobs] = useState<SpendJobView[]>(initialJobs ?? []);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [resumingJobId, setResumingJobId] = useState<string | null>(null);
  const [reconcilingJobId, setReconcilingJobId] = useState<string | null>(null);
  const jobRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const busy = refreshing || resumingJobId !== null || reconcilingJobId !== null;

  const refreshJobs = useCallback(async (): Promise<SpendJobView[]> => {
    try {
      const data = await parseResponse<{ jobs: SpendJobView[] }>(
        await fetch("/api/wallet/private/spend-jobs", { cache: "no-store" }),
      );
      setJobs(data.jobs);
      setError((current) =>
        /No submitted step with encrypted change note|No runnable spend job step/.test(current)
          ? ""
          : current,
      );
      return data.jobs;
    } catch (err) {
      setError(String(err));
      return [];
    }
  }, []);

  const scheduleJobsRefresh = useCallback(() => {
    if (jobRefreshTimer.current) return;
    jobRefreshTimer.current = setTimeout(() => {
      jobRefreshTimer.current = null;
      void refreshJobs();
    }, 700);
  }, [refreshJobs]);

  const loadUnlockedNotes = useCallback(async (): Promise<DecryptedNote[]> => {
    const data = await parseResponse<{ notes: StoredNoteRow[] }>(
      await fetch("/api/wallet/notes", { cache: "no-store" }),
    );
    const decrypted: DecryptedNote[] = [];
    for (const row of data.notes) {
      try {
        const note = await decryptPrivateNote(
          JSON.parse(row.encryptedNoteCiphertext) as EncryptedPrivateNotePayload,
          wallet,
        );
        decrypted.push({
          row,
          note: {
            ...note,
            leafIndex: row.leafIndex ?? note.leafIndex,
            amountUnits: row.amountUnits,
          },
        });
      } catch {
        continue;
      }
    }
    return decrypted;
  }, [wallet]);

  const runJobFromNote = useCallback(
    async (jobId: string, startingNote: PrivateNoteSecrets) => {
      let currentNote = startingNote;
      for (let guard = 0; guard < 100; guard += 1) {
        if (currentNote.leafIndex === null) {
          throw new Error("This private note is still pending deposit indexing");
        }
        setStatus(`Proving payment step ${guard + 1}...`);
        const proved = await parseResponse<ProveResult>(
          await fetch(`/api/wallet/private/spend-jobs/${jobId}/advance`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              intent: "prove",
              notePrivateKeyHex: wallet.bn254NotePrivateKeyHex,
              senderEncryptionPublicHex: wallet.x25519PublicHex,
              membershipBlindingHex: wallet.membershipBlindingHex,
              noteCommitmentHex: currentNote.commitmentHex,
              noteBlindingHex: currentNote.blindingHex,
              noteAmountUnits: currentNote.amountUnits,
              noteLeafIndex: currentNote.leafIndex,
              dummyBlindingHex: currentNote.dummyBlindingHex,
            }),
          }),
        );

        const encryptedChange = await encryptPrivateNote(proved.result.changeNote, wallet);
        setStatus(`Relaying payment step ${proved.result.ordinal}...`);
        const submitted = await parseResponse<SubmitResult>(
          await fetch(`/api/wallet/private/spend-jobs/${jobId}/advance`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              intent: "submit",
              stepId: proved.result.stepId,
              expectedOutputCommitmentHex: proved.result.changeNote.commitmentHex,
              encryptedChangeNoteCiphertext: JSON.stringify(encryptedChange),
            }),
          }),
        );

        currentNote = {
          ...proved.result.changeNote,
          leafIndex: submitted.result.changeLeaf,
          amountUnits: submitted.result.changeAmountUnits,
        };

        await refreshJobs();
        if (submitted.job?.job.status === "completed") {
          setStatus("Payment job completed.");
          return;
        }
      }
      throw new Error("Payment job did not complete after 100 steps");
    },
    [refreshJobs, wallet],
  );

  const handleResumeJob = useCallback(
    async (job: SpendJobView) => {
      setResumingJobId(job.job.id);
      setError("");
      setStatus("Loading active private note...");
      try {
        const latestJobs = await refreshJobs();
        const latestJob = latestJobs.find((item) => item.job.id === job.job.id) ?? job;
        if (latestJob.job.status === "completed") {
          setStatus("Payment job already completed.");
          setExpandedJobId(null);
          return;
        }
        if (!canResumeSpendJob(latestJob)) {
          setStatus("Payment job is already running.");
          return;
        }
        const notes = await loadUnlockedNotes();
        const activeNote = notes.find(
          (item) => item.note.commitmentHex === latestJob.job.activeCommitmentHex,
        );
        if (!activeNote) {
          throw new Error("Unlock or recover the active change note before resuming this job.");
        }
        await runJobFromNote(latestJob.job.id, activeNote.note);
        await refreshJobs();
        setExpandedJobId(null);
      } catch (err) {
        setError(String(err));
        setStatus("");
        await refreshJobs().catch(() => undefined);
      } finally {
        setResumingJobId(null);
      }
    },
    [loadUnlockedNotes, refreshJobs, runJobFromNote],
  );

  const handleReconcileJob = useCallback(
    async (job: SpendJobView) => {
      setReconcilingJobId(job.job.id);
      setError("");
      setStatus("Reconciling submitted private payment...");
      try {
        const latestJobs = await refreshJobs();
        const latestJob = latestJobs.find((item) => item.job.id === job.job.id) ?? job;
        if (latestJob.job.status === "completed") {
          setStatus("Payment job already completed.");
          setExpandedJobId(null);
          return;
        }
        if (!canReconcileSpendJob(latestJob)) {
          setStatus("Payment job is already progressing.");
          return;
        }
        await parseResponse<{ job: SpendJobView | null; reconciledStepId: string }>(
          await fetch(`/api/wallet/private/spend-jobs/${latestJob.job.id}/reconcile`, {
            method: "POST",
          }),
        );
        await refreshJobs();
        setStatus("Reconciliation completed.");
        setExpandedJobId(null);
      } catch (err) {
        setError(String(err));
        setStatus("");
        await refreshJobs().catch(() => undefined);
      } finally {
        setReconcilingJobId(null);
      }
    },
    [refreshJobs],
  );

  useEffect(() => {
    if (initialJobs !== undefined) {
      setJobs(initialJobs);
    }
    void refreshJobs();
  }, [initialJobs, refreshJobs]);

  useEffect(() => {
    return () => {
      if (jobRefreshTimer.current) {
        clearTimeout(jobRefreshTimer.current);
        jobRefreshTimer.current = null;
      }
    };
  }, []);

  useWalletRealtimeEvent(
    useCallback(
      (event) => {
        if (event.event === "stream_error") {
          setError(String(event.data.error ?? "Realtime stream error"));
          return;
        }
        const eventType = String(event.data.eventType ?? "");
        if (eventType.startsWith("spend_job_")) {
          scheduleJobsRefresh();
        }
      },
      [scheduleJobsRefresh],
    ),
  );

  const interruptedInteractiveJob = useMemo(
    () => jobs.find(isInteractiveSpendJobInFlight) ?? null,
    [jobs],
  );

  useEffect(() => {
    if (!interruptedInteractiveJob) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = PRIVATE_SPEND_UNLOAD_MESSAGE;
      return PRIVATE_SPEND_UNLOAD_MESSAGE;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [interruptedInteractiveJob]);

  const handleJobDetails = (job: SpendJobView) => {
    setExpandedJobId((current) => (current === job.job.id ? null : job.job.id));
  };

  const activityItems = useMemo(() => {
    return jobs.map((job) => {
      const progress = jobProgress(job);
      return {
        id: job.job.id,
        title: `${formatStellarUnits(job.job.totalAmountUnits, "USDC")} Spend`,
        subtitle: `${job.job.completedCount}/${job.job.totalRecipients} recipients paid (${progress}%)`,
        icon: (
          <div className="h-8 w-8 rounded-full bg-stone-100 text-stone-700 flex items-center justify-center font-bold text-xs uppercase shrink-0">
            {job.job.status === "completed" ? <Check size={14} className="text-emerald-600" /> : <Clock size={14} className="text-amber-600" />}
          </div>
        ),
        description: `Source commitment: ${shortHash(job.job.sourceCommitmentHex)}`,
        metadata: job.job.status.toUpperCase(),
        details: (
          <div className="pt-2">
            <ExpandedActivityRow
              busy={busy}
              handleReconcileJob={handleReconcileJob}
              handleResumeJob={handleResumeJob}
              job={job}
              resumingJobId={resumingJobId}
              reconcilingJobId={reconcilingJobId}
              onCollapse={() => {}}
            />
          </div>
        ),
      };
    });
  }, [jobs, busy, resumingJobId, reconcilingJobId, handleReconcileJob, handleResumeJob]);

  return (
    <div className="mx-auto max-w-6xl space-y-7 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-normal text-stone-500">
            Private activity
          </p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-stone-950">
            Shielded spend history
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            Track proving, relaying, mining, indexing, and stored change notes for every private spend.
          </p>
        </div>
        <button 
          onClick={() => {
            setRefreshing(true);
            refreshJobs().finally(() => setRefreshing(false));
          }} 
          className={`${secondaryButtonClass} rounded-xl transition-all active:scale-[0.98]`}
          disabled={busy}
          type="button"
        >
          {refreshing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span>Refreshing...</span>
            </>
          ) : (
            <span>Refresh</span>
          )}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {status && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{status}</span>
        </div>
      )}
      {interruptedInteractiveJob && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 w-[calc(100vw-32px)] max-w-[min(420px,calc(100vw-32px))] rounded-xl border border-stone-200 bg-white/95 p-4 shadow-xl shadow-stone-950/10 backdrop-blur-md"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-900 ring-1 ring-stone-200">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-stone-950">Private transaction in progress</p>
              <p className="mt-1 text-xs leading-5 text-stone-600">
                Keep this tab open until the active private spend finishes. Refresh is blocked to avoid interrupting the local proof flow.
              </p>
            </div>
          </div>
        </div>
      )}

      <section>
        {jobs.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl bg-stone-50/30 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-500">
              <Clock className="h-5 w-5" />
            </div>
            <h3 className="mt-5 text-base font-semibold text-stone-950">No private spends yet</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-stone-500">
              Private payment jobs will appear here with proof status, relayer state, and recovery actions.
            </p>
          </div>
        ) : (
          <ExpandableCard items={activityItems} className="px-0 py-1" variant="white" />
        )}
      </section>
    </div>
  );
}

function ExpandedActivityRow({
  busy,
  handleReconcileJob,
  handleResumeJob,
  job,
  onCollapse,
  resumingJobId,
  reconcilingJobId,
}: {
  busy: boolean;
  handleReconcileJob: (job: SpendJobView) => void;
  handleResumeJob: (job: SpendJobView) => void;
  job: SpendJobView;
  onCollapse: () => void;
  resumingJobId: string | null;
  reconcilingJobId: string | null;
}) {
  const progress = jobProgress(job);
  const canResume = canResumeSpendJob(job);
  const canReconcile = canReconcileSpendJob(job);

  return (
    <div className="w-full space-y-6 pt-2 pb-4 text-stone-700">
      {/* 1. PROGRESS BAR */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 font-sans block">Overall Progress</span>
        <div className="flex items-center justify-between text-xs font-semibold text-stone-900">
          <span>{job.job.completedCount} of {job.job.totalRecipients} recipients completed</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100 mt-1">
          <div className="h-full rounded-full bg-stone-900 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* 2. SHIELDED METADATA GRID */}
      <div className="space-y-2 pt-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 font-sans block">Shielded Metadata</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 text-xs">
          <div>
            <span className="text-[10px] font-semibold text-stone-400 block uppercase font-sans">Status</span>
            <span className={`inline-flex rounded-full border px-2.5 py-0.5 mt-1 font-medium capitalize text-[10px] ${jobTone(job.job.status)}`}>
              {titleCaseStatus(job.job.status)}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-stone-400 block uppercase font-sans">Created</span>
            <span className="text-stone-900 font-semibold block mt-1">{formatActivityDate(job.job.createdAt)}</span>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-stone-400 block uppercase font-sans">Updated</span>
            <span className="text-stone-900 font-semibold block mt-1">{formatActivityDate(job.job.updatedAt)}</span>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-stone-400 block uppercase font-sans">Remaining Balance</span>
            <span className="text-stone-900 font-mono font-semibold block mt-1">{formatStellarUnits(job.job.activeAmountUnits, "USDC")}</span>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-stone-400 block uppercase font-sans">Source Note</span>
            <span className="text-stone-600 font-mono block mt-1 break-all select-all">{shortHash(job.job.sourceCommitmentHex)}</span>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-stone-400 block uppercase font-sans">Active Note</span>
            <span className="text-stone-600 font-mono block mt-1 break-all select-all">{shortHash(job.job.activeCommitmentHex)}</span>
          </div>
          <div>
            <span className="text-[10px] font-semibold text-stone-400 block uppercase font-sans">Active Leaf</span>
            <span className="text-stone-900 font-semibold block mt-1">{job.job.activeLeafIndex === null ? "Pending" : job.job.activeLeafIndex}</span>
          </div>
          {job.job.retryAfter && (
            <div>
              <span className="text-[10px] font-semibold text-stone-400 block uppercase font-sans">Retry After</span>
              <span className="text-stone-900 font-semibold block mt-1">{formatActivityDate(job.job.retryAfter)}</span>
            </div>
          )}
          {job.job.errorClass && (
            <div className="col-span-2">
              <span className="text-[10px] font-semibold text-stone-400 block uppercase font-sans">Error Class</span>
              <span className="text-red-600 block mt-1 select-all break-all">{job.job.errorClass}</span>
            </div>
          )}
          {job.job.errorMessage && (
            <div className="col-span-2">
              <span className="text-[10px] font-semibold text-stone-400 block uppercase font-sans">Error Message</span>
              <span className="text-red-600 block mt-1 select-all break-all">{job.job.errorMessage}</span>
            </div>
          )}
        </div>
      </div>

      {/* 3. RECOVERY ACTIONS */}
      {(canResume || canReconcile) && (
        <div className="flex flex-col gap-3 rounded-xl bg-amber-50/50 p-4 border border-amber-200/40 sm:flex-row sm:items-center sm:justify-between mt-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="text-xs font-semibold text-amber-950">Recovery Action Available</p>
              <p className="mt-0.5 text-xs text-amber-600 leading-relaxed">
                Continue after the vault is unlocked and the active change note is available.
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {canResume && (
              <button className={`${primaryButtonClass} h-9 px-4 text-xs uppercase tracking-wider font-bold`} disabled={busy} onClick={() => void handleResumeJob(job)}>
                {resumingJobId === job.job.id ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    <span>Resuming...</span>
                  </>
                ) : (
                  <span>Resume Job</span>
                )}
              </button>
            )}
            {canReconcile && (
              <button className={`${primaryButtonClass} h-9 px-4 text-xs uppercase tracking-wider font-bold`} disabled={busy} onClick={() => void handleReconcileJob(job)}>
                {reconcilingJobId === job.job.id ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    <span>Reconciling...</span>
                  </>
                ) : (
                  <span>Reconcile</span>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4. RECIPIENT STEPS */}
      <div className="space-y-3 pt-4 border-t border-stone-100">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 font-sans">Recipient steps</span>
          <span className="text-xs font-medium text-stone-500 font-sans">
            {job.steps.length} step{job.steps.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="space-y-5">
          {job.steps.map((step) => (
            <article key={step.id} className="first:pt-0 pt-4 border-t border-stone-100/50">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400 font-sans">Recipient {step.ordinal}</p>
                  <p className="mt-0.5 break-all font-mono text-xs font-semibold text-stone-900 select-all">
                    {step.recipientAddress}
                  </p>
                </div>
                <div className="text-left sm:text-right shrink-0 ml-4">
                  <p className="font-mono text-sm font-semibold text-stone-950">
                    {formatStellarUnits(step.amountUnits, "USDC")}
                  </p>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-500 font-sans">
                    {titleCaseStatus(step.status)}
                  </p>
                </div>
              </div>

              {/* Step progress pills */}
              <div className="mt-3.5 grid grid-cols-5 gap-1.5" aria-label="Private spend progress">
                {spendJobStageItems.map((stage) => {
                  const state = spendJobStageState(step.status, stage);
                  return (
                    <div
                      key={stage.key}
                      className={`rounded-lg border px-1.5 py-1.5 text-center text-[10px] font-semibold ${spendJobStageTone(state)}`}
                    >
                      <div className={`mx-auto mb-1 h-1 w-1 rounded-full ${stageDotTone(state)}`} />
                      <div>{stage.label}</div>
                    </div>
                  );
                })}
              </div>

              {/* Step metadata grid (No borders!) */}
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-xs bg-stone-50/50 p-4 rounded-xl">
                <div>
                  <span className="text-[10px] font-semibold text-stone-400 block uppercase font-sans">Attempts</span>
                  <span className="text-stone-900 font-semibold block mt-0.5">{step.attempts}</span>
                </div>
                {step.txHash && (
                  <div>
                    <span className="text-[10px] font-semibold text-stone-400 block uppercase font-sans">Transaction Hash</span>
                    <span className="text-stone-600 font-mono block mt-0.5 break-all select-all">{shortHash(step.txHash)}</span>
                  </div>
                )}
                {step.outputCommitmentHex && (
                  <div>
                    <span className="text-[10px] font-semibold text-stone-400 block uppercase font-sans">Change Commitment</span>
                    <span className="text-stone-600 font-mono block mt-0.5 break-all select-all">{shortHash(step.outputCommitmentHex)}</span>
                  </div>
                )}
                {step.outputAmountUnits && (
                  <div>
                    <span className="text-[10px] font-semibold text-stone-400 block uppercase font-sans">Change Amount</span>
                    <span className="text-stone-900 font-mono block mt-0.5">
                      {formatStellarUnits(step.outputAmountUnits, "USDC")}
                    </span>
                  </div>
                )}
                {step.outputLeafIndex !== null && (
                  <div>
                    <span className="text-[10px] font-semibold text-stone-400 block uppercase font-sans">Output Leaf</span>
                    <span className="text-stone-900 font-semibold block mt-0.5">{step.outputLeafIndex}</span>
                  </div>
                )}
                {step.retryAfter && (
                  <div>
                    <span className="text-[10px] font-semibold text-stone-400 block uppercase font-sans">Retry After</span>
                    <span className="text-stone-900 font-semibold block mt-0.5">{formatActivityDate(step.retryAfter)}</span>
                  </div>
                )}
                {step.errorClass && (
                  <div className="col-span-2">
                    <span className="text-[10px] font-semibold text-stone-400 block uppercase font-sans">Error Class</span>
                    <span className="text-stone-900 font-semibold block mt-0.5 break-all select-all">{step.errorClass}</span>
                  </div>
                )}
              </div>

              {recoveryCopy(step) && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs font-semibold leading-relaxed text-amber-900">
                  {recoveryCopy(step)}
                </div>
              )}
              {step.errorMessage && (
                <div className="mt-2.5 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs leading-relaxed text-red-800 break-all select-all">
                  {step.errorMessage}
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ children, label, mono = false }: { children: ReactNode; label: string; mono?: boolean }) {
  return (
    <div className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[180px_minmax(0,1fr)]">
      <dt className="text-xs font-medium text-stone-500">{label}</dt>
      <dd className={`${mono ? "font-mono text-xs" : ""} min-w-0 break-all font-medium text-stone-900`}>
        {children}
      </dd>
    </div>
  );
}
