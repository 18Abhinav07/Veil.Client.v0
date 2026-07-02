"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  Loader2,
  Search,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import TopHeader from "@/components/unified/TopHeader";
import StatusToast from "@/components/unified/StatusToast";
import { useWalletRealtimeEvent } from "@/components/unified/WalletRealtimeProvider";

const USDC_LOGO =
  "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdc.png";
const XLM_LOGO =
  "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/xlm.png";

import {
  decimalToStellarUnits,
  formatStellarUnits,
  type PublicWalletState,
} from "@/lib/publicWalletCore";
import {
  decryptPrivateNote,
  encryptPrivateNote,
  type EncryptedPrivateNotePayload,
  type PrivateNoteSecrets,
} from "@/lib/noteCrypto";
import { decryptMarketOutputNote } from "@/lib/marketOutputNoteClient";
import type { WalletSecrets } from "@/lib/vaultCrypto";
import { signStellarPayload } from "@/lib/walletSigner";

export type MarketOutcome = "YES" | "NO";

export type MarketView = {
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

export type MarketBetView = {
  id: string;
  marketSlug: string;
  outcome: MarketOutcome;
  amountUnits: string;
  status: string;
  txHash: string | null;
  createdAt: string | null;
};

export type MarketPayoutView = {
  id: string;
  marketId: string;
  amountUnits: string;
  status: string;
  payoutCommitmentHex: string | null;
  encryptedNoteCiphertext: string | null;
  leafIndex: number | null;
  txHash: string | null;
};

export type MarketUserNoteView = {
  id: string;
  poolId: string;
  commitmentHex: string;
  encryptedNoteCiphertext?: string;
  amountUnits: string;
  leafIndex: number | null;
  status: string;
  source: string;
  txHash: string | null;
};

export type MarketPortfolio = {
  notes: MarketUserNoteView[];
  bets: MarketBetView[];
  payouts: MarketPayoutView[];
};

export type NotificationView = {
  id: string;
  activityEventId: string | null;
  type: string;
  severity: "info" | "success" | "warning" | "error";
  entityKind: string;
  entityId: string | null;
  title: string;
  body: string | null;
  actionUrl: string | null;
  readAt: string | null;
  seenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MarketsPayload = {
  markets: MarketView[];
  portfolio: MarketPortfolio;
  notifications?: NotificationView[];
  notificationUnreadCount?: number;
};

type MarketsPageProps = {
  accountEmail?: string | null;
  initialData?: MarketsPayload;
  initialPublicAccount?: PublicWalletState | null;
  previewMode?: boolean;
  wallet: WalletSecrets;
};

type PreparedDeposit = {
  noteBlindingHex: string;
  noteCommitmentHex: string;
  amountUnits: string;
  unsignedXdr: string;
  signingPayloadBase64: string;
  dummyBlindingHex: string;
  dummyCommitmentHex: string;
};

type DepositSubmitResult = {
  txHash: string;
  minedLedger: number | null;
  leafIndex: number | null;
  indexingStatus: "indexed" | "pending_index" | "pending_mine";
  error?: string;
};

type PreparedWithdrawal = {
  withdrawal: {
    status: "proof_ready";
    relayBody: unknown;
    changeNote: PrivateNoteSecrets;
  };
};

type WithdrawalSubmitResult = {
  withdrawal: {
    status: "confirmed" | "submitted";
    txHash: string;
    minedLedger: number | null;
    changeLeafIndex: number | null;
    indexingStatus: "indexed" | "pending_index" | "pending_mine";
    error?: string;
  };
  sourceNote?: MarketUserNoteView;
  changeNote?: MarketUserNoteView | null;
};

const compactButton =
  "inline-flex h-10 items-center justify-center rounded-lg px-4 text-xs font-bold uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-50";
const railButton =
  "inline-flex h-11 w-11 items-center justify-center rounded-lg transition focus:outline-none focus:ring-2 focus:ring-stone-900/10";
const categoryFilters = [
  "All",
  "Crypto",
  "Finance",
  "Tech",
  "Macro",
  "Weather",
] as const;
const statusFilters = ["Live", "All"] as const;
const portfolioTabs = ["positions", "notes", "payouts"] as const;
const depositQuickAmounts = ["5", "25", "100"] as const;

type CategoryFilter = (typeof categoryFilters)[number];
type StatusFilter = (typeof statusFilters)[number];
type PortfolioTab = (typeof portfolioTabs)[number];
type MarketNoteActionTab = "deposit" | "withdraw";

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

function spendableMarketNotes(notes: MarketUserNoteView[]) {
  return notes.filter(
    (note) => note.status === "unspent" && note.leafIndex !== null,
  );
}

function visibleMarketNotes(notes: MarketUserNoteView[]) {
  return notes.filter(
    (note) => note.status === "unspent" || note.status.startsWith("pending"),
  );
}

async function decryptMarketUserNote(
  note: MarketUserNoteView,
  wallet: WalletSecrets,
): Promise<PrivateNoteSecrets> {
  if (!note.encryptedNoteCiphertext) {
    throw new Error("Selected market note is missing encrypted spend material.");
  }
  try {
    return await decryptPrivateNote(
      JSON.parse(note.encryptedNoteCiphertext) as EncryptedPrivateNotePayload,
      wallet,
    );
  } catch (error) {
    if (note.source !== "payout") throw error;
    if (note.leafIndex === null) {
      throw new Error("Selected market note is not indexed yet.");
    }
    return decryptMarketOutputNote({
      wallet,
      commitmentHex: note.commitmentHex,
      amountUnits: note.amountUnits,
      leafIndex: note.leafIndex,
      encryptedNoteCiphertext: note.encryptedNoteCiphertext,
    });
  }
}

function normalizeMarketUserNoteSecrets(
  note: MarketUserNoteView,
  secrets: PrivateNoteSecrets,
): PrivateNoteSecrets {
  return {
    ...secrets,
    amountUnits: note.amountUnits,
    leafIndex: note.leafIndex ?? secrets.leafIndex,
  };
}

function formatDate(value: string | null) {
  if (!value) return "No close date";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function MarketsSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <div
          key={item}
          className="rounded-lg border border-stone-200/70 bg-[#fbfbfa] p-4"
        >
          <div className="h-3 w-24 rounded-full bg-stone-100" />
          <div className="mt-5 h-6 w-5/6 rounded bg-stone-100" />
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-stone-200/70 pt-4">
            <div className="h-10 rounded bg-stone-100" />
            <div className="h-10 rounded bg-stone-100" />
          </div>
          <div className="mt-5 h-3 w-1/2 rounded-full bg-stone-100" />
        </div>
      ))}
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

