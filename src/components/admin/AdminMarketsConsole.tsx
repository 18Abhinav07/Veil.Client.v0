"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Loader2,
  PanelRight,
  RefreshCw,
  ShieldCheck,
  Sprout,
} from "lucide-react";

export type MarketOutcome = "YES" | "NO";

export type AdminMarket = {
  id: string;
  slug: string;
  title: string;
  category: string;
  status: string;
  closesAt: string | null;
  resolvesAt?: string | null;
  rules?: string;
  resolutionSource?: string;
  iconName?: string;
  displayOrder?: number;
  yesTotalUnits: string;
  noTotalUnits: string;
  winningOutcome: MarketOutcome | null;
  poolStatus: string | null;
  poolActive: boolean;
  treeDepth: number | null;
  odds: {
    yesProbabilityBps: number;
    noProbabilityBps: number;
  };
};

export type AdminPayout = {
  id: string;
  userEmail: string | null;
  amountUnits: string;
  status: string;
  txHash: string | null;
};

type AdminPayoutExecutionResponse = {
  payout?: {
    status?: string;
  };
  consolidation?: {
    status?: string;
  };
  executedCount?: number;
  consolidatedCount?: number;
  remainingCount?: number;
  completed?: boolean;
  txHash?: string;
};

type DraftMarketForm = {
  title: string;
  slug: string;
  category: string;
  closesAt: string;
  resolvesAt: string;
  rules: string;
  resolutionSource: string;
  iconName: string;
  displayOrder: string;
};

interface AdminMarketsConsoleProps {
  adminEmail?: string;
  initialMarkets?: AdminMarket[];
  initialPayoutQueueByMarket?: Record<string, AdminPayout[]>;
  previewMode?: boolean;
}

const panel = "rounded-lg border border-stone-200/80 bg-[#fbfbfa]";
const actionButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-xs font-black uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-50";
const emptyDraftForm: DraftMarketForm = {
  title: "",
  slug: "",
  category: "Crypto",
  closesAt: "",
  resolvesAt: "",
  rules: "",
  resolutionSource: "",
  iconName: "circle-dot",
  displayOrder: "100",
};

function formatUnits(units: string) {
  const padded = units.padStart(8, "0");
  const whole = padded.slice(0, -7) || "0";
  const fractional = padded.slice(-7).replace(/0+$/, "");
  return `${whole}${fractional ? `.${fractional}` : ""} USDC`;
}

function formatProbability(bps: number) {
  return `${(bps / 100).toFixed(1)}%`;
}

