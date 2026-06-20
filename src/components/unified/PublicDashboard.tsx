"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { formatStellarUnits, type PublicWalletState } from "@/lib/publicWalletCore";
import { signStellarPayload } from "@/lib/walletSigner";
import type { WalletSecrets } from "@/lib/vaultCrypto";
import { 
  ArrowUpRight, 
  Plus, 
  Download, 
  Copy, 
  Check, 
  TrendingUp, 
  TrendingDown, 
  ArrowRightLeft,
  Coins,
  Send,
  Loader2,
  Eye,
  EyeOff,
  Search,
  ExternalLink,
  BookUser
} from "lucide-react";

interface ContactView {
  id: string;
  otherEmail: string | null;
  otherHandle: string | null;
  otherStellarPublicKey: string | null;
  status: string;
}

interface PublicDashboardProps {
  wallet: WalletSecrets;
  openDrawer: (content: React.ReactNode) => void;
  initialWalletState?: PublicWalletState | null;
  initialMarketState?: PublicMarketState | null;
  initialContacts?: ContactView[];
}

interface PreparedTransaction {
  unsignedXdr: string;
  signingPayloadBase64: string;
  networkPassphrase: string;
  swapQuote?: {
    sendAmount: string;
    estimatedReceive?: string;
    minimumReceive?: string;
    slippageBps: number;
  };
}

interface PublicMarketPoint {
  time: string;
  price: number;
}

interface PublicMarketState {
  pair: string;
  source: string;
  latest: number | null;
  changePct: number | null;
  points: PublicMarketPoint[];
  updatedAt: string;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
  return data as T;
}

