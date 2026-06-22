"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Clock3,
  Loader2,
  ShieldCheck,
  BarChart3,
  BriefcaseBusiness,
} from "lucide-react";

import TopHeader from "@/components/unified/TopHeader";

import {
  decimalToStellarUnits,
  formatStellarUnits,
} from "@/lib/publicWalletCore";
import {
  decryptPrivateNote,
  encryptPrivateNote,
  type EncryptedPrivateNotePayload,
  type PrivateNoteSecrets,
} from "@/lib/noteCrypto";
import {
  computeParimutuelPositionValue,
  computeParimutuelQuoteForNewStake,
} from "@/lib/marketQuoteCore";
import type { WalletSecrets } from "@/lib/vaultCrypto";

type MarketOutcome = "YES" | "NO";

type MarketView = {
  id: string;
  poolId: string;
  slug: string;
  title: string;
  category: string;
  status: string;
  closesAt: string | null;
  resolvesAt: string | null;
  rules: string;
  resolutionSource: string;
  yesTotalUnits: string;
  noTotalUnits: string;
  winningOutcome: MarketOutcome | null;
  poolStatus: string | null;
  poolActive: boolean;
  contractId: string | null;
  treeDepth: number | null;
  odds: {
    yesProbabilityBps: number;
    noProbabilityBps: number;
    yesMultipleBps: number | null;
    noMultipleBps: number | null;
  };
};

type MarketBetView = {
  id: string;
  marketSlug: string;
  outcome: MarketOutcome;
  amountUnits: string;
  status: string;
  txHash: string | null;
  createdAt: string | null;
};

type MarketPayoutView = {
  id: string;
  marketId: string;
  amountUnits: string;
  status: string;
  payoutCommitmentHex: string | null;
  encryptedNoteCiphertext: string | null;
  leafIndex: number | null;
  txHash: string | null;
};

type MarketUserNoteView = {
  id: string;
  poolId: string;
  commitmentHex: string;
  encryptedNoteCiphertext: string;
  amountUnits: string;
  leafIndex: number | null;
  status: string;
  source: string;
  txHash: string | null;
};

type MarketPortfolio = {
  notes: MarketUserNoteView[];
  bets: MarketBetView[];
  payouts: MarketPayoutView[];
};

export type MarketDetailPayload = {
  market: MarketView;
  portfolio: MarketPortfolio;
};

type MarketDetailPageProps = {
  accountEmail?: string | null;
  initialData?: MarketDetailPayload;
  previewMode?: boolean;
  slug: string;
  wallet: WalletSecrets;
};

type PreparedBet = {
  bet: MarketBetView;
  escrow: {
    status: "proof_ready" | "confirmed";
    relayBody?: unknown;
    escrowCommitmentHex?: string;
    escrowEncryptedNoteCiphertext?: string;
    changeNote?: PrivateNoteSecrets;
  };
};

type BetSubmitResult = {
  bet?: MarketBetView;
  escrow: {
    status: "confirmed";
    txHash: string;
    minedLedger: number | null;
    escrowLeafIndex: number | null;
    changeLeafIndex: number | null;
    indexingStatus: "indexed" | "pending_index" | "pending_mine";
    error?: string;
  };
};

const shellPanel =
  "min-w-0 w-full max-w-full overflow-hidden rounded-lg border border-stone-200/80 bg-[#fbfbfa]";
const compactButton =
  "inline-flex h-11 items-center justify-center rounded-lg px-4 text-xs font-bold uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-50";
const activeMarketBetStatuses = new Set([
  "pending",
  "submitted",
  "confirmed",
  "settled",
]);
const detailTabs = [
  "overview",
  "rules",
  "positions",
  "notes",
  "payouts",
] as const;

type DetailTab = (typeof detailTabs)[number];

function parseResponse<T>(response: Response): Promise<T> {
  return response.json().then((data) => {
    if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
    return data as T;
  });
}

function formatUsd(units: string) {
  return formatStellarUnits(units, "USDC");
}

function formatInputAmount(units: string) {
  return formatUsd(units).replace(/ USDC$/, "");
}

function formatProbability(bps: number) {
  return `${(bps / 100).toFixed(1)}%`;
}

function formatMultiple(bps: number | null) {
  return bps === null ? "--" : `${(bps / 10000).toFixed(2)}x`;
}

