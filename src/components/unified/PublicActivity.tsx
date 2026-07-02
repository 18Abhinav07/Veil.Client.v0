"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WalletSecrets } from "@/lib/vaultCrypto";
import { formatStellarUnits } from "@/lib/publicWalletCore";
import { ArrowRightLeft, CheckCircle2, Clock, ExternalLink, Loader2, Send } from "lucide-react";
import { useWalletRealtimeEvent } from "./WalletRealtimeProvider";

interface PublicActivityProps {
  wallet: WalletSecrets;
  initialTransactions?: PublicTransactionView[];
}

interface PublicTransactionView {
  id: string;
  sourcePublicKey: string;
  destinationPublicKey: string | null;
  kind: "payment" | "trustline" | "swap" | "funding";
  assetCode: string | null;
  amountUnits: string | null;
  txHash: string;
  ledger: number | null;
  status: "pending" | "submitted" | "confirmed" | "failed";
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
  return data as T;
}

function shortHash(value: string) {
  return value.length <= 18 ? value : `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function transactionTitle(item: PublicTransactionView) {
  if (item.kind === "swap") return "Swap";
  if (item.kind === "trustline") return "USDC trustline";
  if (item.kind === "funding") return "Funding";
  return "Public send";
}

function transactionAmount(item: PublicTransactionView) {
  if (!item.amountUnits || !item.assetCode) return item.assetCode ?? "USDC";
  return formatStellarUnits(item.amountUnits, item.assetCode);
}

function transactionIcon(item: PublicTransactionView) {
  if (item.kind === "swap") return <ArrowRightLeft className="h-4 w-4" />;
  if (item.kind === "payment") return <Send className="h-4 w-4" />;
  return <CheckCircle2 className="h-4 w-4" />;
}

export default function PublicActivity({
  wallet,
  initialTransactions,
}: PublicActivityProps) {
  const [transactions, setTransactions] = useState<PublicTransactionView[]>(initialTransactions ?? []);
  const [loading, setLoading] = useState(initialTransactions === undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const data = await parseResponse<{ transactions: PublicTransactionView[] }>(
        await fetch("/api/wallet/public/transactions", { cache: "no-store" }),
      );
      setTransactions(data.transactions);
      setError("");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleManualRefresh = useCallback(() => {
    setRefreshing(true);
    refresh().finally(() => setRefreshing(false));
  }, [refresh]);

  useEffect(() => {
    if (initialTransactions !== undefined) {
      setTransactions(initialTransactions);
      setLoading(false);
    }
    void refresh();
  }, [initialTransactions, refresh]);

  useWalletRealtimeEvent(
    useCallback(
      (event) => {
        const eventType = String(event.data.eventType ?? "");
        if (event.event === "wallet_activity" && eventType.startsWith("public_")) {
          void refresh();
        }
      },
      [refresh],
    ),
  );

  const visibleTransactions = useMemo(
    () =>
      transactions.filter(
        (item) =>
          item.sourcePublicKey === wallet.stellarPublicKey ||
          item.destinationPublicKey === wallet.stellarPublicKey ||
          item.sourcePublicKey,
      ),
    [transactions, wallet.stellarPublicKey],
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-stone-950">Public Activity</h2>
          <p className="mt-2 text-sm text-stone-600">Confirmed public Stellar actions for this wallet.</p>
        </div>
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={loading || refreshing}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-xs font-bold text-stone-800 shadow-sm transition-all hover:border-stone-300 hover:bg-stone-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
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

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-stone-200 bg-white">
          <Loader2 className="h-5 w-5 animate-spin text-stone-500" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-800">
          {error}
        </div>
      ) : visibleTransactions.length === 0 ? (
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-500">
            <Clock className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-stone-900">No public transactions yet</h3>
          <p className="mt-2 max-w-sm text-sm text-stone-500">
            Public sends, swaps, and trustline updates will appear here after they are confirmed.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          {visibleTransactions.map((item) => (
            <article
              key={item.id}
              className="grid gap-4 border-b border-stone-100 p-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_160px]"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-700">
                  {transactionIcon(item)}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-stone-950">{transactionTitle(item)}</h3>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-stone-500">
                    {item.destinationPublicKey
                      ? `To ${shortHash(item.destinationPublicKey)}`
                      : `From ${shortHash(item.sourcePublicKey)}`}
                  </p>
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${item.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-stone-600 hover:text-stone-950"
                  >
                    {shortHash(item.txHash)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
              <div className="text-left md:text-right">
                <p className="text-sm font-semibold text-stone-950">{transactionAmount(item)}</p>
                <p className="mt-1 text-xs text-stone-500">{formatDate(item.createdAt)}</p>
                {item.ledger !== null && (
                  <p className="mt-1 font-mono text-[11px] text-stone-400">Ledger {item.ledger}</p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