function MarketBalanceCard({
  detail,
  label,
  tone,
  value,
}: {
  detail: string;
  label: string;
  tone: "notes" | "books" | "portfolio";
  value: string;
}) {
  const { amount, symbol } = splitCurrencyLabel(value);
  const Icon =
    tone === "notes"
      ? WalletCards
      : tone === "books"
        ? BarChart3
        : BriefcaseBusiness;
  const toneClass =
    tone === "notes"
      ? "border-[oklch(80%_0.035_88)] bg-[oklch(96%_0.018_90)] text-[oklch(29%_0.05_78)] [background-image:radial-gradient(circle_at_85%_18%,oklch(76%_0.055_92/.22),transparent_30%),linear-gradient(90deg,oklch(54%_0.032_86/.08)_1px,transparent_1px)]"
      : tone === "books"
        ? "border-[oklch(83%_0.035_150)] bg-[oklch(96.5%_0.016_150)] text-[oklch(30%_0.052_154)] [background-image:radial-gradient(circle_at_82%_20%,oklch(70%_0.055_154/.16),transparent_32%),linear-gradient(90deg,oklch(52%_0.045_154/.07)_1px,transparent_1px)]"
        : "border-[oklch(84%_0.012_78)] bg-[oklch(97%_0.006_78)] text-[oklch(29%_0.018_78)] [background-image:radial-gradient(circle_at_84%_18%,oklch(72%_0.018_78/.20),transparent_30%),linear-gradient(90deg,oklch(45%_0.012_78/.07)_1px,transparent_1px)]";

  return (
    <article
      className={`relative min-h-[122px] overflow-hidden rounded-lg border p-4 shadow-[0_14px_32px_oklch(32%_0.018_78/.055)] ${toneClass} [background-size:100%_100%,18px_18px]`}
    >
      <div className="relative flex h-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-normal opacity-70">
              {label}
            </p>
            <div className="mt-2 flex min-w-0 flex-wrap items-end gap-1.5">
              <span className="break-all font-mono text-3xl font-semibold leading-none">
                {amount}
              </span>
              <span className="pb-1 text-sm font-semibold opacity-70">
                {symbol}
              </span>
            </div>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-current/15 bg-[oklch(99%_0.006_86/.50)] opacity-80">
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <div className="flex items-end justify-between gap-2 border-t border-current/15 pt-2">
          <p className="max-w-[26ch] text-[10px] font-medium leading-4 opacity-72">
            {detail}
          </p>
          <div className="hidden h-6 w-16 rounded-[50%] border border-current/20 opacity-55 sm:block" />
        </div>
      </div>
    </article>
  );
}

function MarketNoteAssetCard({ note }: { note: MarketUserNoteView }) {
  const pending = note.status !== "unspent";
  const { amount } = splitCurrencyLabel(formatUsd(note.amountUnits));

  return (
    <article className="market-note-card relative min-h-[128px] overflow-hidden rounded-lg border border-[oklch(73%_0.034_88)] bg-[oklch(96%_0.018_90)] p-4 text-[oklch(28%_0.052_82)] shadow-[0_12px_28px_oklch(34%_0.03_82/.06)]">
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
          <span
            className={`shrink-0 text-[9px] font-bold uppercase tracking-normal ${
              pending
                ? "text-[oklch(42%_0.075_72)]"
                : "text-[oklch(36%_0.06_150)]"
            }`}
          >
            {pending ? note.status.replace(/_/g, " ") : note.source}
          </span>
        </div>
      </div>
    </article>
  );
}