function shortHash(value?: string | null) {
  if (!value) return "pending";
  return value.length <= 16
    ? value
    : `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function marketVolume(market: MarketView) {
  return (
    BigInt(market.yesTotalUnits || "0") + BigInt(market.noTotalUnits || "0")
  ).toString();
}

function isMarketOpen(market: MarketView) {
  if (market.status !== "open") return false;
  if (!market.closesAt) return true;
  return new Date(market.closesAt).getTime() > Date.now();
}

function marketPositionQuote(bet: MarketBetView, market: MarketView) {
  const input = {
    stakeUnits: bet.amountUnits,
    outcome: bet.outcome,
    yesTotalUnits: market.yesTotalUnits,
    noTotalUnits: market.noTotalUnits,
  };
  try {
    if (bet.status === "pending" || bet.status === "submitted") {
      return computeParimutuelQuoteForNewStake(input);
    }
    return computeParimutuelPositionValue(input);
  } catch {
    return null;
  }
}

function activeNoteStatus(status: string) {
  return status === "unspent";
}

function spendableMarketNotes(notes: MarketUserNoteView[]) {
  return notes.filter(
    (note) => activeNoteStatus(note.status) && note.leafIndex !== null,
  );
}

function formatDate(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function detailSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
      <div className={`${shellPanel} p-6`}>
        <div className="h-4 w-28 rounded-full bg-stone-100" />
        <div className="mt-5 h-10 w-4/5 rounded bg-stone-100" />
        <div className="mt-6 h-28 rounded bg-stone-100" />
      </div>
      <div className={`${shellPanel} p-6`}>
        <div className="h-4 w-32 rounded-full bg-stone-100" />
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="h-24 rounded bg-stone-100" />
          <div className="h-24 rounded bg-stone-100" />
        </div>
        <div className="mt-5 h-12 rounded bg-stone-100" />
      </div>
    </div>
  );
}

function noteSerial(commitmentHex: string) {
  return (
    commitmentHex.replace(/^0x/, "").slice(0, 6).toUpperCase() || "PENDING"
  );
}

function splitCurrencyLabel(value: string) {
  const [amount, ...symbolParts] = value.split(" ");
  return { amount, symbol: symbolParts.join(" ") || "USDC" };
}

function MarketDetailMetricCard({
  detail,
  label,
  tone,
  value,
}: {
  detail: string;
  label: string;
  tone: "volume" | "date" | "notes";
  value: string;
}) {
  const { amount, symbol } =
    tone === "date" ? { amount: value, symbol: "" } : splitCurrencyLabel(value);
  const toneClass =
    tone === "notes"
      ? "border-[oklch(80%_0.035_88)] bg-[oklch(96%_0.018_90)] text-[oklch(29%_0.05_78)] [background-image:radial-gradient(circle_at_85%_18%,oklch(76%_0.055_92/.22),transparent_30%),linear-gradient(90deg,oklch(54%_0.032_86/.08)_1px,transparent_1px)]"
      : tone === "volume"
        ? "border-[oklch(83%_0.035_150)] bg-[oklch(96.5%_0.016_150)] text-[oklch(30%_0.052_154)] [background-image:radial-gradient(circle_at_82%_20%,oklch(70%_0.055_154/.16),transparent_32%),linear-gradient(90deg,oklch(52%_0.045_154/.07)_1px,transparent_1px)]"
        : "border-[oklch(84%_0.012_78)] bg-[oklch(97%_0.006_78)] text-[oklch(29%_0.018_78)] [background-image:radial-gradient(circle_at_84%_18%,oklch(72%_0.018_78/.20),transparent_30%),linear-gradient(90deg,oklch(45%_0.012_78/.07)_1px,transparent_1px)]";

  return (
    <article
      className={`relative min-h-[112px] overflow-hidden rounded-lg border p-4 shadow-[0_14px_32px_oklch(32%_0.018_78/.05)] ${toneClass} [background-size:100%_100%,18px_18px]`}
    >
      <div className="relative flex h-full flex-col justify-between gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-normal opacity-70">
            {label}
          </p>
          <div className="mt-2 flex min-w-0 flex-wrap items-end gap-1.5">
            <span
              className={`break-words ${
                tone === "date"
                  ? "text-lg font-semibold leading-tight"
                  : "font-mono text-2xl font-semibold leading-none"
              }`}
            >
              {amount}
            </span>
            {symbol && (
              <span className="pb-0.5 text-xs font-semibold opacity-70">
                {symbol}
              </span>
            )}
          </div>
        </div>
        <p className="border-t border-current/15 pt-2 text-[10px] font-medium leading-4 opacity-72">
          {detail}
        </p>
      </div>
    </article>
  );
}

function MarketNoteAssetCard({ note }: { note: MarketUserNoteView }) {
  const { amount } = splitCurrencyLabel(formatUsd(note.amountUnits));

  return (
    <article className="market-note-card relative min-h-[124px] overflow-hidden rounded-lg border border-[oklch(73%_0.034_88)] bg-[oklch(96%_0.018_90)] p-4 text-[oklch(28%_0.052_82)] shadow-[0_12px_28px_oklch(34%_0.03_82/.06)]">
      <div className="pointer-events-none absolute inset-0 opacity-80 [background-image:radial-gradient(ellipse_at_50%_46%,oklch(74%_0.042_145/.20),transparent_44%),repeating-linear-gradient(100deg,transparent_0_14px,oklch(54%_0.038_142/.12)_14px_15px)]" />
      <div className="pointer-events-none absolute inset-3 rounded-[0.72rem] border border-[oklch(68%_0.034_88/.72)]" />
      <div className="relative flex h-full flex-col justify-between gap-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-normal text-[oklch(42%_0.045_82)]">
              Market note
            </p>
            <div className="mt-2 flex items-end gap-1.5">
              <span className="font-mono text-3xl font-semibold leading-none text-[oklch(27%_0.055_82)]">
                {amount}
              </span>
              <span className="pb-1 text-xs font-semibold text-[oklch(42%_0.05_148)]">
                USDC
              </span>
            </div>
          </div>
          <span className="rounded-md border border-[oklch(77%_0.03_88)] bg-[oklch(97%_0.012_88/.78)] px-2.5 py-1 font-mono text-[9px] font-bold uppercase text-[oklch(35%_0.04_80)] shadow-sm">
            MN {noteSerial(note.commitmentHex)}
          </span>
        </div>
        <div className="flex items-end justify-between gap-4 border-t border-[oklch(78%_0.024_88/.58)] pt-2">
          <div className="min-w-0">
            <p className="text-[8px] font-semibold uppercase tracking-normal text-[oklch(46%_0.04_86)]">
              Commitment
            </p>
            <p className="mt-0.5 truncate font-mono text-[10px] font-bold text-[oklch(32%_0.045_78)]">
              {shortHash(note.commitmentHex)}
            </p>
            <p className="mt-0.5 font-mono text-[8px] font-semibold text-[oklch(39%_0.04_80/.78)]">
              Leaf {note.leafIndex ?? "Pending"}
            </p>
          </div>
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-normal text-[oklch(36%_0.06_150)]">
            {note.source}
          </span>
        </div>
      </div>
    </article>
  );
}

function outcomeTone(outcome: MarketOutcome, active: boolean) {
  if (outcome === "YES") {
    return active
      ? "bg-stone-950 text-[#fbfbfa] shadow-sm"
      : "bg-transparent text-stone-500 hover:bg-white hover:text-stone-950";
  }
  return active
    ? "bg-stone-950 text-[#fbfbfa] shadow-sm"
    : "bg-transparent text-stone-500 hover:bg-white hover:text-stone-950";
}

export default function MarketDetailPage({
  accountEmail,
  initialData,
  previewMode = false,
  slug,
  wallet,
}: MarketDetailPageProps) {
  const initialPortfolio = initialData?.portfolio ?? {
    notes: [],
    bets: [],
    payouts: [],
  };
  const router = useRouter();
  const initialSelectedNoteId =
    spendableMarketNotes(initialPortfolio.notes)[0]?.id ?? "";
  const [market, setMarket] = useState<MarketView | null>(
    initialData?.market ?? null,
  );
  const [portfolio, setPortfolio] = useState<MarketPortfolio>(initialPortfolio);
  const [selectedOutcome, setSelectedOutcome] = useState<MarketOutcome>("YES");
  const [selectedNoteId, setSelectedNoteId] = useState(initialSelectedNoteId);
  const [amount, setAmount] = useState("1");
  const [loading, setLoading] = useState(!initialData);
  const [submitting, setSubmitting] = useState(false);
  const [claimingPayoutId, setClaimingPayoutId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");

  const activeNotes = useMemo(
    () => spendableMarketNotes(portfolio.notes),
    [portfolio.notes],
  );
  const selectedNote = useMemo(
    () =>
      activeNotes.find((item) => item.id === selectedNoteId) ??
      activeNotes[0] ??
      null,
    [activeNotes, selectedNoteId],
  );
  const marketBets = useMemo(
    () =>
      portfolio.bets.filter(
        (bet) =>
          bet.marketSlug === slug &&
          [...activeMarketBetStatuses].includes(bet.status),
      ),
    [portfolio.bets, slug],
  );
  const marketPayouts = useMemo(
    () =>
      portfolio.payouts.filter(
        (payout) => !market || payout.marketId === market.id,
      ),
    [market, portfolio.payouts],
  );

  const loadMarket = async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await parseResponse<MarketDetailPayload>(
        await fetch(`/api/markets/${encodeURIComponent(slug)}`, {
          cache: "no-store",
        }),
      );
      const spendableNotes = spendableMarketNotes(
        payload.portfolio.notes ?? [],
      );
      setMarket(payload.market);
      setPortfolio(payload.portfolio);
      setSelectedNoteId((current) => current || spendableNotes[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (previewMode) return;
    void loadMarket();
    // Initial market detail bootstrap only; user can navigate back for another market.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode, slug]);

  const submitBet = async () => {
    if (!market) return;
    if (!selectedNote) {
      setError(
        "Deposit into Market Notes from Portfolio before placing a bet.",
      );
      return;
    }
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const amountUnits = decimalToStellarUnits(amount);
      if (!selectedNote.encryptedNoteCiphertext) {
        throw new Error(
          "Selected market note is missing encrypted spend material.",
        );
      }
      const sourceNote = await decryptPrivateNote(
        JSON.parse(
          selectedNote.encryptedNoteCiphertext,
        ) as EncryptedPrivateNotePayload,
        wallet,
      );
      if (sourceNote.leafIndex === null) {
        throw new Error("Selected market note is not indexed yet.");
      }
      if (sourceNote.commitmentHex !== selectedNote.commitmentHex) {
        throw new Error(
          "Selected market note does not match its encrypted note payload.",
        );
      }

      setMessage("Preparing private market escrow proof...");
      const idempotencyKey =
        globalThis.crypto?.randomUUID?.() ??
        `${slug}:${selectedOutcome}:${Date.now()}`;
      const prepared = await parseResponse<PreparedBet>(
        await fetch(`/api/markets/${encodeURIComponent(slug)}/bets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: "prepare",
            outcome: selectedOutcome,
            amountUnits,
            noteId: selectedNote.id,
            inputCommitmentHex: selectedNote.commitmentHex,
            idempotencyKey,
            notePrivateKeyHex: wallet.bn254NotePrivateKeyHex,
            senderEncryptionPublicHex: wallet.x25519PublicHex,
            membershipBlindingHex: wallet.membershipBlindingHex,
            noteBlindingHex: sourceNote.blindingHex,
            noteAmountUnits: sourceNote.amountUnits,
            noteLeafIndex: sourceNote.leafIndex,
          }),
        }),
      );
      if (
        prepared.escrow.status !== "proof_ready" ||
        !prepared.escrow.relayBody ||
        !prepared.escrow.escrowCommitmentHex ||
        !prepared.escrow.escrowEncryptedNoteCiphertext
      ) {
        throw new Error("Market escrow proof was not prepared.");
      }

      const changeNote =
        prepared.escrow.changeNote &&
        BigInt(prepared.escrow.changeNote.amountUnits || "0") > BigInt(0)
          ? prepared.escrow.changeNote
          : null;
      const encryptedChangeNoteCiphertext = changeNote
        ? JSON.stringify(await encryptPrivateNote(changeNote, wallet))
        : null;

      setMessage("Submitting private market escrow...");
      let submitted = await parseResponse<BetSubmitResult>(
        await fetch(`/api/markets/${encodeURIComponent(slug)}/bets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: "submit",
            betId: prepared.bet.id,
            relayBody: prepared.escrow.relayBody,
            escrowCommitmentHex: prepared.escrow.escrowCommitmentHex,
            escrowEncryptedNoteCiphertext:
              prepared.escrow.escrowEncryptedNoteCiphertext,
            changeCommitmentHex: changeNote?.commitmentHex ?? null,
            changeAmountUnits: changeNote?.amountUnits ?? null,
            encryptedChangeNoteCiphertext,
          }),
        }),
      );
      if (submitted.escrow.indexingStatus !== "indexed") {
        setMessage("Market escrow submitted. Confirming note indexes...");
        submitted = await parseResponse<BetSubmitResult>(
          await fetch(`/api/markets/${encodeURIComponent(slug)}/bets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              intent: "finalize",
              betId: prepared.bet.id,
              txHash: submitted.escrow.txHash,
              minedLedger: submitted.escrow.minedLedger,
              escrowCommitmentHex: prepared.escrow.escrowCommitmentHex,
              escrowEncryptedNoteCiphertext:
                prepared.escrow.escrowEncryptedNoteCiphertext,
              changeCommitmentHex: changeNote?.commitmentHex ?? null,
              changeAmountUnits: changeNote?.amountUnits ?? null,
              encryptedChangeNoteCiphertext,
            }),
          }),
        );
      }

      if (submitted.escrow.indexingStatus !== "indexed") {
        setPortfolio((current) => ({
          ...current,
          notes: current.notes.map((note) =>
            note.id === selectedNote.id
              ? { ...note, status: "pending_bet" }
              : note,
          ),
          bets: [prepared.bet, ...current.bets],
        }));
        setSelectedNoteId("");
        setMessage(
          submitted.escrow.indexingStatus === "pending_mine"
            ? `Market escrow submitted as ${shortHash(submitted.escrow.txHash)}. Waiting for mining confirmation.`
            : `Market escrow submitted as ${shortHash(submitted.escrow.txHash)}. Note indexing is still catching up.`,
        );
        return;
      }

      const confirmedBet = submitted.bet ?? prepared.bet;
      setPortfolio((current) => ({
        ...current,
        notes: [
          ...(changeNote && submitted.escrow.changeLeafIndex !== null
            ? [
                {
                  id: `market-change-${changeNote.commitmentHex}`,
                  poolId: selectedNote.poolId,
                  commitmentHex: changeNote.commitmentHex,
                  encryptedNoteCiphertext: encryptedChangeNoteCiphertext ?? "",
                  amountUnits: changeNote.amountUnits,
                  leafIndex: submitted.escrow.changeLeafIndex,
                  status: "unspent",
                  source: "change",
                  txHash: submitted.escrow.txHash,
                },
              ]
            : []),
          ...current.notes.map((note) =>
            note.id === selectedNote.id
              ? { ...note, status: "escrowed" }
              : note,
          ),
        ],
        bets: [
          confirmedBet,
          ...current.bets.filter((bet) => bet.id !== confirmedBet.id),
        ],
      }));
      setSelectedNoteId("");
      setMessage("Market bet confirmed in private escrow.");
      void loadMarket();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const claimMarketPayout = async (payout: MarketPayoutView) => {
    if (
      !payout.payoutCommitmentHex ||
      !payout.encryptedNoteCiphertext ||
      payout.leafIndex === null
    ) {
      setError("Payout output is not indexed yet.");
      return;
    }
    setClaimingPayoutId(payout.id);
    setError("");
    setMessage("");
    try {
      const payload = await parseResponse<{
        payout: MarketPayoutView;
        note: MarketUserNoteView;
      }>(
        await fetch(
          `/api/markets/payouts/${encodeURIComponent(payout.id)}/claim`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              commitmentHex: payout.payoutCommitmentHex,
              encryptedNoteCiphertext: payout.encryptedNoteCiphertext,
            }),
          },
        ),
      );
      const payoutNote: MarketUserNoteView = {
        ...payload.note,
        source: "payout",
        status: "unspent",
      };
      setPortfolio((current) => ({
        ...current,
        payouts: current.payouts.map((item) =>
          item.id === payout.id ? payload.payout : item,
        ),
        notes: [
          payoutNote,
          ...current.notes.filter((note) => note.id !== payoutNote.id),
        ],
      }));
      setSelectedNoteId(payoutNote.id);
      setMessage("Payout claimed into a spendable market note.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setClaimingPayoutId("");
    }
  };

  const totalMarketBalance = activeNotes
    .reduce((total, item) => total + BigInt(item.amountUnits || "0"), BigInt(0))
    .toString();
  const hasAmount = amount.trim().length > 0 && Number(amount) > 0;
  const selectedAmountUnits = useMemo(() => {
    try {
      return decimalToStellarUnits(amount);
    } catch {
      return "";
    }
  }, [amount]);
  const selectedAmountExceedsNote = Boolean(
    selectedNote &&
    selectedAmountUnits &&
    BigInt(selectedAmountUnits) > BigInt(selectedNote.amountUnits || "0"),
  );
  const selectedQuote = useMemo(() => {
    if (!market || !hasAmount || !selectedAmountUnits) return null;
    try {
      return computeParimutuelQuoteForNewStake({
        stakeUnits: selectedAmountUnits,
        outcome: selectedOutcome,
        yesTotalUnits: market.yesTotalUnits,
        noTotalUnits: market.noTotalUnits,
      });
    } catch {
      return null;
    }
  }, [hasAmount, market, selectedAmountUnits, selectedOutcome]);
  const selectedMultipleBps = selectedQuote?.multipleBps ?? null;
  const projectedPayout = selectedQuote
    ? formatUsd(selectedQuote.payoutUnits)
    : "--";
  const canSubmit = Boolean(
    market?.poolActive &&
    isMarketOpen(market) &&
    selectedNote &&
    hasAmount &&
    !selectedAmountExceedsNote,
  );
  const disabledReason = !market
    ? "Market unavailable"
    : !isMarketOpen(market)
      ? "Market is closed"
      : !market.poolActive
        ? "Market pool contract pending"
        : !selectedNote
          ? "Deposit from Portfolio to get Market Notes"
          : !hasAmount
            ? "Enter an amount"
            : selectedAmountExceedsNote
              ? "Amount exceeds selected Market Note"
              : "";

  return (
    <div className="flex h-screen w-screen flex-col md:flex-row overflow-hidden bg-stone-50 font-sans text-stone-950">
      {/* Sidebar */}
      <aside className="fixed bottom-0 left-0 top-0 hidden md:flex flex-col border-r border-stone-200 bg-stone-50/60 backdrop-blur-xl z-40 w-14 hover:w-52 transition-[width] duration-200 ease-in-out overflow-hidden group">
        {/* Header / Brand */}
        <div className="flex h-16 items-center shrink-0 px-4 overflow-hidden">
          <span className="block group-hover:hidden mx-auto text-lg font-bold tracking-tighter text-stone-950 select-none">
            V
          </span>
          <span className="hidden group-hover:block text-3xl font-bold tracking-tighter text-stone-950 select-none whitespace-nowrap animate-in fade-in duration-150">
            VEIL
          </span>
        </div>

        {/* Navigation */}
        <nav className="mt-4 flex flex-1 flex-col gap-0.5 px-2">
          <button
            onClick={() => router.push("/market?view=markets")}
            type="button"
            title="Markets"
            className="relative flex h-10 w-full items-center rounded-lg transition-all text-sm font-medium overflow-hidden px-3 bg-white text-stone-950 shadow-sm ring-1 ring-stone-200"
          >
            <BarChart3 className="h-4 w-4 shrink-0 text-stone-950" />
            <span className="ml-3 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 animate-in fade-in">
              Markets
            </span>
          </button>

          <button
            onClick={() => router.push("/market?view=portfolio")}
            type="button"
            title="Portfolio"
            className="relative flex h-10 w-full items-center rounded-lg transition-all text-sm font-medium overflow-hidden px-3 text-stone-600 hover:bg-stone-100/60 hover:text-stone-900"
          >
            <BriefcaseBusiness className="h-4 w-4 shrink-0 text-stone-500" />
            <span className="ml-3 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 animate-in fade-in">
              Portfolio
            </span>
          </button>

        </nav>

        {/* Network Status Footer */}
        <div className="p-3 shrink-0 border-t border-stone-200/40 overflow-hidden">
          <div className="flex justify-center group-hover:hidden">
            <div
              className="h-2 w-2 rounded-full bg-emerald-500"
              title="Stellar Testnet Connected"
            />
          </div>
          <div className="hidden group-hover:block animate-in fade-in duration-150">
            <p className="text-[9px] font-bold uppercase tracking-wider text-stone-400">
              Network
            </p>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <p className="text-xs font-semibold text-stone-900 whitespace-nowrap">
                Stellar Testnet
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Content Area */}
      <div className="flex flex-1 flex-col h-full overflow-hidden md:ml-14">
        <TopHeader
          mode="markets"
          onChangeMode={(newMode) => {
            if (newMode === "public") router.push("/wallet?mode=public");
            else if (newMode === "private") router.push("/wallet?mode=private");
          }}
          title={market?.category ?? "Market"}
          accountEmail={accountEmail}
          initialNotifications={[]}
        />

        <main className="flex-1 overflow-y-auto no-scrollbar p-4 md:p-6 pb-24 md:pb-6">
          <div className="mx-auto flex w-full max-w-[1380px] min-w-0 flex-col gap-6">
            <header className="flex items-center gap-4 border-b border-stone-200/80 pb-5">
              <Link
                aria-label="Back to markets"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-stone-200/80 bg-white text-stone-600 transition hover:bg-stone-50 hover:text-stone-950"
                href="/market"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">
                  VEIL Markets
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-950">
                  {market?.category ?? "Market"}
                </h1>
              </div>
            </header>

            <section className="min-w-0 max-w-full flex-1 overflow-x-hidden py-5">
              {loading ? (
                detailSkeleton()
              ) : !market ? (
                <div className={`${shellPanel} p-10 text-center`}>
                  <p className="text-lg font-bold">Market not found</p>
                  <Link
                    className="mt-5 inline-flex text-sm font-bold text-stone-600 underline"
                    href="/market"
                  >
                    Return to markets
                  </Link>
                </div>
              ) : (
                <div className="grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-7 overflow-x-hidden lg:grid-cols-[minmax(0,1fr)_390px]">
                  <div className="flex min-w-0 max-w-full flex-col gap-6 overflow-x-hidden">
                    <section className="min-w-0 border-b border-stone-200/80 pb-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">
                          {market.category}
                        </span>
                        <span className="h-1 w-1 rounded-full bg-stone-300" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-700">
                          {isMarketOpen(market) ? "Open" : market.status}
                        </span>
                      </div>
                      <h2 className="mt-5 max-w-4xl break-words text-3xl font-bold leading-tight tracking-tight text-stone-950 [overflow-wrap:anywhere] md:text-4xl">
                        {market.title}
                      </h2>
                      <div className="market-detail-balance-strip mt-6 grid gap-3.5 sm:grid-cols-3">
                        <MarketDetailMetricCard
                          detail="Committed across both outcomes"
                          label="Volume"
                          tone="volume"
                          value={formatUsd(marketVolume(market))}
                        />
                        <MarketDetailMetricCard
                          detail="Betting closes on this book"
                          label="Closes"
                          tone="date"
                          value={formatDate(market.closesAt)}
                        />
                        <MarketDetailMetricCard
                          detail="Spendable private balance"
                          label="Market Notes"
                          tone="notes"
                          value={formatUsd(totalMarketBalance)}
                        />
                      </div>
                    </section>

                    <div className="relative grid h-10 max-w-full grid-cols-5 items-center rounded-full bg-stone-100/60 p-1">
                      {detailTabs.map((tab) => (
                        <button
                          key={tab}
                          aria-pressed={detailTab === tab}
                          className={`relative flex h-full min-w-0 items-center justify-center rounded-full px-1 text-[11px] font-bold transition sm:px-4 sm:text-xs ${
                            detailTab === tab
                              ? "bg-white text-stone-950 shadow-sm"
                              : "text-stone-500 hover:text-stone-950"
                          }`}
                          onClick={() => setDetailTab(tab)}
                          type="button"
                        >
                          <span className="truncate">
                            {tab === "overview"
                              ? "Overview"
                              : tab === "rules"
                                ? "Rules"
                                : tab === "positions"
                                  ? "Positions"
                                  : tab === "notes"
                                    ? "Notes"
                                    : "Payouts"}
                          </span>
                        </button>
                      ))}
                    </div>

                    <section className="min-h-[260px]">
                      {detailTab === "overview" && (
                        <div className="grid gap-6 md:grid-cols-2">
                          <div className="border-y border-stone-200/80 py-5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                              Outcome pricing
                            </p>
                            <div className="mt-5 space-y-4">
                              <div className="flex items-center justify-between gap-4">
                                <span className="inline-flex items-center gap-2 text-sm font-bold text-stone-950">
                                  <ArrowUpRight className="h-4 w-4" />
                                  YES
                                </span>
                                <span className="text-right">
                                  <span className="block text-xl font-bold text-stone-950">
                                    {formatProbability(
                                      market.odds.yesProbabilityBps,
                                    )}
                                  </span>
                                  <span className="block text-xs font-bold text-stone-500">
                                    {formatMultiple(market.odds.yesMultipleBps)}
                                  </span>
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-4 border-t border-stone-200/80 pt-4">
                                <span className="inline-flex items-center gap-2 text-sm font-bold text-stone-950">
                                  <ArrowDownRight className="h-4 w-4" />
                                  NO
                                </span>
                                <span className="text-right">
                                  <span className="block text-xl font-bold text-stone-950">
                                    {formatProbability(
                                      market.odds.noProbabilityBps,
                                    )}
                                  </span>
                                  <span className="block text-xs font-bold text-stone-500">
                                    {formatMultiple(market.odds.noMultipleBps)}
                                  </span>
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="border-y border-stone-200/80 py-5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                              Resolution
                            </p>
                            <p className="mt-3 text-sm font-semibold leading-6 text-stone-650">
                              Resolves {formatDate(market.resolvesAt)} from the
                              published source.
                            </p>
                            <p className="mt-4 break-words text-sm leading-6 text-stone-600 [overflow-wrap:anywhere]">
                              {market.resolutionSource}
                            </p>
                          </div>
                        </div>
                      )}

                      {detailTab === "rules" && (
                        <div className="grid gap-6 md:grid-cols-2">
                          <div className="border-y border-stone-200/80 py-5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                              Rules
                            </p>
                            <p className="mt-3 break-words text-sm leading-6 text-stone-700 [overflow-wrap:anywhere]">
                              {market.rules}
                            </p>
                          </div>
                          <div className="border-y border-stone-200/80 py-5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                              Resolution source
                            </p>
                            <p className="mt-3 break-words text-sm leading-6 text-stone-700 [overflow-wrap:anywhere]">
                              {market.resolutionSource}
                            </p>
                            <p className="mt-4 text-xs font-bold text-stone-500">
                              Resolves {formatDate(market.resolvesAt)}
                            </p>
                          </div>
                        </div>
                      )}

                      {detailTab === "positions" && (
                        <div className="border-y border-stone-200/80">
                          {marketBets.length === 0 ? (
                            <div className="py-12 text-center">
                              <p className="text-sm font-bold text-stone-950">
                                No positions yet
                              </p>
                              <p className="mt-2 text-sm text-stone-500">
                                Use the action panel to open a private position.
                              </p>
                            </div>
                          ) : (
                            <div className="divide-y divide-stone-200/80">
                              {marketBets.map((bet) => {
                                const quote = marketPositionQuote(bet, market);
                                const pending =
                                  bet.status === "pending" ||
                                  bet.status === "submitted";
                                return (
                                  <div
                                    key={bet.id}
                                    className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(120px,auto)_minmax(130px,auto)] sm:items-center"
                                  >
                                    <span>
                                      <span className="block text-sm font-bold text-stone-950">
                                        {bet.outcome}
                                      </span>
                                      <span className="mt-1 block text-xs font-semibold text-stone-500">
                                        {bet.status}{" "}
                                        {bet.txHash
                                          ? `, ${shortHash(bet.txHash)}`
                                          : ""}
                                      </span>
                                    </span>
                                    <span className="text-left sm:text-right">
                                      <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">
                                        Stake
                                      </span>
                                      <span className="mt-1 block text-sm font-bold text-stone-900">
                                        {formatUsd(bet.amountUnits)}
                                      </span>
                                    </span>
                                    <span className="text-left sm:text-right">
                                      <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">
                                        {pending
                                          ? "Projected payout"
                                          : "Current payout"}
                                      </span>
                                      <span className="mt-1 block text-sm font-bold text-stone-950">
                                        {quote
                                          ? formatUsd(quote.payoutUnits)
                                          : "--"}
                                      </span>
                                      <span className="mt-0.5 block text-xs font-bold text-stone-500">
                                        {formatMultiple(
                                          quote?.multipleBps ?? null,
                                        )}
                                      </span>
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {detailTab === "notes" && (
                        <div className="market-note-card-grid">
                          {activeNotes.length === 0 ? (
                            <div className="py-12 text-center">
                              <p className="text-sm font-bold text-stone-950">
                                No spendable Market Notes.
                              </p>
                              <Link
                                className="mt-2 inline-flex text-xs font-bold text-stone-950 underline decoration-stone-300 underline-offset-4 transition hover:decoration-stone-950"
                                href="/market?view=portfolio&tab=notes"
                              >
                                Deposit Market Notes in Portfolio
                              </Link>
                            </div>
                          ) : (
                            <div className="grid gap-3 sm:grid-cols-2">
                              {activeNotes.map((note) => (
                                <MarketNoteAssetCard
                                  key={note.id}
                                  note={note}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {detailTab === "payouts" && (
                        <div className="border-y border-stone-200/80">
                          {marketPayouts.length === 0 ? (
                            <div className="py-12 text-center">
                              <p className="text-sm font-bold text-stone-950">
                                No payouts yet
                              </p>
                              <p className="mt-2 text-sm text-stone-500">
                                Payouts appear after this market resolves.
                              </p>
                            </div>
                          ) : (
                            <div className="divide-y divide-stone-200/80">
                              {marketPayouts.map((payout) => {
                                const ready =
                                  payout.status === "confirmed" &&
                                  Boolean(payout.payoutCommitmentHex) &&
                                  Boolean(payout.encryptedNoteCiphertext) &&
                                  payout.leafIndex !== null;
                                const claimed = payout.status === "claimed";
                                return (
                                  <div
                                    key={payout.id}
                                    className="flex items-center justify-between gap-4 py-4"
                                  >
                                    <span>
                                      <span className="block text-sm font-bold text-stone-950">
                                        {formatUsd(payout.amountUnits)}
                                      </span>
                                      <span className="mt-1 block text-xs font-semibold text-stone-500">
                                        {payout.status}{" "}
                                        {payout.txHash
                                          ? `, ${shortHash(payout.txHash)}`
                                          : ""}
                                      </span>
                                    </span>
                                    {claimed ? (
                                      <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                                        Claimed
                                      </span>
                                    ) : ready ? (
                                      <button
                                        className="rounded-full bg-stone-950 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white transition hover:bg-stone-800 disabled:opacity-60"
                                        disabled={
                                          claimingPayoutId === payout.id
                                        }
                                        onClick={() =>
                                          void claimMarketPayout(payout)
                                        }
                                        type="button"
                                      >
                                        {claimingPayoutId === payout.id
                                          ? "Claiming"
                                          : "Claim payout"}
                                      </button>
                                    ) : (
                                      <span className="rounded-full bg-stone-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
                                        Awaiting payout note
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  </div>

                  <aside className="market-action-panel flex min-w-0 max-w-full flex-col overflow-x-hidden lg:sticky lg:top-5 lg:self-start">
                    <div
                      id="market-bet-panel"
                      className="scroll-mt-5 border-y border-stone-200/80 py-5 md:py-6"
                    >
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                          Trade ticket
                        </p>
                        <h3 className="mt-1 text-2xl font-bold tracking-tight text-stone-950">
                          Place private bet
                        </h3>
                        <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">
                          Spend one Market Note and keep any change private.
                        </p>
                      </div>

                      <div
                        className="mt-5 relative grid grid-cols-2 rounded-full bg-stone-100/60 p-1"
                        role="group"
                        aria-label="Select outcome"
                      >
                        {(["YES", "NO"] as const).map((outcome) => {
                          const active = selectedOutcome === outcome;
                          return (
                            <button
                              key={outcome}
                              className={`h-10 rounded-full px-4 text-xs font-bold transition ${outcomeTone(outcome, active)}`}
                              onClick={() => setSelectedOutcome(outcome)}
                              type="button"
                            >
                              {outcome}{" "}
                              {formatProbability(
                                outcome === "YES"
                                  ? market.odds.yesProbabilityBps
                                  : market.odds.noProbabilityBps,
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-6 space-y-5">
                        <label className="block">
                          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                            Market note
                          </span>
                          <select
                            className="mt-2 h-11 w-full min-w-0 border-b border-stone-200 bg-transparent px-1 text-sm font-bold text-stone-900 outline-none transition focus:border-stone-900"
                            onChange={(event) =>
                              setSelectedNoteId(event.target.value)
                            }
                            value={selectedNote?.id ?? ""}
                          >
                            {activeNotes.length === 0 ? (
                              <option value="">
                                No spendable market notes
                              </option>
                            ) : (
                              activeNotes.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {formatUsd(item.amountUnits)} -{" "}
                                  {shortHash(item.commitmentHex)}
                                </option>
                              ))
                            )}
                          </select>
                        </label>

                        <label className="block">
                          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                            Amount
                          </span>
                          <input
                            className="mt-2 h-12 w-full min-w-0 border-b border-stone-200 bg-transparent px-1 text-base font-bold text-stone-950 outline-none transition focus:border-stone-900"
                            min="0.0000001"
                            onChange={(event) => setAmount(event.target.value)}
                            step="0.0000001"
                            type="number"
                            value={amount}
                          />
                        </label>

                        <div className="grid grid-cols-4 gap-2">
                          {["1", "5", "10"].map((quickAmount) => (
                            <button
                              key={quickAmount}
                              className="h-9 rounded-xl bg-stone-100/60 text-xs font-bold text-stone-600 transition hover:bg-stone-100 hover:text-stone-950"
                              onClick={() => setAmount(quickAmount)}
                              type="button"
                            >
                              {quickAmount}
                            </button>
                          ))}
                          <button
                            className="h-9 rounded-xl bg-stone-100/60 text-xs font-bold text-stone-600 transition hover:bg-stone-100 hover:text-stone-950 disabled:opacity-50"
                            disabled={!selectedNote}
                            onClick={() =>
                              selectedNote &&
                              setAmount(
                                formatInputAmount(selectedNote.amountUnits),
                              )
                            }
                            type="button"
                          >
                            Use max
                          </button>
                        </div>

                        {selectedAmountExceedsNote && (
                          <p className="text-xs font-bold text-red-600">
                            Amount is higher than the selected Market Note.
                          </p>
                        )}

                        {activeNotes.length === 0 && (
                          <Link
                            className="inline-flex text-xs font-bold text-stone-950 underline decoration-stone-300 underline-offset-4 transition hover:decoration-stone-950"
                            href="/market?view=portfolio&tab=notes"
                          >
                            Deposit Market Notes in Portfolio
                          </Link>
                        )}
                      </div>

                      <div className="mt-6 space-y-3 border-y border-stone-200/80 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                            Projected payout
                          </span>
                          <span className="text-sm font-bold text-stone-950">
                            {projectedPayout}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-xs font-bold text-stone-500">
                          <span>{selectedOutcome} accepted quote</span>
                          <span>{formatMultiple(selectedMultipleBps)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-xs font-bold text-stone-500">
                          <span>Selected note</span>
                          <span>
                            {selectedNote
                              ? formatUsd(selectedNote.amountUnits)
                              : "No note"}
                          </span>
                        </div>
                      </div>

                      <button
                        className={`${compactButton} mt-5 w-full ${
                          canSubmit
                            ? "bg-stone-950 text-white hover:bg-stone-800"
                            : "border border-stone-200 bg-stone-100 text-stone-500"
                        }`}
                        disabled={!canSubmit || submitting}
                        onClick={() => void submitBet()}
                        type="button"
                      >
                        {submitting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : market.poolActive ? (
                          <ShieldCheck className="mr-2 h-4 w-4" />
                        ) : (
                          <Clock3 className="mr-2 h-4 w-4" />
                        )}
                        {submitting
                          ? "Placing Private Bet..."
                          : market.poolActive
                            ? "Place Private Bet"
                            : "Market Pool Pending"}
                      </button>
                      {disabledReason && (
                        <p className="mt-3 text-center text-xs font-bold text-stone-500">
                          {disabledReason}
                        </p>
                      )}
                    </div>
                  </aside>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>

      {(message || error) && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl shadow-xl border p-4 bg-white/95 backdrop-blur-md animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white ${
                error
                  ? "bg-red-500"
                  : submitting || claimingPayoutId
                    ? "bg-stone-900"
                    : "bg-emerald-500"
              }`}
            >
              {error ? (
                "!"
              ) : submitting || claimingPayoutId ? (
                <Loader2 className="h-3 w-3 animate-spin text-white" />
              ) : (
                "✓"
              )}
            </div>
            <div className="flex-1">
              <p
                className={`text-xs font-bold ${error ? "text-red-950" : "text-emerald-950"}`}
              >
                {error
                  ? "System Alert"
                  : submitting || claimingPayoutId
                    ? "In Progress"
                    : "Process Update"}
              </p>
              <p className="mt-1 text-xs leading-5 text-stone-600">
                {error || message}
              </p>
            </div>
            <button
              onClick={() => {
                setError("");
                setMessage("");
              }}
              className="text-stone-400 hover:text-stone-600 transition shrink-0 ml-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