function totalVolume(market: AdminMarket) {
  return (BigInt(market.yesTotalUnits || "0") + BigInt(market.noTotalUnits || "0")).toString();
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function dateForInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function isoFromInput(value: string) {
  if (!value) return "";
  return new Date(value).toISOString();
}

function marketToForm(market: AdminMarket | null): DraftMarketForm {
  if (!market) return emptyDraftForm;
  return {
    title: market.title,
    slug: market.slug,
    category: market.category || "Crypto",
    closesAt: dateForInput(market.closesAt),
    resolvesAt: dateForInput(market.resolvesAt),
    rules: market.rules ?? "",
    resolutionSource: market.resolutionSource ?? "",
    iconName: market.iconName ?? "circle-dot",
    displayOrder: String(market.displayOrder ?? 100),
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
  return data as T;
}

function AdminStatusTabs({
  active,
  markets,
  onChange,
}: {
  active: string;
  markets: AdminMarket[];
  onChange: (status: string) => void;
}) {
  const statuses = ["all", "draft", "open", "closed", "settling", "settled", "cancelled"];
  return (
    <div className="flex flex-wrap gap-2">
      {statuses.map((status) => {
        const count = status === "all" ? markets.length : markets.filter((market) => market.status === status).length;
        return (
          <button
            key={status}
            aria-pressed={active === status}
            className={`h-9 rounded-xl px-3 text-[10px] font-black uppercase tracking-[0.12em] transition ${
              active === status
                ? "bg-stone-950 text-white"
                : "border border-stone-200 bg-white text-stone-500 hover:text-stone-950"
            }`}
            onClick={() => onChange(status)}
            type="button"
          >
            {status} · {count}
          </button>
        );
      })}
    </div>
  );
}

export default function AdminMarketsConsole({
  adminEmail = "Admin",
  initialMarkets = [],
  initialPayoutQueueByMarket = {},
  previewMode = false,
}: AdminMarketsConsoleProps) {
  const [markets, setMarkets] = useState<AdminMarket[]>(initialMarkets);
  const [adminAddress, setAdminAddress] = useState(adminEmail);
  const [selectedMarketId, setSelectedMarketId] = useState(initialMarkets[0]?.id ?? "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [draftForm, setDraftForm] = useState<DraftMarketForm>(emptyDraftForm);
  const [selectedOutcomeByMarket, setSelectedOutcomeByMarket] = useState<Record<string, MarketOutcome>>({});
  const [evidenceByMarket, setEvidenceByMarket] = useState<Record<string, string>>({});
  const [cancelReasonByMarket, setCancelReasonByMarket] = useState<Record<string, string>>({});
  const [payoutQueueByMarket, setPayoutQueueByMarket] =
    useState<Record<string, AdminPayout[]>>(initialPayoutQueueByMarket);
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedMarket = useMemo(
    () => markets.find((market) => market.id === selectedMarketId) ?? markets[0] ?? null,
    [markets, selectedMarketId],
  );
  const filteredMarkets = useMemo(
    () => (statusFilter === "all" ? markets : markets.filter((market) => market.status === statusFilter)),
    [markets, statusFilter],
  );
  const totals = useMemo(
    () => ({
      markets: markets.length,
      open: markets.filter((market) => market.status === "open").length,
      drafts: markets.filter((market) => market.status === "draft").length,
      pendingPools: markets.filter((market) => !market.poolActive).length,
    }),
    [markets],
  );

  useEffect(() => {
    setDraftForm(marketToForm(selectedMarket?.status === "draft" ? selectedMarket : null));
  }, [selectedMarket]);

  const refresh = async () => {
    if (previewMode) {
      setMessage("Visual preview only. Sign in as admin to refresh live market data.");
      return;
    }
    setBusyAction("refresh");
    setError("");
    try {
      const payload = await parseResponse<{ adminEmail?: string; markets: AdminMarket[] }>(
        await fetch("/api/admin/markets", { cache: "no-store" }),
      );
      setMarkets(payload.markets);
      setSelectedMarketId((current) => current || payload.markets[0]?.id || "");
      if (payload.adminEmail) setAdminAddress(payload.adminEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction("");
    }
  };

  useEffect(() => {
    if (previewMode) return;
    if (initialMarkets.length === 0) void refresh();
    // Initial load only; refresh is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seedMarkets = async () => {
    if (previewMode) {
      setMessage("Visual preview only. Sign in as admin to seed live markets.");
      return;
    }
    setBusyAction("seed");
    setError("");
    setMessage("");
    try {
      const payload = await parseResponse<{ markets: AdminMarket[] }>(
        await fetch("/api/admin/markets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "seed" }),
        }),
      );
      setMarkets(payload.markets);
      setSelectedMarketId((current) => current || payload.markets[0]?.id || "");
      setMessage("Production market seeds refreshed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction("");
    }
  };

  const createDraftMarket = async () => {
    if (previewMode) {
      setMessage("Visual preview only. Sign in as admin to create markets.");
      return;
    }
    setBusyAction("create");
    setError("");
    setMessage("");
    try {
      const payload = await parseResponse<{ market: AdminMarket; markets: AdminMarket[] }>(
        await fetch("/api/admin/markets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            ...draftForm,
            slug: draftForm.slug || slugify(draftForm.title),
            closesAt: isoFromInput(draftForm.closesAt),
            resolvesAt: draftForm.resolvesAt ? isoFromInput(draftForm.resolvesAt) : null,
            displayOrder: Number(draftForm.displayOrder || 100),
          }),
        }),
      );
      setMarkets(payload.markets);
      setSelectedMarketId(payload.market.id);
      setMessage("Draft market created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction("");
    }
  };

  const updateDraftMarket = async () => {
    if (!selectedMarket) return;
    if (previewMode) {
      setMessage("Visual preview only. Sign in as admin to update markets.");
      return;
    }
    setBusyAction(`update:${selectedMarket.id}`);
    setError("");
    setMessage("");
    try {
      const payload = await parseResponse<{ market: AdminMarket }>(
        await fetch(`/api/admin/markets/${selectedMarket.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            ...draftForm,
            closesAt: isoFromInput(draftForm.closesAt),
            resolvesAt: draftForm.resolvesAt ? isoFromInput(draftForm.resolvesAt) : null,
            displayOrder: Number(draftForm.displayOrder || 100),
          }),
        }),
      );
      setMarkets((current) => current.map((market) => (market.id === payload.market.id ? payload.market : market)));
      setMessage("Draft market updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction("");
    }
  };

  const openDraftMarket = async () => {
    if (!selectedMarket) return;
    if (previewMode) {
      setMessage("Visual preview only. Sign in as admin to open markets.");
      return;
    }
    setBusyAction(`open:${selectedMarket.id}`);
    setError("");
    setMessage("");
    try {
      const payload = await parseResponse<{ market: AdminMarket }>(
        await fetch(`/api/admin/markets/${selectedMarket.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "open" }),
        }),
      );
      setMarkets((current) => current.map((market) => (market.id === payload.market.id ? payload.market : market)));
      setMessage(`${payload.market.slug} opened for betting.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction("");
    }
  };

  const resolveMarket = async (market: AdminMarket) => {
    if (previewMode) {
      setMessage("Visual preview only. Sign in as admin to resolve markets.");
      return;
    }
    const outcome = selectedOutcomeByMarket[market.id];
    if (!outcome) return setError("Select YES or NO before resolving.");
    setBusyAction(`resolve:${market.id}`);
    setError("");
    setMessage("");
    try {
      await parseResponse(
        await fetch(`/api/admin/markets/${market.id}/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outcome,
            evidenceText: evidenceByMarket[market.id] ?? "",
          }),
        }),
      );
      setMessage(`${market.slug} resolved ${outcome}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction("");
    }
  };

  const updateMarketStatus = async (market: AdminMarket, action: "close" | "cancel") => {
    if (previewMode) {
      setMessage(`Visual preview only. Sign in as admin to ${action} markets.`);
      return;
    }
    setBusyAction(`${action}:${market.id}`);
    setError("");
    setMessage("");
    try {
      await parseResponse(
        await fetch(`/api/admin/markets/${market.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            reason: cancelReasonByMarket[market.id] ?? "",
          }),
        }),
      );
      setMessage(action === "close" ? `${market.slug} closed.` : `${market.slug} cancelled.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction("");
    }
  };

  const loadPayoutQueue = async (market: AdminMarket) => {
    if (previewMode) {
      setMessage("Visual preview only. Sign in as admin to load live payouts.");
      return;
    }
    setBusyAction(`load-payouts:${market.id}`);
    setError("");
    setMessage("");
    try {
      const payload = await parseResponse<{ payouts: AdminPayout[] }>(
        await fetch(`/api/admin/markets/${market.id}/payouts`, { cache: "no-store" }),
      );
      setPayoutQueueByMarket((current) => ({
        ...current,
        [market.id]: payload.payouts,
      }));
      setMessage(`${payload.payouts.length} payouts loaded for ${market.slug}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction("");
    }
  };

  const executePayouts = async (market: AdminMarket) => {
    if (previewMode) {
      setMessage("Visual preview only. Sign in as admin to execute payouts.");
      return;
    }
    const payoutIds = (payoutQueueByMarket[market.id] ?? []).map((payout) => payout.id);
    if (payoutIds.length === 0) return setError("Load payout queue before executing payouts.");
    setBusyAction(`payout:${market.id}`);
    setError("");
    setMessage("");
    try {
      let executedCount = 0;
      let consolidatedCount = 0;
      let remainingCount = payoutIds.length;
      const maxSteps = Math.min(250, Math.max(12, payoutIds.length * 4));
      for (let step = 0; step < maxSteps; step += 1) {
        const payload = await parseResponse<AdminPayoutExecutionResponse>(
          await fetch(`/api/admin/markets/${market.id}/payouts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payoutIds }),
          }),
        );
        executedCount += payload.executedCount ?? 0;
        consolidatedCount += payload.consolidatedCount ?? 0;
        remainingCount = payload.remainingCount ?? remainingCount;

        if (payload.payout?.status === "submitted" || payload.consolidation?.status === "submitted") {
          const submittedLabel = payload.payout?.status === "submitted"
            ? "payout submitted"
            : "consolidation submitted";
          setMessage(
            `${market.slug}: ${submittedLabel}; ${executedCount} payouts executed, ${consolidatedCount} consolidations confirmed. Retry once mining and indexing catch up.`,
          );
          return;
        }
        if (payload.completed || remainingCount === 0) {
          setMessage(
            `${market.slug}: ${executedCount} payouts executed, ${consolidatedCount} consolidations confirmed.`,
          );
          setPayoutQueueByMarket((current) => ({ ...current, [market.id]: [] }));
          await refresh();
          return;
        }
        if ((payload.executedCount ?? 0) === 0 && (payload.consolidatedCount ?? 0) === 0) {
          break;
        }
      }
      setMessage(
        `${market.slug}: ${executedCount} payouts executed, ${consolidatedCount} consolidations confirmed, ${remainingCount} payouts remaining.`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction("");
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f8f6] px-5 py-6 text-stone-950 md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-stone-200/80 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-stone-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              {adminAddress}
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-stone-950">Market Ops Console</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={`${actionButton} border border-stone-200/80 bg-[#fbfbfa] text-stone-700 hover:bg-white`}
              disabled={Boolean(busyAction)}
              onClick={() => void refresh()}
              type="button"
            >
              {busyAction === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
            <button
              className={`${actionButton} bg-stone-950 text-[#fbfbfa] hover:bg-stone-800`}
              disabled={Boolean(busyAction)}
              onClick={() => void seedMarkets()}
              type="button"
            >
              {busyAction === "seed" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sprout className="h-4 w-4" />}
              Seed Markets
            </button>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          {[
            ["Markets", totals.markets],
            ["Drafts", totals.drafts],
            ["Open", totals.open],
            ["Pool Pending", totals.pendingPools],
          ].map(([label, value]) => (
            <div key={label} className={`${panel} p-4`}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{label}</p>
              <p className="mt-2 text-2xl font-black tracking-tight text-stone-950">{value}</p>
            </div>
          ))}
        </section>

        <AdminStatusTabs active={statusFilter} markets={markets} onChange={setStatusFilter} />

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_430px]">
          <div className={`${panel} overflow-hidden`}>
            <div className="grid grid-cols-[minmax(0,1fr)_96px_96px_110px_40px] border-b border-stone-100 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400">
              <span>Market</span>
              <span className="text-right">YES</span>
              <span className="text-right">NO</span>
              <span className="text-right">Volume</span>
              <span />
            </div>
            {filteredMarkets.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm font-semibold text-stone-500">No markets in this status</div>
            ) : (
              filteredMarkets.map((market) => {
                const selected = selectedMarket?.id === market.id;
                return (
                  <button
                    key={market.id}
                    className={`grid w-full grid-cols-[minmax(0,1fr)_96px_96px_110px_40px] items-center gap-3 border-b border-stone-100 px-4 py-4 text-left transition last:border-b-0 ${
                      selected ? "bg-stone-50" : "bg-white hover:bg-stone-50/70"
                    }`}
                    onClick={() => setSelectedMarketId(market.id)}
                    type="button"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-stone-950">{market.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                        <span>{market.category}</span>
                        <span className="h-1 w-1 rounded-full bg-stone-300" />
                        <span>{market.status}</span>
                        <span className="h-1 w-1 rounded-full bg-stone-300" />
                        <span>{market.poolActive ? "pool active" : "pool pending"}</span>
                      </div>
                    </div>
                    <p className="text-right text-sm font-black text-emerald-700">
                      {formatProbability(market.odds.yesProbabilityBps)}
                    </p>
                    <p className="text-right text-sm font-black text-rose-700">
                      {formatProbability(market.odds.noProbabilityBps)}
                    </p>
                    <p className="text-right text-xs font-bold text-stone-700">{formatUnits(totalVolume(market))}</p>
                    <ChevronRight className="ml-auto h-4 w-4 text-stone-400" />
                  </button>
                );
              })
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <div className={`${panel} p-5`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">Selected Market Ops</p>
                  <h2 className="mt-1 text-xl font-black tracking-tight text-stone-950">
                    {selectedMarket?.slug ?? "No market selected"}
                  </h2>
                </div>
                <PanelRight className="h-5 w-5 text-stone-400" />
              </div>

              {selectedMarket ? (
                <div className="mt-5 space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={`${actionButton} border border-stone-200 bg-white text-stone-700 hover:bg-stone-50`}
                      disabled={Boolean(busyAction) || selectedMarket.status !== "draft"}
                      onClick={() => void openDraftMarket()}
                      type="button"
                    >
                      Open
                    </button>
                    <button
                      className={`${actionButton} border border-stone-200 bg-white text-stone-700 hover:bg-stone-50`}
                      disabled={Boolean(busyAction) || selectedMarket.status !== "open"}
                      onClick={() => void updateMarketStatus(selectedMarket, "close")}
                      type="button"
                    >
                      Close
                    </button>
                  </div>
                  <input
                    className="h-10 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm font-semibold text-stone-800 outline-none focus:border-stone-900 focus:bg-white"
                    onChange={(event) =>
                      setCancelReasonByMarket((current) => ({
                        ...current,
                        [selectedMarket.id]: event.target.value,
                      }))
                    }
                    placeholder="Cancel reason"
                    value={cancelReasonByMarket[selectedMarket.id] ?? ""}
                  />
                  <button
                    className={`${actionButton} w-full border border-red-100 bg-red-50 text-red-700 hover:bg-red-100`}
                    disabled={Boolean(busyAction)}
                    onClick={() => void updateMarketStatus(selectedMarket, "cancel")}
                    type="button"
                  >
                    Cancel market
                  </button>

                  <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-400">Resolution</p>
                    <div className="mt-3 grid grid-cols-[92px_1fr] gap-2">
                      <select
                        className="h-10 rounded-xl border border-stone-200 bg-white px-2 text-xs font-bold text-stone-800 outline-none"
                        onChange={(event) =>
                          setSelectedOutcomeByMarket((current) => ({
                            ...current,
                            [selectedMarket.id]: event.target.value as MarketOutcome,
                          }))
                        }
                        value={selectedOutcomeByMarket[selectedMarket.id] ?? ""}
                      >
                        <option value="">--</option>
                        <option value="YES">YES</option>
                        <option value="NO">NO</option>
                      </select>
                      <input
                        className="h-10 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-800 outline-none"
                        onChange={(event) =>
                          setEvidenceByMarket((current) => ({
                            ...current,
                            [selectedMarket.id]: event.target.value,
                          }))
                        }
                        placeholder="Evidence"
                        value={evidenceByMarket[selectedMarket.id] ?? ""}
                      />
                    </div>
                    <button
                      className={`${actionButton} mt-3 w-full bg-stone-950 text-white hover:bg-stone-800`}
                      disabled={Boolean(busyAction) || selectedMarket.status !== "closed"}
                      onClick={() => void resolveMarket(selectedMarket)}
                      type="button"
                      title="Resolve market"
                    >
                      {busyAction === `resolve:${selectedMarket.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Resolve
                    </button>
                  </div>

                  <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-400">Payout Queue</p>
                        <p className="mt-1 text-sm font-black text-stone-950">
                          {(payoutQueueByMarket[selectedMarket.id] ?? []).length} queued
                        </p>
                      </div>
                      <button
                        className={`${actionButton} border border-stone-200 bg-white text-stone-700 hover:bg-stone-50`}
                        disabled={Boolean(busyAction)}
                        onClick={() => void loadPayoutQueue(selectedMarket)}
                        type="button"
                      >
                        Load payouts
                      </button>
                    </div>
                    <button
                      className={`${actionButton} mt-3 w-full border border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
                      disabled={Boolean(busyAction)}
                      onClick={() => void executePayouts(selectedMarket)}
                      type="button"
                    >
                      Execute payouts
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-5 text-sm font-semibold text-stone-500">Select a market from the table.</p>
              )}
            </div>

            <div className={`${panel} p-5`}>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">Draft Market</p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-stone-950">
                {selectedMarket?.status === "draft" ? "Edit draft" : "Create draft"}
              </h2>
              <div className="mt-5 space-y-3">
                <input
                  className="h-11 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm font-semibold outline-none focus:border-stone-900 focus:bg-white"
                  onChange={(event) =>
                    setDraftForm((current) => ({
                      ...current,
                      title: event.target.value,
                      slug: current.slug || slugify(event.target.value),
                    }))
                  }
                  placeholder="Market title"
                  value={draftForm.title}
                />
                <input
                  className="h-11 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm font-semibold outline-none focus:border-stone-900 focus:bg-white"
                  onChange={(event) => setDraftForm((current) => ({ ...current, slug: event.target.value }))}
                  placeholder="market-slug"
                  value={draftForm.slug}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="h-11 rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm font-semibold outline-none focus:border-stone-900 focus:bg-white"
                    onChange={(event) => setDraftForm((current) => ({ ...current, category: event.target.value }))}
                    placeholder="Category"
                    value={draftForm.category}
                  />
                  <input
                    className="h-11 rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm font-semibold outline-none focus:border-stone-900 focus:bg-white"
                    onChange={(event) => setDraftForm((current) => ({ ...current, displayOrder: event.target.value }))}
                    placeholder="Display order"
                    value={draftForm.displayOrder}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="h-11 rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm font-semibold outline-none focus:border-stone-900 focus:bg-white"
                    onChange={(event) => setDraftForm((current) => ({ ...current, closesAt: event.target.value }))}
                    type="datetime-local"
                    value={draftForm.closesAt}
                  />
                  <input
                    className="h-11 rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm font-semibold outline-none focus:border-stone-900 focus:bg-white"
                    onChange={(event) => setDraftForm((current) => ({ ...current, resolvesAt: event.target.value }))}
                    type="datetime-local"
                    value={draftForm.resolvesAt}
                  />
                </div>
                <textarea
                  className="min-h-20 w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-sm font-semibold outline-none focus:border-stone-900 focus:bg-white"
                  onChange={(event) => setDraftForm((current) => ({ ...current, rules: event.target.value }))}
                  placeholder="Resolution rules"
                  value={draftForm.rules}
                />
                <input
                  className="h-11 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm font-semibold outline-none focus:border-stone-900 focus:bg-white"
                  onChange={(event) => setDraftForm((current) => ({ ...current, resolutionSource: event.target.value }))}
                  placeholder="Resolution source"
                  value={draftForm.resolutionSource}
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className={`${actionButton} border border-stone-200 bg-white text-stone-700 hover:bg-stone-50`}
                    disabled={Boolean(busyAction) || selectedMarket?.status !== "draft"}
                    onClick={() => void updateDraftMarket()}
                    type="button"
                  >
                    Update Draft
                  </button>
                  <button
                    className={`${actionButton} bg-stone-950 text-white hover:bg-stone-800`}
                    disabled={Boolean(busyAction)}
                    onClick={() => void createDraftMarket()}
                    type="button"
                  >
                    Create Draft
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </section>

        {(message || error) && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
              error ? "border-red-100 bg-red-50 text-red-700" : "border-emerald-100 bg-emerald-50 text-emerald-800"
            }`}
          >
            {error || message}
          </div>
        )}
      </div>
    </main>
  );
}