function shortKey(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

// CDN Logos for high-end look
const USDC_LOGO = "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdc.png";
const XLM_LOGO = "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/xlm.png";

export default function PublicDashboard({
  wallet,
  openDrawer,
  initialWalletState,
  initialMarketState,
  initialContacts,
}: PublicDashboardProps) {
  const [walletState, setWalletState] = useState<PublicWalletState | null>(initialWalletState ?? null);
  const [marketState, setMarketState] = useState<PublicMarketState | null>(initialMarketState ?? null);
  const [marketError, setMarketError] = useState("");
  const [copied, setCopied] = useState(false);
  const [fundingFriendbot, setFundingFriendbot] = useState(false);
  const [enablingUsdc, setEnablingUsdc] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [sendingPayment, setSendingPayment] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const busy = fundingFriendbot || enablingUsdc || swapping || sendingPayment || refreshing;
  const [hideBalance, setHideBalance] = useState(false);

  // Form states
  const [activeFormTab, setActiveFormTab] = useState<"swap" | "send">("swap");
  
  // Swap form states
  const [swapSellAmount, setSwapSellAmount] = useState("");
  const [swapBuyAmount, setSwapBuyAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState("100");
  
  // Send form states
  const [sendAsset, setSendAsset] = useState<"USDC" | "XLM">("USDC");
  const [sendDestination, setSendDestination] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [contactOptions, setContactOptions] = useState<ContactView[]>(
    () => (initialContacts ?? []).filter((contact) => contact.status === "accepted"),
  );

  const refreshContacts = useCallback(async () => {
    try {
      const data = await parseResponse<{ contacts: ContactView[] }>(
        await fetch("/api/wallet/contacts", { cache: "no-store" }),
      );
      setContactOptions(data.contacts.filter((contact) => contact.status === "accepted"));
    } catch {
      setContactOptions([]);
    }
  }, []);

  useEffect(() => {
    if (initialContacts !== undefined) {
      setContactOptions(initialContacts.filter((contact) => contact.status === "accepted"));
      return;
    }
    void refreshContacts();
  }, [initialContacts, refreshContacts]);

  const address = wallet.stellarPublicKey;

  // Raw numeric balances
  const xlmRaw = useMemo(() => {
    if (!walletState?.xlmUnits) return 0;
    return Number(formatStellarUnits(walletState.xlmUnits, "").split(" ")[0]);
  }, [walletState]);

  const usdcRaw = useMemo(() => {
    if (!walletState?.usdcUnits) return 0;
    return Number(formatStellarUnits(walletState.usdcUnits, "").split(" ")[0]);
  }, [walletState]);

  // Formatted balances
  const xlmFormatted = useMemo(() => formatStellarUnits(walletState?.xlmUnits ?? "0", "XLM"), [walletState]);
  const usdcFormatted = useMemo(() => formatStellarUnits(walletState?.usdcUnits ?? "0", "USDC"), [walletState]);

  // USD calculations
  const xlmPrice = marketState?.latest ?? 0.172;
  const xlmValueUsd = xlmRaw * xlmPrice;
  const usdcValueUsd = usdcRaw; // USDC is pegged to $1
  const totalValueUsd = usdcValueUsd + xlmValueUsd;
  const swapSlippageBps = Number(slippageBps);
  const swapMinimumReceive = useMemo(() => {
    const estimate = Number(swapBuyAmount || 0);
    if (!Number.isFinite(estimate) || estimate <= 0) return "0.000000";
    const minimum = estimate * ((10000 - swapSlippageBps) / 10000);
    return minimum.toFixed(6);
  }, [swapBuyAmount, swapSlippageBps]);

  const refreshWallet = useCallback(async () => {
    try {
      const response = await fetch(`/api/wallet/public/account?address=${encodeURIComponent(address)}`, { cache: "no-store" });
      const next = await parseResponse<PublicWalletState>(response);
      setWalletState(next);
    } catch (err) {
      console.error(err);
    }
  }, [address]);

  const refreshMarket = useCallback(async () => {
    try {
      const response = await fetch("/api/wallet/public/market", { cache: "no-store" });
      const next = await parseResponse<PublicMarketState>(response);
      setMarketState(next);
      setMarketError("");
    } catch (err) {
      setMarketError(String(err));
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setErrorMsg("");
    setStatusMsg("");
    setRefreshing(true);
    try {
      await Promise.all([refreshWallet(), refreshMarket()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshWallet, refreshMarket]);

  useEffect(() => {
    if (initialWalletState !== undefined) {
      setWalletState(initialWalletState);
    }
  }, [initialWalletState]);

  useEffect(() => {
    if (initialMarketState !== undefined) {
      setMarketState(initialMarketState);
    }
  }, [initialMarketState]);

  useEffect(() => {
    if (initialWalletState === undefined && initialMarketState === undefined) {
      void refreshAll();
      return;
    }
    if (initialWalletState === undefined) {
      void refreshWallet();
    }
    if (initialMarketState === undefined || initialMarketState === null) {
      void refreshMarket();
    }
  }, [initialMarketState, initialWalletState, refreshAll, refreshMarket, refreshWallet]);

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const fundWithFriendbot = async () => {
    setFundingFriendbot(true);
    setErrorMsg("");
    setStatusMsg("Requesting testnet XLM from Friendbot...");
    try {
      await fetch("/api/wallet/public/friendbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      await refreshWallet();
      setStatusMsg("Success! Wallet funded with testnet XLM.");
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setFundingFriendbot(false);
    }
  };

  const addUsdcTrustline = async () => {
    setEnablingUsdc(true);
    setErrorMsg("");
    setStatusMsg("Establishing USDC trustline...");
    try {
      const prepared = await parseResponse<PreparedTransaction>(
        await fetch("/api/wallet/public/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: "prepare",
            source: address,
            action: "changeTrust",
          }),
        }),
      );
      const signature = signStellarPayload({
        stellarSecretKey: wallet.stellarSecretKey,
        payloadBase64: prepared.signingPayloadBase64,
      });
      await parseResponse(
        await fetch("/api/wallet/public/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: "submit",
            source: address,
            unsignedXdr: prepared.unsignedXdr,
            signatureBase64: signature.signatureBase64,
          }),
        }),
      );
      await refreshWallet();
      setStatusMsg("Success! USDC trustline established.");
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setEnablingUsdc(false);
    }
  };

  const handleSendPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingPayment(true);
    setErrorMsg("");
    setStatusMsg(`Sending ${sendAmount} ${sendAsset}...`);
    try {
      const prepared = await parseResponse<PreparedTransaction>(
        await fetch("/api/wallet/public/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: "prepare",
            source: address,
            action: "payment",
            destination: sendDestination.trim(),
            asset: sendAsset,
            amount: sendAmount.trim(),
          }),
        }),
      );
      const signature = signStellarPayload({
        stellarSecretKey: wallet.stellarSecretKey,
        payloadBase64: prepared.signingPayloadBase64,
      });
      await parseResponse(
        await fetch("/api/wallet/public/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: "submit",
            source: address,
            unsignedXdr: prepared.unsignedXdr,
            signatureBase64: signature.signatureBase64,
          }),
        }),
      );
      setSendDestination("");
      setSendAmount("");
      await refreshWallet();
      setStatusMsg("Success! Payment sent.");
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setSendingPayment(false);
    }
  };

  const handleSwapTokens = async (e: React.FormEvent) => {
    e.preventDefault();
    setSwapping(true);
    setErrorMsg("");
    setStatusMsg(`Preparing live XLM to USDC quote for ${swapSellAmount} XLM...`);
    try {
      const prepared = await parseResponse<PreparedTransaction>(
        await fetch("/api/wallet/public/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: "prepare",
            source: address,
            action: "swapXlmToUsdc",
            amount: swapSellAmount.trim(),
            slippageBps: Number(slippageBps),
          }),
        }),
      );
      if (prepared.swapQuote?.estimatedReceive) {
        setSwapBuyAmount(prepared.swapQuote.estimatedReceive);
        setStatusMsg(
          `Swapping ${prepared.swapQuote.sendAmount} XLM. Minimum receive ${prepared.swapQuote.minimumReceive} USDC.`,
        );
      }
      const signature = signStellarPayload({
        stellarSecretKey: wallet.stellarSecretKey,
        payloadBase64: prepared.signingPayloadBase64,
      });
      await parseResponse(
        await fetch("/api/wallet/public/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: "submit",
            source: address,
            unsignedXdr: prepared.unsignedXdr,
            signatureBase64: signature.signatureBase64,
          }),
        }),
      );
      setSwapSellAmount("");
      setSwapBuyAmount("");
      await refreshWallet();
      setStatusMsg("Success! Swap completed.");
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setSwapping(false);
    }
  };

  const setPercentAmount = (percent: number) => {
    if (activeFormTab === "send") {
      const max = sendAsset === "USDC" ? usdcRaw : xlmRaw;
      setSendAmount((max * percent).toFixed(6));
    } else {
      const amount = maxSpendableSwapXlm() * percent;
      setSwapSellAmount(amount.toFixed(6));
      setSwapBuyAmount((amount * xlmPrice).toFixed(6));
    }
  };

  const maxSpendableSwapXlm = () => {
    return Math.max(xlmRaw - 1, 0);
  };

  const sparklinePoints = useMemo(() => {
    if (!marketState?.points || marketState.points.length === 0) return [];
    return marketState.points;
  }, [marketState]);

  const pricePath = useMemo(() => {
    if (sparklinePoints.length < 2) return "";
    const prices = sparklinePoints.map(p => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const height = 120;
    const width = 600;
    return sparklinePoints.map((p, idx) => {
      const x = (idx / (sparklinePoints.length - 1)) * width;
      const y = height - ((p.price - min) / range) * height;
      return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");
  }, [sparklinePoints]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] max-w-[1600px] w-full mx-auto px-4 lg:px-6 lg:h-[calc(100vh-112px)] min-h-[calc(100vh-112px)] items-stretch">
      
      {/* LEFT COLUMN - Portfolio Details */}
      <div className="flex flex-col gap-4 lg:h-full lg:max-h-full lg:overflow-y-auto no-scrollbar min-h-0">
        
        {/* BANNER BALANCE CARD (Clean and Minimal Yellow Style) */}
        <div className="relative overflow-hidden rounded-3xl border border-yellow-200/60 bg-gradient-to-br from-yellow-50/70 to-[#FFFADB] p-5 lg:p-6 shadow-sm shrink-0">
          {/* Large elegant subtle background dollar sign */}
          <div className="absolute right-6 top-1/2 -translate-y-1/2 select-none opacity-[0.06] text-[180px] font-black text-yellow-950 pointer-events-none leading-none">
            $
          </div>

          <div className="relative flex flex-col justify-between h-full min-h-[120px]">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-yellow-800/70">
                    Portfolio Value
                  </span>
                  <button 
                    onClick={() => setHideBalance(!hideBalance)}
                    className="text-yellow-700/60 hover:text-yellow-900 transition"
                  >
                    {hideBalance ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                
                <h1 className="mt-2 text-4xl lg:text-5xl font-bold tracking-tight text-stone-900 font-mono">
                  {hideBalance ? "••••••" : `$${totalValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </h1>

                <p className="mt-2 text-[11px] font-semibold text-yellow-800/80">
                  {marketState?.changePct !== null && marketState?.changePct !== undefined ? (
                    <span className="flex items-center">
                      {marketState.changePct >= 0 ? "+" : ""}
                      {marketState.changePct.toFixed(2)}% (24h)
                    </span>
                  ) : (
                    "Stellar Testnet Live"
                  )}
                </p>
              </div>
            </div>

            {/* Quick Actions at Bottom of Yellow Banner */}
            <div className="mt-6 flex flex-wrap gap-2.5">
              <button 
                type="button"
                onClick={refreshAll}
                disabled={busy}
                className="flex items-center justify-center min-w-[80px] gap-1.5 rounded-xl bg-stone-900 px-4 py-2.5 text-xs font-bold text-white transition-all hover:bg-stone-800 active:scale-95 disabled:opacity-50"
              >
                {refreshing ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    <span>Refreshing...</span>
                  </>
                ) : (
                  <span>Refresh</span>
                )}
              </button>

              <button 
                onClick={fundWithFriendbot}
                disabled={busy}
                className="flex items-center justify-center min-w-[140px] gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-stone-850 border border-yellow-200 shadow-sm hover:bg-yellow-50/50 transition active:scale-95 disabled:opacity-50"
              >
                {fundingFriendbot ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Funding...</span>
                  </>
                ) : (
                  <span>Deposit (Friendbot)</span>
                )}
              </button>

              {!walletState?.hasUsdcTrustline && (
                <button 
                  onClick={addUsdcTrustline}
                  disabled={busy}
                  className="flex items-center justify-center min-w-[110px] gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-stone-850 border border-yellow-200 shadow-sm hover:bg-yellow-50/50 transition-all active:scale-95 disabled:opacity-50"
                >
                  {enablingUsdc ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Enabling...</span>
                    </>
                  ) : (
                    <span>Enable USDC</span>
                  )}
                </button>
              )}

              <button 
                onClick={copyAddress}
                className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-stone-850 border border-yellow-200 shadow-sm hover:bg-yellow-50/50 transition active:scale-95"
              >
                {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy Address"}
              </button>
            </div>
          </div>
        </div>

        {/* ASSETS SECTION (Real Token Logos) */}
        <div className="rounded-3xl border border-stone-200/80 bg-white p-5 shadow-sm shrink-0">
          <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-4">Assets</h3>
          
          <div className="divide-y divide-stone-100">
            {/* USDC Row */}
            <div className="py-4 flex items-center justify-between group hover:bg-stone-50/40 rounded-2xl px-3 -mx-3 transition">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-50 border border-stone-100 shrink-0 p-1">
                  <img src={USDC_LOGO} alt="USDC Logo" className="w-full h-full object-contain" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-sm text-stone-900">USD Coin</p>
                    <span className="text-[10px] font-bold text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded-md">USDC</span>
                  </div>
                  <p className="text-[10px] font-medium text-stone-400 mt-0.5">
                    {walletState?.hasUsdcTrustline ? "Trustline Ready" : "Trustline Needed"}
                  </p>
                </div>
              </div>
              
              {walletState?.hasUsdcTrustline ? (
                <div className="text-right">
                  <p className="font-semibold text-sm text-stone-900 font-mono">
                    {hideBalance ? "••••" : usdcFormatted.split(" ")[0]}
                  </p>
                  <p className="text-[10px] font-medium text-stone-400 mt-0.5 font-mono">
                    {hideBalance ? "••••" : `$${usdcValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={addUsdcTrustline}
                  disabled={busy}
                  className="inline-flex h-8 items-center justify-center min-w-[70px] rounded-lg bg-stone-900 px-3 text-[10px] font-bold uppercase tracking-widest text-white transition-all active:scale-95 disabled:opacity-50 shadow-sm"
                >
                  {enablingUsdc ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <span>Enable</span>
                  )}
                </button>
              )}
            </div>

            {/* XLM Row */}
            <div className="py-4 flex items-center justify-between group hover:bg-stone-50/40 rounded-2xl px-3 -mx-3 transition">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-50 border border-stone-100 shrink-0 p-1">
                  <img src={XLM_LOGO} alt="XLM Logo" className="w-full h-full object-contain" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-sm text-stone-900">Stellar Lumens</p>
                    <span className="text-[10px] font-bold text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded-md">XLM</span>
                  </div>
                  <p className="text-[10px] font-medium text-stone-400 mt-0.5">Native Network Fee Asset</p>
                </div>
              </div>
              
              <div className="text-right">
                <p className="font-semibold text-sm text-stone-900 font-mono">
                  {hideBalance ? "••••" : xlmFormatted.split(" ")[0]}
                </p>
                <p className="text-[10px] font-medium text-stone-400 mt-0.5 font-mono">
                  {hideBalance ? "••••" : `$${xlmValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* MARKET PRICE CHART */}
        <div className="rounded-3xl border border-stone-200/80 bg-white p-5 shadow-sm flex flex-col justify-between flex-1 min-h-0">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-stone-400">Market Feed</h4>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="text-lg font-bold tracking-tight text-stone-900">
                  {marketState?.latest ? `${marketState.latest.toFixed(4)} USDC` : "--"}
                </span>
                {marketState?.changePct !== null && (
                  <span className={`flex items-center text-xs font-semibold ${marketState?.changePct && marketState.changePct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {marketState?.changePct && marketState.changePct >= 0 ? <TrendingUp size={12} className="mr-0.5" /> : <TrendingDown size={12} className="mr-0.5" />}
                    {marketState?.changePct ? `${marketState.changePct.toFixed(2)}%` : "--"}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 p-0.5">
              <span className="px-2 py-1 text-[10px] font-bold text-stone-900 bg-white rounded shadow-sm">XLM / USDC</span>
            </div>
          </div>

          <div className="mt-5 flex-1 w-full flex items-center justify-center bg-stone-50/50 rounded-2xl relative overflow-hidden min-h-[120px]">
            {marketError ? (
              <p className="text-xs text-rose-500 font-medium">{marketError}</p>
            ) : sparklinePoints.length > 1 ? (
              <svg viewBox="0 0 600 120" className="w-full h-full overflow-visible px-2 text-stone-300">
                <path
                  d={pricePath}
                  fill="none"
                  stroke="#1c1917"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-stone-400 font-medium animate-pulse">
                <Loader2 size={12} className="animate-spin" />
                <span>Reading market feed...</span>
              </div>
            )}
          </div>
        </div>

      {/* Dynamic Toast Alert (Floated, high z-index, non-blocking) */}
      {(statusMsg || errorMsg) && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl shadow-xl border p-4 bg-white/95 backdrop-blur-md animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white ${
              errorMsg ? "bg-red-650" : "bg-emerald-650"
            }`}>
              {errorMsg ? "!" : "✓"}
            </div>
            <div className="flex-1">
              <p className={`text-xs font-bold ${errorMsg ? "text-red-950" : "text-emerald-950"}`}>
                {errorMsg ? "System Alert" : "Process Update"}
              </p>
              <p className="mt-1 text-xs leading-5 text-stone-600">
                {errorMsg || statusMsg}
              </p>
            </div>
            <button
              onClick={() => {
                setErrorMsg("");
                setStatusMsg("");
              }}
              className="text-stone-400 hover:text-stone-600 transition shrink-0 ml-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      </div>

      {/* RIGHT COLUMN - SWAP & SEND WIDGET */}
      <div className="overflow-y-auto no-scrollbar flex flex-col lg:h-full w-full lg:max-h-[calc(100vh-112px)] p-1 min-h-0">
        
        {/* Toggle Headings (Premium Pill toggle style matching TopHeader) */}
        <div className="flex justify-center mb-6 shrink-0">
          <div className="relative flex h-9.5 items-center rounded-full bg-stone-100/60 p-0.5">
            <button
              type="button"
              onClick={() => setActiveFormTab("swap")}
              className="relative z-10 flex h-full w-28 items-center justify-center rounded-full text-xs font-bold tracking-wide transition-colors duration-200"
              style={{ color: activeFormTab === "swap" ? "#0c0a09" : "#7c726a" }}
            >
              Swap
              {activeFormTab === "swap" && (
                <motion.div
                  layoutId="public-tab-indicator"
                  className="absolute inset-0 -z-10 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                  transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}
                />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveFormTab("send")}
              className="relative z-10 flex h-full w-28 items-center justify-center rounded-full text-xs font-bold tracking-wide transition-colors duration-200"
              style={{ color: activeFormTab === "send" ? "#0c0a09" : "#7c726a" }}
            >
              Send
              {activeFormTab === "send" && (
                <motion.div
                  layoutId="public-tab-indicator"
                  className="absolute inset-0 -z-10 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                  transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}
                />
              )}
            </button>
          </div>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col min-h-0">
          <div className="my-auto w-full">
          {activeFormTab === "swap" ? (
            <form onSubmit={handleSwapTokens} className="space-y-6">
              
              {/* SELL COMPONENT */}
              <div className="rounded-xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-stone-100 relative">
                <div className="flex justify-between items-center text-[10px] font-bold tracking-wider text-stone-400">
                  <span>YOU SELL</span>
                  <span>BALANCE: {xlmFormatted.split(" ")[0]}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-4">
                  <input 
                    type="text" 
                    placeholder="0"
                    value={swapSellAmount}
                    onChange={(e) => {
                      setSwapSellAmount(e.target.value);
                      setSwapBuyAmount((Number(e.target.value) * xlmPrice).toFixed(6));
                    }}
                    className="bg-transparent text-2xl font-semibold outline-none text-stone-900 placeholder:text-stone-300 w-full font-mono mt-1"
                  />
                  <div className="flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-1 font-semibold text-xs text-stone-850 shrink-0">
                    <img src={XLM_LOGO} alt="" className="w-4 h-4 object-contain" />
                    <span>XLM</span>
                  </div>
                </div>
                <div className="mt-2 text-xs text-stone-400 font-mono">
                  ${(Number(swapSellAmount || 0) * xlmPrice).toFixed(2)}
                </div>
              </div>

              {/* DIRECTION INDICATOR */}
              <div className="flex justify-center -my-3.5 relative z-10">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-900 text-white shadow-md hover:bg-stone-800 transition active:scale-95 border-4 border-white"
                >
                  <ArrowRightLeft size={14} className="rotate-90" />
                </div>
              </div>

              {/* BUY COMPONENT */}
              <div className="rounded-xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-stone-100 relative">
                <div className="flex justify-between items-center text-[10px] font-bold tracking-wider text-stone-400">
                  <span>ESTIMATED RECEIVE</span>
                  <span>BALANCE: {usdcFormatted.split(" ")[0]}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-4">
                  <input 
                    type="text" 
                    placeholder="0"
                    value={swapBuyAmount}
                    readOnly
                    className="bg-transparent text-2xl font-semibold outline-none text-stone-900 placeholder:text-stone-300 w-full font-mono mt-1"
                  />
                  <div className="flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-1 font-semibold text-xs text-stone-850 shrink-0">
                    <img src={USDC_LOGO} alt="" className="w-4 h-4 object-contain" />
                    <span>USDC</span>
                  </div>
                </div>
                <div className="mt-2 text-xs text-stone-400 font-mono">
                  ${Number(swapBuyAmount || 0).toFixed(2)}
                </div>
              </div>

              <div className="rounded-xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-stone-100 text-xs text-stone-500 space-y-3">
                <div className="flex items-center justify-between">
                  <span>Minimum receive</span>
                  <span className="font-mono font-semibold text-stone-900">
                    {swapMinimumReceive} USDC
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span>Slippage</span>
                  <div className="grid grid-cols-3 gap-1 rounded-lg bg-stone-100/70 p-0.5">
                    {[
                      ["50", "0.5%"],
                      ["100", "1%"],
                      ["200", "2%"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSlippageBps(value)}
                        className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                          slippageBps === value
                            ? "bg-stone-950 text-white shadow-sm"
                            : "text-stone-500 hover:bg-white hover:text-stone-900"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-3 leading-5">
                  VEIL sells the exact XLM amount and signs a fresh Stellar quote with this minimum receive.
                </p>
              </div>

              {/* PERCENTAGE HOTKEYS */}
              <div className="grid grid-cols-4 gap-2.5">
                {([0.25, 0.5, 0.75, 1] as const).map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setPercentAmount(pct)}
                    className="h-10 rounded-xl bg-stone-100/60 text-xs font-semibold text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-all"
                  >
                    {pct === 1 ? "Max" : `${pct * 100}%`}
                  </button>
                ))}
              </div>

              {/* ACTION SUBMIT BUTTON */}
              <button
                type="submit"
                disabled={busy || !walletState?.exists || !walletState.hasUsdcTrustline || !swapSellAmount}
                className="w-full h-12 mt-4 rounded-xl bg-stone-950 text-white font-bold text-xs uppercase tracking-widest hover:bg-stone-800 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {swapping ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>{statusMsg || "Executing Swap..."}</span>
                  </>
                ) : (
                  <span>Execute Swap</span>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSendPayment} className="space-y-6">
              
              {/* ASSET PICKER */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2">Select Asset</label>
                <div className="grid grid-cols-2 gap-1 rounded-full bg-stone-100/60 p-0.5">
                  {(["USDC", "XLM"] as const).map((ast) => (
                    <button
                      key={ast}
                      type="button"
                      onClick={() => setSendAsset(ast)}
                      className={`h-8.5 rounded-full text-xs font-bold uppercase transition ${
                        sendAsset === ast ? "bg-stone-950 text-white shadow-sm" : "text-stone-500 hover:text-stone-850"
                      }`}
                    >
                      {ast}
                    </button>
                  ))}
                </div>
              </div>

              {/* FORM FIELDS WRAPPER CARD */}
              <div className="rounded-xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-stone-100 space-y-5">
                
                {/* RECIPIENT INPUT */}
                <div>
                  <label htmlFor="recipient-addr" className="block text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2">Recipient: email, @user id, or Stellar address</label>
                  <div className="flex gap-2">
                    <input
                      id="recipient-addr"
                      type="text"
                      placeholder="name@example.com, @handle, or G..."
                      required
                      value={sendDestination}
                      onChange={(e) => setSendDestination(e.target.value)}
                      className="w-full h-12 px-4 rounded-xl border border-stone-200 bg-white text-sm font-mono focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10 focus:outline-none placeholder:text-stone-400 transition-all"
                    />
                    {contactOptions.length > 0 && (
                      <div className="relative h-12 w-12 shrink-0">
                        <select
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                          onChange={(e) => {
                            const contact = contactOptions.find((c) => c.id === e.target.value);
                            if (contact) {
                              setSendDestination(contact.otherStellarPublicKey ?? contact.otherEmail ?? "");
                            }
                            e.target.value = "";
                          }}
                          value=""
                        >
                          <option value="">Contacts</option>
                          {contactOptions.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.otherHandle ? `@${c.otherHandle}` : c.otherEmail ?? shortKey(c.otherStellarPublicKey ?? "")}
                            </option>
                          ))}
                        </select>
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                          <BookUser size={18} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* AMOUNT INPUT */}
                <div>
                  <div className="flex justify-between items-center text-[10px] font-bold tracking-wider text-stone-400 mb-2">
                    <label htmlFor="send-amt">Amount</label>
                    <span>BALANCE: {sendAsset === "USDC" ? usdcFormatted.split(" ")[0] : xlmFormatted.split(" ")[0]}</span>
                  </div>
                  <input
                    id="send-amt"
                    type="text"
                    placeholder="0.00"
                    required
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl border border-stone-200 bg-white text-sm focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10 focus:outline-none placeholder:text-stone-400 transition-all"
                  />
                </div>
              </div>

              {/* PERCENTAGE HOTKEYS */}
              <div className="grid grid-cols-4 gap-2.5 pt-2">
                {([0.25, 0.5, 0.75, 1] as const).map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setPercentAmount(pct)}
                    className="h-10 rounded-xl bg-stone-100/60 text-xs font-semibold text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-all"
                  >
                    {pct === 1 ? "Max" : `${pct * 100}%`}
                  </button>
                ))}
              </div>

              {/* ACTION SUBMIT BUTTON */}
              <button
                type="submit"
                disabled={busy || !walletState?.exists}
                className="w-full h-12 mt-4 rounded-xl bg-stone-950 text-white font-bold text-xs uppercase tracking-widest hover:bg-stone-800 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sendingPayment ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>{statusMsg || "Sending Payment..."}</span>
                  </>
                ) : (
                  <span>Send Payment</span>
                )}
              </button>
            </form>
          )}
        </div>

        <div className="mt-8 pt-4 border-t border-stone-100 text-center shrink-0">
          <p className="text-[10px] text-stone-400">Transactions are signed locally on your device.</p>
        </div>
      </div>
    </div>
  </div>
);
}