function MarketBrowseCard({ market }: { market: MarketView }) {
  const open = isMarketOpen(market);
  const yesWidth = Math.max(
    3,
    Math.min(97, market.odds.yesProbabilityBps / 100),
  );
  const noWidth = Math.max(3, Math.min(97, market.odds.noProbabilityBps / 100));

  return (
    <Link
      className="market-card group box-border flex h-full w-full min-w-0 max-w-[350px] flex-col rounded-3xl bg-white p-5 text-left shadow-sm ring-1 ring-stone-100 transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(28,25,23,0.07)] hover:ring-stone-200 sm:max-w-full"
      href={`/market/${market.slug}`}
    >
      <div className="flex min-h-32 flex-col justify-between gap-5">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
            <span>{market.category}</span>
            <span className="h-1 w-1 rounded-full bg-stone-300" />
            <span className={`${open ? "text-emerald-700" : "text-stone-500"}`}>
              {open ? "Open" : market.status}
            </span>
            {!market.poolActive && (
              <span className="basis-full text-amber-700">
                Trading setup pending
              </span>
            )}
          </div>
          <h3 className="mt-4 break-words [overflow-wrap:anywhere] text-[15px] font-bold leading-snug text-stone-950 sm:line-clamp-2">
            {market.title}
          </h3>
        </div>
        <div className="text-xs font-semibold text-stone-500">
          Closes {formatDate(market.closesAt)}
        </div>
      </div>

      <div className="market-probability-bar mt-5 flex h-1.5 overflow-hidden rounded-full bg-stone-100">
        <span className="bg-emerald-500/70" style={{ width: `${yesWidth}%` }} />
        <span className="bg-rose-500/65" style={{ width: `${noWidth}%` }} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-stone-50/70 px-3 py-3">
          <span className="inline-flex items-center gap-2 text-xs font-bold text-emerald-800">
            <ArrowUpRight className="h-4 w-4" />
            YES
          </span>
          <span className="mt-2 block">
            <span className="block text-base font-bold text-stone-950">
              {formatProbability(market.odds.yesProbabilityBps)}
            </span>
            <span className="block text-[11px] font-bold text-stone-500">
              {formatMultiple(market.odds.yesMultipleBps)}
            </span>
          </span>
        </div>
        <div className="rounded-2xl bg-stone-50/70 px-3 py-3">
          <span className="inline-flex items-center gap-2 text-xs font-bold text-rose-800">
            <ArrowDownRight className="h-4 w-4" />
            NO
          </span>
          <span className="mt-2 block">
            <span className="block text-base font-bold text-stone-950">
              {formatProbability(market.odds.noProbabilityBps)}
            </span>
            <span className="block text-[11px] font-bold text-stone-500">
              {formatMultiple(market.odds.noMultipleBps)}
            </span>
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-xs font-bold text-stone-500">
        <span>{formatUsd(marketVolume(market))} volume</span>
        <span className="inline-flex items-center gap-1 text-stone-700 group-hover:text-stone-950">
          Bet
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}

export default function MarketsPage({
  accountEmail,
  initialData,
  initialPublicAccount = null,
  previewMode = false,
  wallet,
}: MarketsPageProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const marketRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFocusRefreshRef = useRef(0);
  const [markets, setMarkets] = useState<MarketView[]>(
    initialData?.markets ?? [],
  );
  const [portfolio, setPortfolio] = useState<MarketPortfolio>(
    initialData?.portfolio ?? { notes: [], bets: [], payouts: [] },
  );
  const [activeView, setActiveView] = useState<"markets" | "portfolio">(
    searchParams.get("view") === "portfolio" ? "portfolio" : "markets",
  );
  const [portfolioTab, setPortfolioTab] = useState<PortfolioTab>(
    searchParams.get("tab") === "notes"
      ? "notes"
      : searchParams.get("tab") === "payouts"
        ? "payouts"
        : "positions",
  );
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Live");
  const [query, setQuery] = useState("");
  const [depositAmount, setDepositAmount] = useState("25");
  const [depositing, setDepositing] = useState(false);
  const [marketNoteActionTab, setMarketNoteActionTab] =
    useState<MarketNoteActionTab>("deposit");
  const [selectedWithdrawNoteId, setSelectedWithdrawNoteId] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("10");
  const [withdrawing, setWithdrawing] = useState(false);
  const [claimingPayoutId, setClaimingPayoutId] = useState("");
  const [publicWallet, setPublicWallet] = useState<PublicWalletState | null>(
    initialPublicAccount,
  );
  const [publicWalletLoading, setPublicWalletLoading] = useState(
    !previewMode && !initialPublicAccount,
  );
  const [publicWalletError, setPublicWalletError] = useState("");
  const [loading, setLoading] = useState(!initialData);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [notifications, setNotifications] = useState<NotificationView[]>(
    initialData?.notifications ?? [],
  );
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(
    initialData?.notificationUnreadCount ?? 0,
  );

  const activeNotes = useMemo(
    () => spendableMarketNotes(portfolio.notes),
    [portfolio.notes],
  );
  const selectedWithdrawNote = useMemo(
    () =>
      activeNotes.find((note) => note.id === selectedWithdrawNoteId) ??
      activeNotes[0] ??
      null,
    [activeNotes, selectedWithdrawNoteId],
  );
  const displayNotes = useMemo(
    () => visibleMarketNotes(portfolio.notes),
    [portfolio.notes],
  );
  const activeMarketPool = useMemo(
    () => markets.find((market) => market.poolActive) ?? null,
    [markets],
  );
  const filteredMarkets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return markets.filter(
      (market) =>
        (categoryFilter === "All" || market.category === categoryFilter) &&
        (statusFilter === "All" || isMarketOpen(market)) &&
        (!normalized ||
          `${market.title} ${market.category} ${market.rules} ${market.resolutionSource}`
            .toLowerCase()
            .includes(normalized)),
    );
  }, [categoryFilter, markets, query, statusFilter]);

  const totalMarketBalance = activeNotes
    .reduce((total, item) => total + BigInt(item.amountUnits || "0"), BigInt(0))
    .toString();
  const openMarkets = markets.filter(isMarketOpen).length;
  const claimablePayouts = portfolio.payouts.filter(
    (payout) =>
      payout.status === "confirmed" &&
      Boolean(payout.payoutCommitmentHex) &&
      Boolean(payout.encryptedNoteCiphertext) &&
      payout.leafIndex !== null,
  ).length;
  const depositAmountUnits = useMemo(() => {
    try {
      return decimalToStellarUnits(depositAmount);
    } catch {
      return "";
    }
  }, [depositAmount]);
  const withdrawAmountUnits = useMemo(() => {
    try {
      return decimalToStellarUnits(withdrawAmount);
    } catch {
      return "";
    }
  }, [withdrawAmount]);
  const publicWalletReadinessReason =
    publicWallet && !publicWallet.exists
      ? "Public wallet is not funded yet"
      : publicWallet && !publicWallet.hasUsdcTrustline
        ? "Public wallet is missing a USDC trustline"
        : "";
  const depositPublicWalletBlockReason =
    publicWalletReadinessReason ||
    (publicWallet &&
            depositAmountUnits &&
            BigInt(publicWallet.usdcUnits || "0") < BigInt(depositAmountUnits)
      ? `Insufficient public USDC. Available ${formatUsd(publicWallet.usdcUnits)}.`
      : "");
  const depositDisabled = Boolean(
    !activeMarketPool ||
    depositing ||
    publicWalletLoading ||
    depositPublicWalletBlockReason,
  );
  const withdrawBlockReason =
    !selectedWithdrawNote
      ? "Select a spendable Market Note"
      : !withdrawAmountUnits
        ? "Enter a withdrawal amount"
        : BigInt(withdrawAmountUnits) > BigInt(selectedWithdrawNote.amountUnits)
          ? `Selected note only has ${formatUsd(selectedWithdrawNote.amountUnits)}.`
          : publicWalletReadinessReason;
  const withdrawDisabled = Boolean(
    !activeMarketPool ||
    withdrawing ||
    publicWalletLoading ||
    withdrawBlockReason,
  );

  const loadMarkets = useCallback(async (options?: { showLoading?: boolean }) => {
    if (options?.showLoading !== false) setLoading(true);
    setError("");
    try {
      const payload = await parseResponse<MarketsPayload>(
        await fetch("/api/markets", { cache: "no-store" }),
      );
      setMarkets(payload.markets);
      setPortfolio(payload.portfolio);
      setNotifications(payload.notifications ?? []);
      setNotificationUnreadCount(payload.notificationUnreadCount ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (options?.showLoading !== false) setLoading(false);
    }
  }, []);

  const scheduleMarketRefresh = useCallback(() => {
    if (previewMode || marketRefreshTimer.current) return;
    marketRefreshTimer.current = setTimeout(() => {
      marketRefreshTimer.current = null;
      void loadMarkets({ showLoading: false });
    }, 500);
  }, [loadMarkets, previewMode]);

  const loadPublicWallet = async () => {
    setPublicWalletLoading(true);
    setPublicWalletError("");
    try {
      const payload = await parseResponse<PublicWalletState>(
        await fetch(
          `/api/wallet/public/account?address=${encodeURIComponent(wallet.stellarPublicKey)}`,
          {
            cache: "no-store",
          },
        ),
      );
      setPublicWallet(payload);
    } catch (err) {
      setPublicWallet(null);
      setPublicWalletError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublicWalletLoading(false);
    }
  };

  useEffect(() => {
    if (previewMode) return;
    void loadMarkets({ showLoading: true });
    void loadPublicWallet();
  }, [loadMarkets, previewMode]);

  useEffect(() => {
    return () => {
      if (marketRefreshTimer.current) {
        clearTimeout(marketRefreshTimer.current);
        marketRefreshTimer.current = null;
      }
    };
  }, []);

  useWalletRealtimeEvent(
    useCallback(
      (event) => {
        if (event.event !== "wallet_activity") return;
        const eventType = String(event.data.eventType ?? "");
        if (eventType.startsWith("market_")) scheduleMarketRefresh();
      },
      [scheduleMarketRefresh],
    ),
  );

  useEffect(() => {
    if (previewMode) return undefined;
    const refreshIfStale = () => {
      const now = Date.now();
      if (now - lastFocusRefreshRef.current < 5000) return;
      lastFocusRefreshRef.current = now;
      scheduleMarketRefresh();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshIfStale();
    };
    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [previewMode, scheduleMarketRefresh]);

  useEffect(() => {
    if (searchParams.get("view") === "portfolio") {
      setActiveView("portfolio");
    }
    if (searchParams.get("tab") === "notes") {
      setPortfolioTab("notes");
    } else if (searchParams.get("tab") === "payouts") {
      setPortfolioTab("payouts");
    }
  }, [searchParams]);

  const recordMarketNote = async (input: {
    note: PrivateNoteSecrets;
    encrypted: EncryptedPrivateNotePayload;
    status: "pending_deposit" | "unspent";
    txHash?: string | null;
  }) => {
    const payload = await parseResponse<{ note: MarketUserNoteView }>(
      await fetch("/api/markets/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "store",
          commitmentHex: input.note.commitmentHex,
          encryptedNoteCiphertext: JSON.stringify(input.encrypted),
          amountUnits: input.note.amountUnits,
          leafIndex: input.note.leafIndex,
          txHash: input.txHash ?? null,
          status: input.status,
        }),
      }),
    );
    return payload.note;
  };

  const handleMarketDeposit = async () => {
    if (!activeMarketPool) {
      setError("Market setup pending");
      return;
    }
    const amountUnits = decimalToStellarUnits(depositAmount);
    if (publicWallet) {
      if (!publicWallet.exists) {
        setError("Public wallet is not funded yet.");
        return;
      }
      if (!publicWallet.hasUsdcTrustline) {
        setError("Public wallet is missing a USDC trustline.");
        return;
      }
      if (BigInt(publicWallet.usdcUnits || "0") < BigInt(amountUnits)) {
        setError(
          `Insufficient public USDC. Available ${formatUsd(publicWallet.usdcUnits)}.`,
        );
        return;
      }
    }
    setDepositing(true);
    setError("");
    setMessage("Preparing market deposit...");
    setActiveView("portfolio");
    setPortfolioTab("notes");
    try {
      const prepared = await parseResponse<PreparedDeposit>(
        await fetch("/api/markets/deposits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: "prepare",
            source: wallet.stellarPublicKey,
            amountUnits,
            notePrivateKeyHex: wallet.bn254NotePrivateKeyHex,
            senderEncryptionPublicHex: wallet.x25519PublicHex,
            membershipBlindingHex: wallet.membershipBlindingHex,
          }),
        }),
      );

      const pendingNote: PrivateNoteSecrets = {
        blindingHex: prepared.noteBlindingHex,
        commitmentHex: prepared.noteCommitmentHex,
        amountUnits: prepared.amountUnits,
        leafIndex: null,
        dummyBlindingHex: prepared.dummyBlindingHex,
        dummyCommitmentHex: prepared.dummyCommitmentHex,
        createdAt: Date.now(),
      };
      const pendingRecord = await recordMarketNote({
        note: pendingNote,
        encrypted: await encryptPrivateNote(pendingNote, wallet),
        status: "pending_deposit",
      });
      setPortfolio((current) => ({
        ...current,
        notes: [
          pendingRecord,
          ...current.notes.filter(
            (note) => note.commitmentHex !== pendingRecord.commitmentHex,
          ),
        ],
      }));

      setMessage("Signing market deposit...");
      const signature = signStellarPayload({
        stellarSecretKey: wallet.stellarSecretKey,
        payloadBase64: prepared.signingPayloadBase64,
      });

      const submitted = await parseResponse<DepositSubmitResult>(
        await fetch("/api/markets/deposits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: "submit",
            source: wallet.stellarPublicKey,
            unsignedXdr: prepared.unsignedXdr,
            signatureBase64: signature.signatureBase64,
            noteCommitmentHex: prepared.noteCommitmentHex,
          }),
        }),
      );

      if (
        submitted.indexingStatus !== "indexed" ||
        submitted.leafIndex === null
      ) {
        setMessage(
          submitted.indexingStatus === "pending_mine"
            ? `Market deposit submitted as ${shortHash(submitted.txHash)}. Waiting for mining confirmation.`
            : `Market deposit submitted as ${shortHash(submitted.txHash)}. Note indexing is still catching up.`,
        );
        await loadMarkets();
        return;
      }

      const finalizedNote: PrivateNoteSecrets = {
        ...pendingNote,
        leafIndex: submitted.leafIndex,
      };
      const recorded = await recordMarketNote({
        note: finalizedNote,
        encrypted: await encryptPrivateNote(finalizedNote, wallet),
        status: "unspent",
        txHash: submitted.txHash,
      });
      setPortfolio((current) => ({
        ...current,
        notes: [
          recorded,
          ...current.notes.filter(
            (note) => note.commitmentHex !== recorded.commitmentHex,
          ),
        ],
      }));
      setDepositAmount("25");
      setMessage("Market note deposited and ready for positions.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMessage("");
    } finally {
      setDepositing(false);
    }
  };

  const handleMarketWithdraw = async () => {
    if (!activeMarketPool) {
      setError("Market setup pending");
      return;
    }
    const selectedNote = selectedWithdrawNote;
    if (!selectedNote) {
      setError("Select a spendable Market Note.");
      return;
    }
    if (!withdrawAmountUnits) {
      setError("Enter a withdrawal amount.");
      return;
    }
    if (BigInt(withdrawAmountUnits) > BigInt(selectedNote.amountUnits)) {
      setError(`Selected note only has ${formatUsd(selectedNote.amountUnits)}.`);
      return;
    }
    setWithdrawing(true);
    setError("");
    setMessage("Preparing market note withdrawal...");
    setActiveView("portfolio");
    setPortfolioTab("notes");
    try {
      const sourceNote = normalizeMarketUserNoteSecrets(
        selectedNote,
        await decryptMarketUserNote(selectedNote, wallet),
      );
      if (sourceNote.leafIndex === null) {
        throw new Error("Selected market note is not indexed yet.");
      }
      if (sourceNote.commitmentHex !== selectedNote.commitmentHex) {
        throw new Error(
          "Selected market note does not match its encrypted note payload.",
        );
      }

      const prepared = await parseResponse<PreparedWithdrawal>(
        await fetch("/api/markets/withdrawals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: "prepare",
            noteId: selectedNote.id,
            inputCommitmentHex: selectedNote.commitmentHex,
            withdrawAmountUnits,
            notePrivateKeyHex: wallet.bn254NotePrivateKeyHex,
            senderEncryptionPublicHex: wallet.x25519PublicHex,
            membershipBlindingHex: wallet.membershipBlindingHex,
            noteBlindingHex: sourceNote.blindingHex,
            noteAmountUnits: sourceNote.amountUnits,
            noteLeafIndex: sourceNote.leafIndex,
            dummyBlindingHex: sourceNote.dummyBlindingHex,
          }),
        }),
      );

      const changeNote =
        prepared.withdrawal.changeNote &&
        BigInt(prepared.withdrawal.changeNote.amountUnits || "0") > BigInt(0)
          ? prepared.withdrawal.changeNote
          : null;
      const encryptedChangeNote = changeNote
        ? await encryptPrivateNote(changeNote, wallet)
        : null;

      setMessage("Relaying market withdrawal...");
      const submitted = await parseResponse<WithdrawalSubmitResult>(
        await fetch("/api/markets/withdrawals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: "submit",
            noteId: selectedNote.id,
            inputCommitmentHex: selectedNote.commitmentHex,
            withdrawAmountUnits,
            relayBody: prepared.withdrawal.relayBody,
            changeCommitmentHex: changeNote?.commitmentHex ?? null,
            changeAmountUnits: changeNote?.amountUnits ?? null,
            encryptedChangeNoteCiphertext: encryptedChangeNote
              ? JSON.stringify(encryptedChangeNote)
              : null,
          }),
        }),
      );

      if (
        submitted.withdrawal.indexingStatus !== "indexed" ||
        submitted.withdrawal.status !== "confirmed"
      ) {
        setMessage(
          submitted.withdrawal.indexingStatus === "pending_mine"
            ? `Market withdrawal submitted as ${shortHash(submitted.withdrawal.txHash)}. Waiting for mining confirmation.`
            : `Market withdrawal submitted as ${shortHash(submitted.withdrawal.txHash)}. Change note indexing is still catching up.`,
        );
        await loadMarkets({ showLoading: false });
        await loadPublicWallet();
        return;
      }

      setPortfolio((current) => ({
        ...current,
        notes: [
          ...(submitted.changeNote ? [submitted.changeNote] : []),
          ...current.notes
            .map((note) =>
              note.id === selectedNote.id
                ? (submitted.sourceNote ?? { ...note, status: "spent" })
                : note,
            )
            .filter((note) => note.status !== "spent"),
        ],
      }));
      setSelectedWithdrawNoteId("");
      setWithdrawAmount("10");
      setMessage("Market Note withdrawn to your public wallet.");
      void loadMarkets({ showLoading: false });
      void loadPublicWallet();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMessage("");
    } finally {
      setWithdrawing(false);
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
      const payoutPrivateNote = await decryptMarketOutputNote({
        wallet,
        commitmentHex: payout.payoutCommitmentHex,
        amountUnits: payout.amountUnits,
        leafIndex: payout.leafIndex,
        encryptedNoteCiphertext: payout.encryptedNoteCiphertext,
      });
      const walletEncryptedPayoutNote = await encryptPrivateNote(payoutPrivateNote, wallet);
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
              encryptedNoteCiphertext: JSON.stringify(walletEncryptedPayoutNote),
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
      setPortfolioTab("notes");
      setMessage("Payout claimed into a spendable Market Note.");
      void loadMarkets({ showLoading: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setClaimingPayoutId("");
    }
  };

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
            onClick={() => setActiveView("markets")}
            type="button"
            title="Markets"
            className={`relative flex h-10 w-full items-center rounded-lg transition-all text-sm font-medium overflow-hidden px-3 ${
              activeView === "markets"
                ? "bg-white text-stone-950 shadow-sm ring-1 ring-stone-200"
                : "text-stone-600 hover:bg-stone-100/60 hover:text-stone-900"
            }`}
          >
            <BarChart3
              className={`h-4 w-4 shrink-0 ${activeView === "markets" ? "text-stone-950" : "text-stone-500"}`}
            />
            <span className="ml-3 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 animate-in fade-in">
              Markets
            </span>
          </button>

          <button
            onClick={() => setActiveView("portfolio")}
            type="button"
            title="Portfolio"
            className={`relative flex h-10 w-full items-center rounded-lg transition-all text-sm font-medium overflow-hidden px-3 ${
              activeView === "portfolio"
                ? "bg-white text-stone-950 shadow-sm ring-1 ring-stone-200"
                : "text-stone-600 hover:bg-stone-100/60 hover:text-stone-900"
            }`}
          >
            <BriefcaseBusiness
              className={`h-4 w-4 shrink-0 ${activeView === "portfolio" ? "text-stone-950" : "text-stone-500"}`}
            />
            <span className="ml-3 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 animate-in fade-in">
              Portfolio
            </span>
          </button>

          <Link
            href="/wallet?mode=private&tab=dashboard"
            title="Wallet"
            className="relative flex h-10 w-full items-center rounded-lg transition-all text-sm font-medium overflow-hidden px-3 text-stone-600 hover:bg-stone-100/60 hover:text-stone-900"
          >
            <WalletCards className="h-4 w-4 shrink-0 text-stone-500" />
            <span className="ml-3 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 animate-in fade-in">
              Wallet
            </span>
          </Link>
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
          title="Markets"
          accountEmail={accountEmail}
          initialNotifications={notifications}
          notificationUnreadCount={notificationUnreadCount}
          onNotificationsRead={() => setNotificationUnreadCount(0)}
        />

        <main className="flex-1 overflow-y-auto no-scrollbar p-4 md:p-6 pb-24 md:pb-6">
          <div className="mx-auto flex w-full max-w-[1380px] min-w-0 flex-col gap-6">
            {/* Mobile View Toggle Bar */}
            <div className="flex items-center justify-between border-b border-stone-200/80 pb-4 md:hidden">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  VEIL Markets
                </p>
                <h2 className="mt-0.5 text-lg font-bold text-stone-950">
                  {activeView === "markets" ? "Markets" : "Portfolio"}
                </h2>
              </div>
              <div className="market-view-rail flex h-9 items-center rounded-full bg-stone-100/70 p-1">
                <button
                  aria-label="Markets"
                  className={`flex h-7 w-7 items-center justify-center rounded-full transition ${
                    activeView === "markets"
                      ? "bg-white text-stone-950 shadow-sm"
                      : "text-stone-500"
                  }`}
                  onClick={() => setActiveView("markets")}
                  type="button"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                </button>
                <button
                  aria-label="Portfolio"
                  className={`flex h-7 w-7 items-center justify-center rounded-full transition ${
                    activeView === "portfolio"
                      ? "bg-white text-stone-950 shadow-sm"
                      : "text-stone-500"
                  }`}
                  onClick={() => setActiveView("portfolio")}
                  type="button"
                >
                  <BriefcaseBusiness className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <section className="market-balance-strip grid gap-3.5 md:grid-cols-3">
              <MarketBalanceCard
                detail="Spendable private balance"
                label="Market Notes"
                tone="notes"
                value={formatUsd(totalMarketBalance)}
              />
              <MarketBalanceCard
                detail="Active YES / NO books"
                label="Open Markets"
                tone="books"
                value={`${openMarkets} books`}
              />
              <MarketBalanceCard
                detail={`${claimablePayouts} payouts pending`}
                label="Portfolio"
                tone="portfolio"
                value={`${portfolio.bets.length} positions`}
              />
            </section>

            <section className="min-w-0">
              {activeView === "markets" ? (
                <>
                  <div className="flex flex-col gap-4 border-b border-stone-200/80 pb-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-normal text-stone-500">
                        Market board
                      </p>
                      <h2 className="mt-1 text-xl font-semibold text-stone-950">
                        Live books
                      </h2>
                    </div>
                    <label className="relative block lg:w-80">
                      <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                      <input
                        className="h-10 w-full border-b border-stone-200 bg-transparent pl-7 pr-2 text-sm font-semibold text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-900"
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search markets"
                        type="search"
                        value={query}
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex max-w-[350px] flex-wrap items-center gap-x-3 gap-y-3 pb-2 sm:max-w-full sm:gap-x-4">
                    {statusFilters.map((filter) => (
                      <button
                        key={filter}
                        aria-pressed={statusFilter === filter}
                        className={`shrink-0 border-b text-[10px] font-semibold uppercase tracking-normal transition ${
                          statusFilter === filter
                            ? "border-stone-950 text-stone-950"
                            : "border-transparent text-stone-400 hover:text-stone-700"
                        }`}
                        onClick={() => setStatusFilter(filter)}
                        type="button"
                      >
                        {filter}
                      </button>
                    ))}
                    <span className="h-4 w-px shrink-0 bg-stone-200" />
                    {categoryFilters.map((filter) => (
                      <button
                        key={filter}
                        aria-pressed={categoryFilter === filter}
                        className={`shrink-0 border-b text-[10px] font-semibold uppercase tracking-normal transition ${
                          categoryFilter === filter
                            ? "border-stone-950 text-stone-950"
                            : "border-transparent text-stone-400 hover:text-stone-700"
                        }`}
                        onClick={() => setCategoryFilter(filter)}
                        type="button"
                      >
                        {filter}
                      </button>
                    ))}
                  </div>

                  <div className="mt-5">
                    {loading ? (
                      <MarketsSkeleton />
                    ) : filteredMarkets.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-stone-200/80 px-6 py-12 text-center">
                        <p className="text-sm font-bold text-stone-950">
                          No markets match this search
                        </p>
                        <p className="mt-2 text-sm text-stone-500">
                          Try a category or a shorter query.
                        </p>
                      </div>
                    ) : (
                      <div className="grid w-full min-w-0 max-w-[350px] grid-cols-1 gap-3 sm:max-w-full md:grid-cols-2 xl:grid-cols-3">
                        {filteredMarkets.map((market) => (
                          <MarketBrowseCard key={market.id} market={market} />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="portfolio-workspace mt-5 grid gap-7 lg:grid-cols-[minmax(0,1fr)_360px]">
                  <section className="min-w-0">
                    <div className="flex flex-col gap-4 border-b border-stone-200/80 pb-4 md:flex-row md:items-end md:justify-between">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                          Portfolio
                        </p>
                        <h2 className="mt-1 text-xl font-bold tracking-tight text-stone-950">
                          Market positions
                        </h2>
                      </div>
                      <div className="relative flex h-10 max-w-full items-center overflow-x-auto rounded-full bg-stone-100/60 p-1">
                        {portfolioTabs.map((tab) => (
                          <button
                            key={tab}
                            aria-pressed={portfolioTab === tab}
                            className={`relative h-full shrink-0 rounded-full px-3 text-xs font-bold transition sm:px-4 ${
                              portfolioTab === tab
                                ? "bg-white text-stone-950 shadow-sm"
                                : "text-stone-500 hover:text-stone-950"
                            }`}
                            onClick={() => setPortfolioTab(tab)}
                            type="button"
                          >
                            {tab === "positions"
                              ? "Positions"
                              : tab === "notes"
                                ? "Market Notes"
                                : "Payouts"}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5">
                      {portfolioTab === "positions" &&
                        (portfolio.bets.length === 0 ? (
                          <div className="rounded-3xl bg-white px-6 py-12 text-center shadow-sm ring-1 ring-stone-100">
                            <p className="text-sm font-bold text-stone-950">
                              No positions yet
                            </p>
                            <p className="mt-2 text-sm text-stone-500">
                              Open a market card to place a private position.
                            </p>
                          </div>
                        ) : (
                          <div className="portfolio-table-card rounded-3xl bg-white p-3 shadow-sm ring-1 ring-stone-100">
                            <div className="divide-y divide-stone-100">
                              {portfolio.bets.map((bet) => (
                                <Link
                                  key={bet.id}
                                  className="flex items-center justify-between gap-4 rounded-2xl px-3 py-3 text-sm transition hover:bg-stone-50/70"
                                  href={`/market/${bet.marketSlug}`}
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate font-bold text-stone-950">
                                      {bet.marketSlug}
                                    </span>
                                    <span className="mt-1 block text-xs font-semibold text-stone-500">
                                      {bet.outcome} position, {bet.status}
                                    </span>
                                  </span>
                                  <span className="shrink-0 font-bold text-stone-900">
                                    {formatUsd(bet.amountUnits)}
                                  </span>
                                </Link>
                              ))}
                            </div>
                          </div>
                        ))}

                      {portfolioTab === "notes" &&
                        (displayNotes.length === 0 ? (
                          <div className="rounded-3xl bg-white px-6 py-12 text-center shadow-sm ring-1 ring-stone-100">
                            <p className="text-sm font-bold text-stone-950">
                              No spendable Market Notes
                            </p>
                            <p className="mt-2 text-sm text-stone-500">
                              Use the deposit form to create a spendable Market
                              Note.
                            </p>
                          </div>
                        ) : (
                          <div className="market-note-card-grid grid gap-3 sm:grid-cols-2">
                            {displayNotes.map((note) => (
                              <MarketNoteAssetCard key={note.id} note={note} />
                            ))}
                          </div>
                        ))}

                      {portfolioTab === "payouts" &&
                        (portfolio.payouts.length === 0 ? (
                          <div className="rounded-3xl bg-white px-6 py-12 text-center shadow-sm ring-1 ring-stone-100">
                            <p className="text-sm font-bold text-stone-950">
                              No payouts yet
                            </p>
                            <p className="mt-2 text-sm text-stone-500">
                              Resolved winning positions will appear here.
                            </p>
                          </div>
                        ) : (
                          <div className="portfolio-table-card rounded-3xl bg-white p-3 shadow-sm ring-1 ring-stone-100">
                            <div className="divide-y divide-stone-100">
                              {portfolio.payouts.map((payout) => {
                                const ready =
                                  payout.status === "confirmed" &&
                                  Boolean(payout.payoutCommitmentHex) &&
                                  Boolean(payout.encryptedNoteCiphertext) &&
                                  payout.leafIndex !== null;
                                const claimed = payout.status === "claimed";
                                return (
                                  <div
                                    key={payout.id}
                                    className="flex items-center justify-between gap-4 rounded-2xl px-3 py-3 transition hover:bg-stone-50/70"
                                  >
                                    <span className="min-w-0">
                                      <span className="block text-sm font-bold text-stone-950">
                                        {formatUsd(payout.amountUnits)}
                                      </span>
                                      <span className="mt-1 block text-xs font-semibold text-stone-500">
                                        {payout.status}
                                        {payout.txHash
                                          ? `, ${shortHash(payout.txHash)}`
                                          : ""}
                                      </span>
                                    </span>
                                    {claimed ? (
                                      <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                                        Claimed
                                      </span>
                                    ) : ready ? (
                                      <button
                                        className="shrink-0 rounded-full bg-stone-950 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white transition hover:bg-stone-800 disabled:opacity-60"
                                        disabled={claimingPayoutId === payout.id}
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
                                      <span className="shrink-0 rounded-full bg-stone-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
                                        Awaiting payout note
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                    </div>
                  </section>

                  <aside className="market-deposit-panel min-w-0 lg:sticky lg:top-5 lg:self-start">
                    <div className="market-note-action-card rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-100">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between lg:flex-col lg:items-stretch">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                            Market Notes
                          </p>
                          <h2 className="mt-1 text-xl font-bold tracking-tight text-stone-950">
                            Deposit or withdraw
                          </h2>
                          <p className="mt-2 text-sm font-semibold leading-6 text-stone-500">
                            Move public USDC into private Market Notes, or send
                            Market Notes back to your public wallet.
                          </p>
                        </div>

                        <div
                          className="relative flex h-10 shrink-0 items-center rounded-full bg-stone-100/60 p-1"
                          role="tablist"
                          aria-label="Market note action"
                        >
                          {(["deposit", "withdraw"] as const).map((tab) => (
                            <button
                              key={tab}
                              aria-selected={marketNoteActionTab === tab}
                              className={`h-full rounded-full px-4 text-xs font-bold transition ${
                                marketNoteActionTab === tab
                                  ? "bg-white text-stone-950 shadow-sm"
                                  : "text-stone-500 hover:text-stone-950"
                              }`}
                              onClick={() => setMarketNoteActionTab(tab)}
                              role="tab"
                              type="button"
                            >
                              {tab === "deposit" ? "Deposit" : "Withdraw"}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="mt-5 divide-y divide-stone-100">
                        <div className="flex items-center justify-between gap-4 rounded-2xl px-3 py-3 transition hover:bg-stone-50/70">
                          <div className="flex min-w-0 items-center gap-4">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-stone-100 bg-stone-50 p-1">
                              <img
                                src={USDC_LOGO}
                                alt="USDC Logo"
                                className="h-full w-full object-contain"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-semibold text-stone-900">
                                  USD Coin
                                </p>
                                <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-400">
                                  USDC
                                </span>
                              </div>
                              <p className="mt-0.5 text-[10px] font-medium text-stone-400">
                                Public wallet
                              </p>
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <p className="font-mono text-sm font-semibold text-stone-900">
                              {publicWalletLoading
                                ? "--"
                                : publicWallet
                                  ? formatStellarUnits(
                                      publicWallet.usdcUnits,
                                      "",
                                    ).split(" ")[0]
                                  : "--"}
                            </p>
                            <p className="mt-0.5 font-mono text-[10px] font-medium text-stone-400">
                              {publicWalletLoading
                                ? "--"
                                : publicWallet
                                  ? `$${Number(formatStellarUnits(publicWallet.usdcUnits, "").split(" ")[0]).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  : "--"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-4 rounded-2xl px-3 py-3 transition hover:bg-stone-50/70">
                          <div className="flex min-w-0 items-center gap-4">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-stone-100 bg-stone-50 p-1">
                              <img
                                src={XLM_LOGO}
                                alt="XLM Logo"
                                className="h-full w-full object-contain"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-semibold text-stone-900">
                                  Stellar Lumens
                                </p>
                                <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-400">
                                  XLM
                                </span>
                              </div>
                              <p className="mt-0.5 text-[10px] font-medium text-stone-400">
                                Network fees
                              </p>
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <p className="font-mono text-sm font-semibold text-stone-900">
                              {publicWalletLoading
                                ? "--"
                                : publicWallet
                                  ? formatStellarUnits(
                                      publicWallet.xlmUnits,
                                      "",
                                    ).split(" ")[0]
                                  : "--"}
                            </p>
                            <p className="mt-0.5 font-mono text-[10px] font-medium text-stone-400">
                              {publicWalletLoading
                                ? "--"
                                : publicWallet
                                  ? `${formatStellarUnits(publicWallet.xlmUnits, "").split(" ")[0]} XLM`
                                  : "--"}
                            </p>
                          </div>
                        </div>
                      </div>

                      {marketNoteActionTab === "deposit" ? (
                        <div className="mt-5">
                          {(depositPublicWalletBlockReason ||
                            publicWalletError) && (
                            <p className="mb-4 text-xs font-bold text-amber-700">
                              {depositPublicWalletBlockReason ||
                                publicWalletError}
                            </p>
                          )}

                          <div className="flex flex-wrap gap-2">
                            {depositQuickAmounts.map((quickAmount) => (
                              <button
                                key={quickAmount}
                                className={`h-9 rounded-xl px-3 text-xs font-bold transition ${
                                  depositAmount === quickAmount
                                    ? "bg-stone-950 text-[#fbfbfa]"
                                    : "bg-stone-100/60 text-stone-600 hover:bg-stone-100 hover:text-stone-950"
                                }`}
                                onClick={() => setDepositAmount(quickAmount)}
                                type="button"
                              >
                                {quickAmount} USDC
                              </button>
                            ))}
                          </div>

                          <label className="mt-5 block">
                            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                              Amount
                            </span>
                            <input
                              className="mt-2 h-11 w-full border-b border-stone-200 bg-transparent px-1 text-sm font-bold text-stone-950 outline-none transition focus:border-stone-900"
                              min="0.0000001"
                              onChange={(event) =>
                                setDepositAmount(event.target.value)
                              }
                              step="0.0000001"
                              type="number"
                              value={depositAmount}
                            />
                          </label>

                          <button
                            className={`${compactButton} mt-5 w-full ${
                              !depositDisabled
                                ? "bg-stone-950 text-[#fbfbfa] hover:bg-stone-800"
                                : "border border-stone-200 bg-stone-100 text-stone-500"
                            }`}
                            disabled={depositDisabled}
                            onClick={() => void handleMarketDeposit()}
                            type="button"
                          >
                            {depositing ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <ShieldCheck className="mr-2 h-4 w-4" />
                            )}
                            Deposit to Market Notes
                          </button>
                        </div>
                      ) : (
                        <div className="mt-5">
                          <label className="block">
                            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                              Market Note
                            </span>
                            <select
                              className="mt-2 h-11 w-full border-b border-stone-200 bg-transparent px-1 text-sm font-bold text-stone-950 outline-none transition focus:border-stone-900"
                              disabled={activeNotes.length === 0 || withdrawing}
                              onChange={(event) =>
                                setSelectedWithdrawNoteId(event.target.value)
                              }
                              value={selectedWithdrawNote?.id ?? ""}
                            >
                              {activeNotes.length === 0 ? (
                                <option value="">No spendable Market Notes</option>
                              ) : (
                                activeNotes.map((note) => (
                                  <option key={note.id} value={note.id}>
                                    {formatUsd(note.amountUnits)} ·{" "}
                                    {shortHash(note.commitmentHex)}
                                  </option>
                                ))
                              )}
                            </select>
                          </label>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {selectedWithdrawNote && (
                              <button
                                className="h-9 rounded-xl bg-stone-100/60 px-3 text-xs font-bold text-stone-600 transition hover:bg-stone-100 hover:text-stone-950"
                                onClick={() =>
                                  setWithdrawAmount(
                                    formatInputAmount(
                                      selectedWithdrawNote.amountUnits,
                                    ),
                                  )
                                }
                                type="button"
                              >
                                Use max
                              </button>
                            )}
                            {["5", "10", "25"].map((quickAmount) => (
                              <button
                                key={quickAmount}
                                className={`h-9 rounded-xl px-3 text-xs font-bold transition ${
                                  withdrawAmount === quickAmount
                                    ? "bg-stone-950 text-[#fbfbfa]"
                                    : "bg-stone-100/60 text-stone-600 hover:bg-stone-100 hover:text-stone-950"
                                }`}
                                onClick={() => setWithdrawAmount(quickAmount)}
                                type="button"
                              >
                                {quickAmount} USDC
                              </button>
                            ))}
                          </div>

                          <label className="mt-5 block">
                            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                              Amount
                            </span>
                            <input
                              className="mt-2 h-11 w-full border-b border-stone-200 bg-transparent px-1 text-sm font-bold text-stone-950 outline-none transition focus:border-stone-900"
                              min="0.0000001"
                              onChange={(event) =>
                                setWithdrawAmount(event.target.value)
                              }
                              step="0.0000001"
                              type="number"
                              value={withdrawAmount}
                            />
                          </label>

                          {(withdrawBlockReason || publicWalletError) && (
                            <p className="mt-3 text-xs font-bold text-amber-700">
                              {withdrawBlockReason || publicWalletError}
                            </p>
                          )}

                          <button
                            className={`${compactButton} mt-5 w-full ${
                              !withdrawDisabled
                                ? "bg-stone-950 text-[#fbfbfa] hover:bg-stone-800"
                                : "border border-stone-200 bg-stone-100 text-stone-500"
                            }`}
                            disabled={withdrawDisabled}
                            onClick={() => void handleMarketWithdraw()}
                            type="button"
                          >
                            {withdrawing ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <ArrowUpRight className="mr-2 h-4 w-4" />
                            )}
                            Withdraw to Public Wallet
                          </button>
                        </div>
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
        <StatusToast
          tone={error ? "error" : "success"}
          message={error || message}
          onDismiss={() => {
            setError("");
            setMessage("");
          }}
        />
      )}
    </div>
  );
}
