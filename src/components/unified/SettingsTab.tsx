"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  Bell,
  CheckCircle2,
  Copy,
  Check,
  KeyRound,
  Lock,
  LogOut,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  Loader2,
} from "lucide-react";
import type { WalletSecrets } from "@/lib/vaultCrypto";
import type { VaultControls } from "@/components/VaultGate";

/** Truncates a long key/hex string for display */
function shortKey(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

const primaryBtnClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-stone-950 px-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2";

const ghostBtnClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700 transition-all hover:bg-stone-50 hover:border-stone-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2";

const inputClass =
  "h-10 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-800 focus:bg-white focus:ring-1 focus:ring-stone-800";

export default function SettingsTab({
  wallet,
  controls,
}: {
  wallet: WalletSecrets;
  controls: VaultControls;
}) {
  const [showRotatePanel, setShowRotatePanel] = useState(false);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [profileHandle, setProfileHandle] = useState("");
  const [profileDraft, setProfileDraft] = useState("");
  const [profileStatus, setProfileStatus] = useState("");
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const response = await fetch("/api/wallet/profile", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as {
          profile?: { handle?: string | null; handleNormalized?: string | null };
        };
        if (cancelled) return;
        const handle = data.profile?.handle ?? data.profile?.handleNormalized ?? "";
        setProfileHandle(handle);
        setProfileDraft(handle);
      } catch {
        if (!cancelled) setProfileError("Could not load VEIL ID.");
      }
    }
    void loadProfile();
    return () => { cancelled = true; };
  }, []);

  const handleRotatePassword = async (e: FormEvent) => {
    e.preventDefault();
    const success = await controls.rotateVault(password, newPassword);
    if (success) {
      setPassword("");
      setNewPassword("");
      setShowRotatePanel(false);
    }
  };

  const handleCopyPublicKey = async () => {
    try {
      await navigator.clipboard.writeText(wallet.stellarPublicKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setProfileError("");
    setProfileStatus("Saving VEIL ID...");
    try {
      const response = await fetch("/api/wallet/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: profileDraft }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? `Profile update failed: HTTP ${response.status}`);
      const nextHandle = data.profile?.handle ?? profileDraft.trim().replace(/^@/, "");
      setProfileHandle(nextHandle);
      setProfileDraft(nextHandle);
      setProfileStatus("VEIL ID saved.");
    } catch (error) {
      setProfileStatus("");
      setProfileError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 px-1">

      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Settings</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-950">Vault controls</h2>
          <p className="mt-1 max-w-lg text-sm leading-6 text-stone-500">
            Manage the local encrypted vault and wallet identity.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Vault unlocked
        </div>
      </div>

      {/* ── Vault identity ── */}
      <Section icon={<ShieldCheck className="h-5 w-5" />} iconBg="bg-stone-950 text-white" title="Vault identity" description="Key material stays in the browser vault. The server never sees your secrets.">

        {/* Stellar public key */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-stone-500">Stellar public key</p>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 overflow-hidden rounded-xl bg-stone-50 px-3 py-2.5">
              <p
                className="select-all truncate font-mono text-xs text-stone-700"
                title={wallet.stellarPublicKey}
              >
                {wallet.stellarPublicKey}
              </p>
            </div>
            <button
              className={`${ghostBtnClass} shrink-0`}
              onClick={() => void handleCopyPublicKey()}
              type="button"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>

        {/* VEIL ID */}
        <form onSubmit={handleSaveProfile}>
          <p className="mb-1.5 text-xs font-medium text-stone-500">VEIL ID</p>
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-xl border border-stone-200 bg-stone-50 px-3 transition focus-within:border-stone-800 focus-within:bg-white focus-within:ring-1 focus-within:ring-stone-800">
              <span className="shrink-0 text-sm font-semibold text-stone-400">@</span>
              <input
                className="min-w-0 flex-1 bg-transparent px-1.5 py-2.5 text-sm font-semibold text-stone-950 outline-none placeholder:text-stone-300"
                maxLength={24}
                minLength={3}
                onChange={(e) => setProfileDraft(e.target.value)}
                pattern="[A-Za-z0-9_]{3,24}"
                placeholder="your_id"
                required
                type="text"
                value={profileDraft}
              />
            </div>
            <button
              className={`${ghostBtnClass} shrink-0`}
              disabled={profileStatus === "Saving VEIL ID..."}
              type="submit"
            >
              {profileStatus === "Saving VEIL ID..." ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              <span>{profileStatus === "Saving VEIL ID..." ? "Saving" : "Save"}</span>
            </button>
          </div>
          <p className="mt-1.5 min-h-4 text-xs">
            {profileError ? (
              <span className="font-medium text-red-700">{profileError}</span>
            ) : (
              <span className="text-stone-400">
                {profileStatus || (profileHandle ? `Discoverable as @${profileHandle}` : "Used for private payments.")}
              </span>
            )}
          </p>
        </form>

        {/* Key fingerprints */}
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-stone-100 sm:grid-cols-3">
          <KeyFingerprintCell label="Network" value="Stellar Testnet" mono={false} />
          <KeyFingerprintCell label="Note key" value={shortKey(wallet.bn254PublicHex)} mono />
          <KeyFingerprintCell label="Enc key" value={shortKey(wallet.x25519PublicHex)} mono />
        </div>
      </Section>

      {/* ── Access actions ── */}
      <Section icon={<KeyRound className="h-5 w-5" />} iconBg="bg-stone-100 text-stone-700" title="Access" description="Rotate the vault password or lock the session.">
        <div className="flex flex-wrap gap-2">
          <button
            className={ghostBtnClass}
            onClick={() => setShowRotatePanel((v) => !v)}
            type="button"
          >
            <RotateCcw className="h-4 w-4" />
            Rotate password
          </button>
          <button className={ghostBtnClass} onClick={controls.lockVault} type="button">
            <LogOut className="h-4 w-4" />
            Lock vault
          </button>
        </div>

        {showRotatePanel && (
          <form
            className="mt-1 space-y-3 rounded-xl border border-stone-100 bg-stone-50 p-4"
            onSubmit={handleRotatePassword}
          >
            <label className="block text-xs font-medium text-stone-600">
              Current password
              <input
                autoComplete="current-password"
                className={`mt-1.5 ${inputClass}`}
                onChange={(e) => setPassword(e.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            <label className="block text-xs font-medium text-stone-600">
              New password
              <input
                autoComplete="new-password"
                className={`mt-1.5 ${inputClass}`}
                minLength={10}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                type="password"
                value={newPassword}
              />
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                className={primaryBtnClass}
                disabled={controls.actionPending}
                type="submit"
              >
                {controls.actionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span>{controls.actionPending ? "Rotating..." : "Confirm rotation"}</span>
              </button>
              <button
                className={ghostBtnClass}
                onClick={() => setShowRotatePanel(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </Section>

      {/* ── Interface + Status ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Section icon={<SlidersHorizontal className="h-5 w-5" />} iconBg="bg-stone-100 text-stone-700" title="Interface" compact>
          <SettingRow label="Theme" value="Light" />
          <SettingRow label="Privacy mode" value="Public / private switch" />
          <SettingRow label="Activity" value="Live private events" />
        </Section>

        <Section icon={<Bell className="h-5 w-5" />} iconBg="bg-stone-100 text-stone-700" title="Visibility" compact>
          <SettingRow label="Proof status" value="In private activity" />
          <SettingRow label="Recovery" value="When needed only" />
          <SettingRow label="Note details" value="Unlocked session only" />
        </Section>
      </div>

      {/* ── Danger zone ── */}
      <div className="flex flex-col gap-4 rounded-xl border border-red-100 bg-red-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <TriangleAlert className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-900">Reset local vault</p>
            <p className="mt-0.5 text-xs leading-5 text-red-700">
              Removes the encrypted vault from this browser. Only reset when recovery material is safely stored.
            </p>
          </div>
        </div>
        <button
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 transition-all hover:bg-red-50 hover:border-red-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
          disabled={controls.actionPending}
          onClick={controls.resetVault}
          type="button"
        >
          <Lock className="h-4 w-4" />
          Reset vault
        </button>
      </div>
    </div>
  );
}

/* ─── Sub-components ────────────────────────────────────────────────────── */

function Section({
  icon,
  iconBg,
  title,
  description,
  children,
  compact = false,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="space-y-4 rounded-xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] ring-1 ring-stone-100">
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-stone-950">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs leading-5 text-stone-500">{description}</p>
          )}
        </div>
      </div>
      {!compact && <div className="space-y-3">{children}</div>}
      {compact && <div className="divide-y divide-stone-50">{children}</div>}
    </div>
  );
}

function KeyFingerprintCell({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{label}</p>
      <p className={`mt-1 truncate text-xs font-medium text-stone-900 ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 text-xs">
      <span className="text-stone-500">{label}</span>
      <span className="shrink-0 font-medium text-stone-900">{value}</span>
    </div>
  );
}
