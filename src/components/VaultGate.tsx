"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Circle, KeyRound, Lock, ShieldAlert, Check, Copy, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

import {
  createWalletVault,
  decryptVaultWithPassword,
  decryptVaultWithRecoveryKey,
  rotateVaultPassword,
  type WalletSecrets,
  type WalletVault,
} from "@/lib/vaultCrypto";
import {
  serializeVaultForStorage,
  type StoredVaultPayload,
} from "@/lib/vaultStorage";
import { signStellarPayload } from "@/lib/walletSigner";

export type VaultControls = {
  lockVault: () => void;
  resetVault: () => Promise<void>;
  rotateVault: (currentPass: string, newPass: string) => Promise<boolean>;
  actionPending: boolean;
};

type RemoteVault = Omit<StoredVaultPayload, "publicKeys">;
type VaultGateChildren = React.ReactNode | ((wallet: WalletSecrets, controls: VaultControls) => React.ReactNode);
type VaultGateProps = {
  children: VaultGateChildren;
  prepareWallet?: (wallet: WalletSecrets) => Promise<void>;
};
type RegistrationStatus = {
  registeredInPool: boolean;
  profile: {
    poolRegistrationTxHash?: string | null;
  } | null;
};

const inputClass =
  "h-12 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10";
const primaryButtonClass =
  "inline-flex h-12 items-center justify-center rounded-xl bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-stone-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500";
const secondaryButtonClass =
  "inline-flex h-12 items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-800 transition hover:bg-stone-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

function publicKeysFromWallet(wallet?: WalletSecrets): WalletVault["publicKeys"] {
  return {
    stellarPublicKey: wallet?.stellarPublicKey ?? "",
    bn254PublicHex: wallet?.bn254PublicHex ?? "",
    x25519PublicHex: wallet?.x25519PublicHex ?? "",
  };
}

function toVault(remote: RemoteVault, wallet?: WalletSecrets, recoveryKey = ""): WalletVault {
  return {
    vaultVersion: 2,
    vaultCiphertext: remote.vaultCiphertext,
    recoveryCiphertext: remote.recoveryCiphertext,
    recoveryKey,
    kdfName: remote.kdfName,
    kdfParams: remote.kdfParams,
    encryptionAlg: remote.encryptionAlg,
    publicKeys: publicKeysFromWallet(wallet),
  };
}

function shortKey(value: string) {
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

const KEEP_UNLOCKED_SESSION_KEY = "KEEP_UNLOCKED_SESSION_KEY";

function rememberUnlockedVault(wallet: WalletSecrets) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    KEEP_UNLOCKED_SESSION_KEY,
    JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      wallet,
    }),
  );
}

function forgetRememberedVault() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEEP_UNLOCKED_SESSION_KEY);
}

function restoreRememberedVault(): WalletSecrets | null {
  if (typeof window === "undefined") return null;
  try {
    const payload = JSON.parse(sessionStorage.getItem(KEEP_UNLOCKED_SESSION_KEY) ?? "null") as {
      version?: number;
      wallet?: Partial<WalletSecrets>;
    } | null;
    const wallet = payload?.version === 1 ? payload.wallet : null;
    if (
      !wallet ||
      typeof wallet.stellarPublicKey !== "string" ||
      typeof wallet.stellarSecretKey !== "string" ||
      typeof wallet.bn254NotePrivateKeyHex !== "string" ||
      typeof wallet.bn254PublicHex !== "string" ||
      typeof wallet.membershipBlindingHex !== "string" ||
      typeof wallet.x25519PublicHex !== "string" ||
      typeof wallet.x25519PrivateJwk !== "object" ||
      typeof wallet.createdAt !== "string"
    ) {
      forgetRememberedVault();
      return null;
    }
    return wallet as WalletSecrets;
  } catch {
    forgetRememberedVault();
    return null;
  }
}

async function storeVault(vault: WalletVault) {
  const res = await fetch("/api/wallet/vault", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(serializeVaultForStorage(vault)),
  });
  if (!res.ok) throw new Error(`Failed to store encrypted vault: HTTP ${res.status}`);
}

async function deriveBn254PublicHex(notePrivateKeyHex: string): Promise<string> {
  const res = await fetch("/api/wallet/keys/derive-note-public", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notePrivateKeyHex }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error ?? `Failed to derive note public key: HTTP ${res.status}`);
  }
  const notePublicKeyHex = typeof data.notePublicKeyHex === "string" ? data.notePublicKeyHex : "";
  if (!/^[0-9a-fA-F]{64}$/.test(notePublicKeyHex)) {
    throw new Error("Derived note public key was invalid");
  }
  return notePublicKeyHex.toLowerCase();
}

export default function VaultGate({ children, prepareWallet }: VaultGateProps) {
  const [loading, setLoading] = useState(true);
  const [remoteVault, setRemoteVault] = useState<RemoteVault | null>(null);
  const [wallet, setWallet] = useState<WalletSecrets | null>(null);
  const [walletPrepared, setWalletPrepared] = useState(false);
  const [walletPreparing, setWalletPreparing] = useState(false);
  const [walletPrepareError, setWalletPrepareError] = useState("");
  const [recoveryKeyToShow, setRecoveryKeyToShow] = useState("");
  const [recoveryKeySaved, setRecoveryKeySaved] = useState(false);
  const [password, setPassword] = useState("");
  const [profileHandle, setProfileHandle] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [keepUnlockedForTab, setKeepUnlockedForTab] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus | null>(null);
  const [registrationChecking, setRegistrationChecking] = useState(false);
  const [rememberedVaultChecked, setRememberedVaultChecked] = useState(false);
  
  // Custom interactive sub-states for clean tabbed layout
  const [showRecoveryRestore, setShowRecoveryRestore] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadVault = useCallback(async (isCancelled: () => boolean = () => false) => {
    const controller = new AbortController();
    const timeoutTimer = window.setTimeout(() => controller.abort(), 12000);

    const hasWallet = restoreRememberedVault() !== null;
    if (!hasWallet) {
      setLoading(true);
    }
    setRememberedVaultChecked(false);
    setError("");
    try {
      const res = await fetch("/api/wallet/vault", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (isCancelled()) return;
      if (res.status === 404) {
        setRemoteVault(null);
        setRememberedVaultChecked(true);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error(`Failed to load encrypted vault: HTTP ${res.status}`);
      const data = (await res.json()) as { vault: RemoteVault };
      setRemoteVault(data.vault);
      setLoading(false);
    } catch (err) {
      if (isCancelled()) return;
      setRememberedVaultChecked(true);
      setError(
        err instanceof DOMException && err.name === "AbortError"
          ? "Vault check timed out. Retry the vault check."
          : String(err),
      );
    } finally {
      window.clearTimeout(timeoutTimer);
    }
  }, []);

  const loadRegistrationStatus = useCallback(async () => {
    setRegistrationChecking(true);
    try {
      const res = await fetch("/api/wallet/registration", { cache: "no-store" });
      if (!res.ok) throw new Error(`Registration status failed: HTTP ${res.status}`);
      const data = (await res.json()) as RegistrationStatus;
      setRegistrationStatus(data);
      return data;
    } finally {
      setRegistrationChecking(false);
    }
  }, []);

  const resetWalletPreparation = useCallback(() => {
    setWalletPrepared(false);
    setWalletPreparing(false);
    setWalletPrepareError("");
  }, []);

  const lockVault = useCallback(() => {
    setWallet(null);
    setRegistrationStatus(null);
    setRememberedVaultChecked(true);
    forgetRememberedVault();
    resetWalletPreparation();
  }, [resetWalletPreparation]);

  const runWalletPreparation = useCallback(async () => {
    if (!wallet || !prepareWallet) {
      setWalletPrepared(true);
      return;
    }

    setWalletPreparing(true);
    setWalletPrepareError("");
    try {
      await prepareWallet(wallet);
      setWalletPrepared(true);
      setMessage("");
    } catch (err) {
      setWalletPrepareError(err instanceof Error ? err.message : String(err));
    } finally {
      setWalletPreparing(false);
    }
  }, [prepareWallet, wallet]);

  useIsomorphicLayoutEffect(() => {
    const remembered = restoreRememberedVault();
    if (remembered) {
      setWallet(remembered);
      setRecoveryKeySaved(true);
      setRememberedVaultChecked(true);
      setLoading(false);
      
      // Sync remote vault in the background
      void fetch("/api/wallet/vault", { cache: "no-store" })
        .then(async (res) => {
          if (res.status === 404) {
            lockVault();
          } else if (res.ok) {
            const data = await res.json();
            setRemoteVault(data.vault);
          }
        })
        .catch(() => {});

      void loadRegistrationStatus().catch((err) => setError(String(err)));
    } else {
      let cancelled = false;
      void loadVault(() => cancelled);
      return () => {
        cancelled = true;
      };
    }
  }, [loadVault, loadRegistrationStatus, lockVault]);

  async function handleCreateVault(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setRegistrationStatus(null);
    setMessage("Reserving VEIL ID...");
    setActionPending(true);
    try {
      const profileRes = await fetch("/api/wallet/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: profileHandle }),
      });
      const profileData = await profileRes.json().catch(() => ({}));
      if (!profileRes.ok) {
        throw new Error(profileData?.error ?? `VEIL ID setup failed: HTTP ${profileRes.status}`);
      }
      setMessage("Creating encrypted wallet vault...");
      const vault = await createWalletVault({ password, deriveBn254PublicHex });
      await storeVault(vault);
      const unlocked = await decryptVaultWithPassword(vault, password);
      resetWalletPreparation();
      setRemoteVault(serializeVaultForStorage(vault));
      setWallet(unlocked);
      rememberUnlockedVault(unlocked);
      setRecoveryKeyToShow(vault.recoveryKey);
      setRecoveryKeySaved(false);
      setPassword("");
      setProfileHandle("");
      setMessage("Vault created. Save the recovery key before continuing.");
      void loadRegistrationStatus().catch((err) => setError(String(err)));
    } catch (err) {
      setError(String(err));
      setMessage("");
    } finally {
      setActionPending(false);
    }
  }

  async function handleUnlock(event: React.FormEvent) {
    event.preventDefault();
    if (!remoteVault) return;
    setError("");
    setRegistrationStatus(null);
    setActionPending(true);
    try {
      const unlocked = await decryptVaultWithPassword(toVault(remoteVault), password);
      if (keepUnlockedForTab) {
        rememberUnlockedVault(unlocked);
      } else {
        forgetRememberedVault();
      }
      resetWalletPreparation();
      setWallet(unlocked);
      setPassword("");
      setRecoveryKeyToShow("");
      setRecoveryKeySaved(true);
      setMessage("Vault unlocked.");
      void loadRegistrationStatus().catch((err) => setError(String(err)));
    } catch (err) {
      setError(String(err));
    } finally {
      setActionPending(false);
    }
  }

  async function handleRecoveryRestore(event: React.FormEvent) {
    event.preventDefault();
    if (!remoteVault) return;
    setError("");
    setRegistrationStatus(null);
    setActionPending(true);
    try {
      const restored = await decryptVaultWithRecoveryKey(
        toVault(remoteVault, undefined, recoveryKey),
        recoveryKey,
      );
      const rotated = await rotateVaultPassword(toVault(remoteVault, restored, recoveryKey), {
        recoveryKey,
        newPassword,
      });
      await storeVault(rotated);
      if (keepUnlockedForTab) {
        rememberUnlockedVault(restored);
      } else {
        forgetRememberedVault();
      }
      resetWalletPreparation();
      setRemoteVault(serializeVaultForStorage(rotated));
      setWallet(restored);
      setRecoveryKey("");
      setNewPassword("");
      setRecoveryKeySaved(true);
      setMessage("Recovery key accepted. Wallet password has been reset.");
      void loadRegistrationStatus().catch((err) => setError(String(err)));
    } catch (err) {
      setError(String(err));
    } finally {
      setActionPending(false);
    }
  }

  const rotateVault = useCallback(async (currentPass: string, newPass: string) => {
    if (!remoteVault || !wallet) return false;
    setError("");
    setActionPending(true);
    try {
      const rotated = await rotateVaultPassword(toVault(remoteVault, wallet), {
        currentPassword: currentPass,
        newPassword: newPass,
      });
      await storeVault(rotated);
      setRemoteVault(serializeVaultForStorage(rotated));
      setMessage("Wallet password updated.");
      return true;
    } catch (err) {
      setError(String(err));
      return false;
    } finally {
      setActionPending(false);
    }
  }, [remoteVault, wallet]);

  const handleResetVault = useCallback(async () => {
    if (!confirm("Reset this encrypted vault? You will need to create a new wallet vault.")) {
      return;
    }
    setError("");
    setActionPending(true);
    try {
      const res = await fetch("/api/wallet/vault", { method: "DELETE" });
      if (!res.ok) {
        setError(`Failed to reset vault: HTTP ${res.status}`);
        return;
      }
      setRemoteVault(null);
      setWallet(null);
      setRememberedVaultChecked(true);
      forgetRememberedVault();
      resetWalletPreparation();
      setRecoveryKeyToShow("");
      setRecoveryKeySaved(false);
      setPassword("");
      setNewPassword("");
      setRecoveryKey("");
      setRegistrationStatus(null);
      setMessage("Encrypted vault reset.");
    } finally {
      setActionPending(false);
    }
  }, [resetWalletPreparation]);



  useEffect(() => {
    if (!remoteVault || wallet || actionPending || rememberedVaultChecked) return;
    const remembered = restoreRememberedVault();
    setRememberedVaultChecked(true);
    if (!remembered) return;
    setKeepUnlockedForTab(true);
    resetWalletPreparation();
    setWallet(remembered);
    setRecoveryKeySaved(true);
    setMessage("Vault restored for this browser tab.");
    void loadRegistrationStatus().catch((err) => setError(String(err)));
  }, [actionPending, loadRegistrationStatus, rememberedVaultChecked, remoteVault, resetWalletPreparation, wallet]);

  const vaultControls: VaultControls = {
    lockVault,
    resetVault: handleResetVault,
    rotateVault,
    actionPending,
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(recoveryKeyToShow);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  async function fundRegistrationAccount() {
    if (!wallet) return;
    setActionPending(true);
    setError("");
    setMessage("Funding wallet account on testnet...");
    try {
      const res = await fetch("/api/wallet/public/friendbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: wallet.stellarPublicKey }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `Friendbot failed: HTTP ${res.status}`);
      }
      setMessage("Testnet XLM funded. You can register now.");
    } catch (err) {
      setError(String(err));
      setMessage("");
    } finally {
      setActionPending(false);
    }
  }

  async function registerWalletInPool() {
    if (!wallet) return;
    setActionPending(true);
    setError("");
    setMessage("Preparing ASP membership registration...");
    try {
      const publicFields = {
        stellarPublicKey: wallet.stellarPublicKey,
        notePublicKeyHex: wallet.bn254PublicHex,
        encryptionPublicKeyHex: wallet.x25519PublicHex,
        membershipBlindingHex: wallet.membershipBlindingHex,
      };
      const preparedRes = await fetch("/api/wallet/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "prepare", ...publicFields }),
      });
      const prepared = await preparedRes.json().catch(() => ({}));
      if (!preparedRes.ok) {
        throw new Error(prepared?.error ?? `Registration prepare failed: HTTP ${preparedRes.status}`);
      }
      const signature = signStellarPayload({
        stellarSecretKey: wallet.stellarSecretKey,
        payloadBase64: prepared.signingPayloadBase64,
      });

      setMessage("Signing public key registry registration...");
      const submitRes = await fetch("/api/wallet/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "submit",
          ...publicFields,
          unsignedXdr: prepared.unsignedXdr,
          signatureBase64: signature.signatureBase64,
          aspMembershipTxHash: prepared.aspMembershipTxHash,
          membershipLeafHex: prepared.membershipLeafHex,
        }),
      });
      const submitted = await submitRes.json().catch(() => ({}));
      if (!submitRes.ok) {
        throw new Error(submitted?.error ?? `Registration submit failed: HTTP ${submitRes.status}`);
      }
      await loadRegistrationStatus();
      setMessage("Wallet registered in pool.");
    } catch (err) {
      setError(String(err));
      setMessage("");
    } finally {
      setActionPending(false);
    }
  }

  useEffect(() => {
    if (
      wallet &&
      recoveryKeySaved &&
      registrationStatus?.registeredInPool &&
      prepareWallet &&
      !walletPrepared &&
      !walletPreparing &&
      !walletPrepareError
    ) {
      void runWalletPreparation();
    }
  }, [
    prepareWallet,
    recoveryKeySaved,
    registrationStatus?.registeredInPool,
    runWalletPreparation,
    wallet,
    walletPrepared,
    walletPrepareError,
    walletPreparing,
  ]);

  // Shared Animation Variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15, delayChildren: 0.2 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
    },
  };

  const styleTag = (
    <style>{`
      /* Google Fonts Inter */
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

      .aurora-shell {
        font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
        min-height: 100dvh;
        width: 100%;
        background-color: #ffffff;
        color: #111827;
        display: flex;
        padding: 8px;
        transition: all 500ms ease;
        -webkit-font-smoothing: antialiased;
      }

      @media (min-width: 1024px) {
        .aurora-shell {
          height: 100vh;
          overflow: hidden;
          padding: 16px;
        }
      }

      /* LEFT HERO COLUMN */
      .hero-col {
        display: none;
        position: relative;
        width: 52%;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        padding-bottom: 8rem;
        padding-left: 3rem;
        padding-right: 3rem;
        border-radius: 1.5rem;
        overflow: hidden;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        height: 100%;
        color: white; /* Text over video stays white */
      }

      @media (min-width: 1024px) {
        .hero-col {
          display: flex;
        }
      }

      .hero-video {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        z-index: 0;
      }

      .hero-content {
        position: relative;
        z-index: 10;
        width: 100%;
        max-width: 20rem; /* max-w-xs */
        display: flex;
        flex-direction: column;
        gap: 2rem;
      }

      .hero-brand {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .hero-heading {
        font-size: 2.25rem; /* 36px */
        font-weight: 500;
        letter-spacing: -0.025em;
        white-space: nowrap;
        line-height: 1;
        margin-bottom: 0.5rem;
      }

      .hero-desc {
        color: rgba(255, 255, 255, 0.6);
        font-size: 0.875rem; /* 14px */
        line-height: 1.625;
        padding-left: 1rem;
        padding-right: 1rem;
      }

      .steps-container {
        display: flex;
        flex-direction: column;
        gap: 0.75rem; /* space-y-3 */
      }

      /* RIGHT FORM COLUMN */
      .form-col {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 3rem 1rem; /* py-12 px-4 */
        overflow-y: auto;
      }

      @media (min-width: 1024px) {
        .form-col {
          padding-top: 1.5rem;
          padding-bottom: 1.5rem;
          padding-left: 4rem;
          padding-right: 4rem;
          overflow-y: hidden;
        }
      }

      .form-container {
        width: 100%;
        max-width: 36rem; /* max-w-xl */
        display: flex;
        flex-direction: column;
        gap: 2rem;
      }

      .form-header-title {
        font-size: 1.875rem; /* 30px */
        font-weight: 500;
        letter-spacing: -0.025em;
        color: #111827;
        margin: 0;
      }

      .form-header-desc {
        color: #6b7280; /* text-gray-500 */
        font-size: 0.875rem;
        margin-top: 0.5rem;
      }

      .warning-card {
        border: 1px solid #fef08a; /* yellow-200 */
        background: #fef9c3; /* yellow-100 */
        border-radius: 1rem;
        padding: 1.25rem;
        display: flex;
        gap: 0.75rem;
        color: #854d0e; /* yellow-800 */
      }

      .info-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 0.875rem;
        color: #6b7280;
      }
    `}</style>
  );

  // 1. LOADING SCREEN
  if (loading) {
    return (
      <InitialVaultLookup
        error={error}
        onRetry={() => void loadVault()}
      />
    );
  }

  if (remoteVault && !wallet && !rememberedVaultChecked) {
    return (
      <InitialVaultLookup
        error={error}
        onRetry={() => void loadVault()}
      />
    );
  }

  // 2. BACKUP RECOVERY KEY SCREEN
  if (wallet && recoveryKeyToShow && !recoveryKeySaved) {
    return (
      <main className="aurora-shell" data-testid="vault-gate">
        {styleTag}
        <div className="hero-col">
          <video
            className="hero-video"
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260506_081238_406ed0e3-5d83-436e-a512-0bbff7ec5b95.mp4"
            autoPlay
            muted
            loop
            playsInline
          />
          <motion.div
            className="hero-content"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div className="hero-brand" variants={itemVariants}>
              <Circle size={24} strokeWidth={2.5} color="white" fill="white" />
              <span style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.025em' }}>
                Veil
              </span>
            </motion.div>
            <motion.div variants={itemVariants}>
              <h1 className="hero-heading">Secure Vault</h1>
              <p className="hero-desc">Your recovery credentials have been created.</p>
            </motion.div>
            <motion.div className="steps-container" variants={itemVariants}>
              <StepItem number={1} text="Choose wallet password" />
              <StepItem number={2} text="Secure backup key" active />
              <StepItem number={3} text="Initialize workspace" />
            </motion.div>
          </motion.div>
        </div>

        <div className="form-col">
          <motion.div
            className="form-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          >
            <div>
              <h2 className="form-header-title">Save recovery key</h2>
              <p className="form-header-desc">
                Your password locally encrypts the keys. This recovery code is the only path to restore them if the password is lost.
              </p>
            </div>

            <div className="warning-card">
              <ShieldAlert size={20} className="shrink-0" />
              <div className="text-xs leading-5">
                <span className="font-semibold block">Store this key offline</span>
                Write it down or save it in a password manager. It will never be shown again.
              </div>
            </div>

            <div className="relative">
              <textarea
                className="min-h-24 w-full resize-none rounded-xl border border-stone-200 bg-stone-50 p-4 font-mono text-xs leading-5 text-stone-700 outline-none focus:border-stone-400"
                readOnly
                value={recoveryKeyToShow}
              />
              <button
                type="button"
                onClick={handleCopy}
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 shadow-sm transition hover:text-stone-900 active:scale-95"
              >
                {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              </button>
            </div>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                checked={recoveryKeySaved}
                className="mt-0.5 h-4 w-4 rounded border-stone-300 text-stone-950 focus:ring-stone-950 focus:ring-offset-0"
                onChange={(event) => setRecoveryKeySaved(event.target.checked)}
                type="checkbox"
              />
              <span className="text-xs text-stone-600 leading-normal">
                I have saved my recovery key (Recovery key saved) and understand that Veil cannot retrieve it.
              </span>
            </label>

            <button
              className={primaryButtonClass}
              disabled={!recoveryKeySaved}
              onClick={() => {
                setRecoveryKeyToShow("");
                setMessage("Vault ready.");
              }}
              type="button"
            >
              Continue to wallet
            </button>
            {message && <p className="text-sm text-center text-stone-600">{message}</p>}
            {error && <p className="text-sm text-center text-red-600">{error}</p>}
          </motion.div>
        </div>
      </main>
    );
  }

  // 3. SECURE SETUP SCREEN (Create or Unlock)
  if (!wallet) {
    const hasVault = Boolean(remoteVault);
    return (
      <main className="aurora-shell" data-testid="vault-gate">
        {styleTag}
        <div className="hero-col">
          <video
            className="hero-video"
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260506_081238_406ed0e3-5d83-436e-a512-0bbff7ec5b95.mp4"
            autoPlay
            muted
            loop
            playsInline
          />
          <motion.div
            className="hero-content"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div className="hero-brand" variants={itemVariants}>
              <Circle size={24} strokeWidth={2.5} color="white" fill="white" />
              <span style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.025em' }}>
                Veil
              </span>
            </motion.div>
            <motion.div variants={itemVariants}>
              <h1 className="hero-heading">{hasVault ? "Unlock Secrets" : "Initialize Vault"}</h1>
              <p className="hero-desc">
                {hasVault ? "Unlock your secure non-custodial pay boundary." : "Set up local wallet enclaves on this device."}
              </p>
            </motion.div>
            <motion.div className="steps-container" variants={itemVariants}>
              {hasVault ? (
                <>
                  <StepItem number={1} text="Verify local credentials" active />
                  <StepItem number={2} text="Decrypt wallet secrets" />
                  <StepItem number={3} text="Access secure dashboard" />
                </>
              ) : (
                <>
                  <StepItem number={1} text="Choose wallet password" active />
                  <StepItem number={2} text="Secure backup key" />
                  <StepItem number={3} text="Initialize workspace" />
                </>
              )}
            </motion.div>
          </motion.div>
        </div>

        <div className="form-col">
          <motion.div
            className="form-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          >
            {!hasVault ? (
              // CREATE VAULT FORM
              <form className="space-y-6" onSubmit={handleCreateVault}>
                <div>
                  <h2 className="form-header-title">Create vault</h2>
                  <p className="form-header-desc">
                    Your password locally encrypts the keys before they are backed up. Pick a unique password.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500">
                    VEIL ID
                  </label>
                  <div className="mt-2 flex items-center rounded-2xl border border-stone-200 bg-white px-4 shadow-sm transition focus-within:border-stone-950">
                    <span className="text-sm font-semibold text-stone-400">@</span>
                    <input
                      className="h-12 min-w-0 flex-1 bg-transparent px-1.5 text-sm font-medium text-stone-900 outline-none placeholder:text-stone-300"
                      maxLength={24}
                      minLength={3}
                      onChange={(event) => setProfileHandle(event.target.value)}
                      pattern="[A-Za-z0-9_]{3,24}"
                      placeholder="your_id"
                      required
                      type="text"
                      value={profileHandle}
                    />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-stone-500">
                    People can find you by email, VEIL ID, or wallet address.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Wallet password
                  </label>
                  <input
                    className={`${inputClass} mt-2`}
                    minLength={10}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Minimum 10 characters"
                    required
                    type="password"
                    value={password}
                  />
                </div>
                 <button className={`${primaryButtonClass} w-full`} disabled={actionPending}>
                  {actionPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <span>Creating vault...</span>
                    </>
                  ) : (
                    <span>Create encrypted vault</span>
                  )}
                </button>
              </form>
            ) : showRecoveryRestore ? (
              // RECOVERY KEY RESTORE FORM
              <form className="space-y-6" onSubmit={handleRecoveryRestore}>
                <div>
                  <h2 className="form-header-title">Recovery restore</h2>
                  <p className="form-header-desc">
                    Use your recovery key to set a new password and recover your local wallet secrets.
                  </p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500">
                      Recovery key
                    </label>
                    <input
                      className={`${inputClass} mt-2 font-mono text-xs`}
                      onChange={(event) => setRecoveryKey(event.target.value)}
                      placeholder="Paste your recovery key code"
                      required
                      value={recoveryKey}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500">
                      New wallet password
                    </label>
                    <input
                      className={`${inputClass} mt-2`}
                      minLength={10}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="Minimum 10 characters"
                      required
                      type="password"
                      value={newPassword}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <button className={`${primaryButtonClass} w-full`} disabled={actionPending}>
                    {actionPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        <span>Resetting password...</span>
                      </>
                    ) : (
                      <span>Reset password with recovery key</span>
                    )}
                  </button>
                  <button
                    className="text-xs font-medium text-stone-600 hover:text-stone-900 text-center transition"
                    onClick={() => setShowRecoveryRestore(false)}
                    type="button"
                  >
                    Back to password unlock
                  </button>
                </div>
              </form>
            ) : (
              // UNLOCK VAULT FORM
              <form className="space-y-6" onSubmit={handleUnlock}>
                <div>
                  <h2 className="form-header-title">Unlock vault</h2>
                  <p className="form-header-desc">
                    Enter the wallet password created during setup to decrypt your keys.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Wallet password
                  </label>
                  <input
                    className={`${inputClass} mt-2`}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter wallet password"
                    required
                    type="password"
                    value={password}
                  />
                </div>
                <label className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 text-left">
                  <input
                    checked={keepUnlockedForTab}
                    className="mt-1 h-4 w-4 rounded border-stone-300 text-stone-950 focus:ring-stone-900"
                    onChange={(event) => setKeepUnlockedForTab(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    <span className="block text-xs font-semibold text-stone-900">
                      Keep vault unlocked for this tab
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-stone-500">
                      Skips password unlock after refresh in this browser tab. Locking the wallet clears it.
                    </span>
                  </span>
                </label>
                <div className="flex flex-col gap-3">
                  <button className={`${primaryButtonClass} w-full`} disabled={actionPending}>
                    {actionPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        <span>Unlocking...</span>
                      </>
                    ) : (
                      <span>Unlock</span>
                    )}
                  </button>
                  <button
                    className="text-xs font-medium text-stone-600 hover:text-stone-900 text-center transition"
                    onClick={() => setShowRecoveryRestore(true)}
                    type="button"
                  >
                    Forgot password? Restore with recovery key
                  </button>
                </div>
              </form>
            )}

            <div className="border-t border-stone-200/60 pt-6">
              <div className="info-row">
                <KeyRound size={16} className="text-stone-400 shrink-0" />
                <span className="text-xs text-stone-500">
                  Veil stores only encrypted ciphertext. Your password is never sent to our servers.
                </span>
              </div>
            </div>

            {message && (
              <p className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-center text-xs text-emerald-800 animate-fade-in">
                {message}
              </p>
            )}
            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-center text-xs text-red-700 animate-fade-in flex flex-col items-center gap-2">
                <span>{error}</span>
                {error.includes("vault check") && (
                  <button
                    onClick={() => {
                      setError("");
                      void loadVault();
                    }}
                    type="button"
                    className="text-[10px] font-bold uppercase tracking-wider text-red-800 hover:text-red-900 underline underline-offset-2 transition"
                  >
                    Retry Vault Check
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </main>
    );
  }

  // 4. POOL REGISTRATION STATUS CHECK
  if (wallet && recoveryKeySaved && registrationStatus === null) {
    return (
      <main className="aurora-shell" data-testid="vault-gate">
        {styleTag}
        <div className="hero-col">
          <video
            className="hero-video"
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260506_081238_406ed0e3-5d83-436e-a512-0bbff7ec5b95.mp4"
            autoPlay
            muted
            loop
            playsInline
          />
          <motion.div
            className="hero-content"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div className="hero-brand" variants={itemVariants}>
              <Circle size={24} strokeWidth={2.5} color="white" fill="white" />
              <span style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.025em' }}>
                Veil
              </span>
            </motion.div>
            <motion.div variants={itemVariants}>
              <h1 className="hero-heading">Pool Check</h1>
              <p className="hero-desc">Confirming your public registration before opening the wallet.</p>
            </motion.div>
            <motion.div className="steps-container" variants={itemVariants}>
              <StepItem number={1} text="Unlock encrypted vault" />
              <StepItem number={2} text="Check pool membership" active />
              <StepItem number={3} text="Open wallet" />
            </motion.div>
          </motion.div>
        </div>

        <div className="form-col">
          <motion.div
            className="form-container"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            style={{ maxWidth: "28rem" }}
          >
            <div>
              <h2 className="form-header-title">Checking pool registration</h2>
              <p className="form-header-desc">
                Veil is confirming whether this wallet is already registered for private note payments.
              </p>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
              <div className="flex items-center gap-3">
                {registrationChecking ? (
                  <Loader2 size={18} className="animate-spin text-stone-500" />
                ) : error ? (
                  <ShieldAlert size={18} className="text-red-500" />
                ) : (
                  <Loader2 size={18} className="text-stone-500" />
                )}
                <div>
                  <p className="text-sm font-semibold text-stone-900">
                    {registrationChecking ? "Status check in progress" : "Registration status unavailable"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-stone-500">
                    {registrationChecking
                      ? "This prevents registered wallets from seeing the registration form while the server responds."
                      : "Retry the status check. If the wallet is registered, it will open directly."}
                  </p>
                </div>
              </div>
            </div>

            {!registrationChecking && (
              <button
                className={primaryButtonClass}
                onClick={() => void loadRegistrationStatus().catch((err) => setError(String(err)))}
                disabled={actionPending}
                type="button"
              >
                {actionPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span>Checking...</span>
                  </>
                ) : (
                  <span>Retry registration check</span>
                )}
              </button>
            )}

            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-center text-xs text-red-700 animate-fade-in">
                {error}
              </div>
            )}
          </motion.div>
        </div>
      </main>
    );
  }

  // 5. POOL REGISTRATION GATE
  if (wallet && recoveryKeySaved && registrationStatus !== null && !registrationStatus.registeredInPool) {
    return (
      <main className="aurora-shell" data-testid="vault-gate">
        {styleTag}
        <div className="hero-col">
          <video
            className="hero-video"
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260506_081238_406ed0e3-5d83-436e-a512-0bbff7ec5b95.mp4"
            autoPlay
            muted
            loop
            playsInline
          />
          <motion.div
            className="hero-content"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div className="hero-brand" variants={itemVariants}>
              <Circle size={24} strokeWidth={2.5} color="white" fill="white" />
              <span style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.025em' }}>
                Veil
              </span>
            </motion.div>
            <motion.div variants={itemVariants}>
              <h1 className="hero-heading">Pool Register</h1>
              <p className="hero-desc">Publish your public receive keys before private note payments.</p>
            </motion.div>
            <motion.div className="steps-container" variants={itemVariants}>
              <StepItem number={1} text="Create encrypted vault" />
              <StepItem number={2} text="Save recovery key" />
              <StepItem number={3} text="Register wallet in pool" active />
            </motion.div>
          </motion.div>
        </div>

        <div className="form-col">
          <motion.div
            className="form-container"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
          >
            <div>
              <h2 className="form-header-title">Register wallet in pool</h2>
              <p className="form-header-desc">
                This publishes only public receive keys so other VEIL users can send private notes to your wallet.
              </p>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <div className="grid gap-3 text-xs">
                <KeyValue label="Public wallet" value={shortKey(wallet.stellarPublicKey)} />
                <KeyValue label="BN254 receive key" value={shortKey(wallet.bn254PublicHex)} />
                <KeyValue label="X25519 receive key" value={shortKey(wallet.x25519PublicHex)} />
                <KeyValue
                  label="Status"
                  value={registrationChecking ? "Checking..." : "Not registered"}
                />
              </div>
            </div>

            <div className="warning-card">
              <ShieldAlert size={20} className="shrink-0" />
              <div className="text-xs leading-5">
                <span className="font-semibold block">Public registration only</span>
                Wallet secrets and note secrets stay encrypted in your vault. Registration may need testnet XLM for fees.
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                className="inline-flex h-12 items-center justify-center rounded-xl border border-blue-500 hover:border-blue-600 bg-white px-4 text-sm font-semibold text-stone-900 transition hover:bg-blue-50/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={actionPending}
                onClick={() => void fundRegistrationAccount()}
                type="button"
              >
                {actionPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span>Funding...</span>
                  </>
                ) : (
                  <span>Fund testnet account</span>
                )}
              </button>
              <button
                className={primaryButtonClass}
                disabled={actionPending || registrationChecking}
                onClick={() => void registerWalletInPool()}
                type="button"
              >
                {actionPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span>Registering...</span>
                  </>
                ) : (
                  <span>Register in pool</span>
                )}
              </button>
            </div>

            <button
              className="text-xs font-medium text-stone-600 hover:text-stone-900 text-center transition"
              disabled={registrationChecking}
              onClick={() => void loadRegistrationStatus().catch((err) => setError(String(err)))}
              type="button"
            >
              Refresh registration status
            </button>

            {message && (
              <p className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-center text-xs text-emerald-800 animate-fade-in">
                {message}
              </p>
            )}
            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-center text-xs text-red-700 animate-fade-in">
                {error}
              </div>
            )}
          </motion.div>
        </div>
      </main>
    );
  }

  // 6. WALLET BOOTSTRAP STEP
  if (wallet && recoveryKeySaved && registrationStatus?.registeredInPool && prepareWallet && !walletPrepared) {
    return (
      <main className="aurora-shell" data-testid="vault-gate">
        {styleTag}
        <div className="hero-col">
          <video
            className="hero-video"
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260506_081238_406ed0e3-5d83-436e-a512-0bbff7ec5b95.mp4"
            autoPlay
            muted
            loop
            playsInline
          />
          <motion.div
            className="hero-content"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div className="hero-brand" variants={itemVariants}>
              <Circle size={24} strokeWidth={2.5} color="white" fill="white" />
              <span style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.025em' }}>
                Veil
              </span>
            </motion.div>
            <motion.div variants={itemVariants}>
              <h1 className="hero-heading">Wallet Ready</h1>
              <p className="hero-desc">Loading the live wallet state before opening the dashboard.</p>
            </motion.div>
            <motion.div className="steps-container" variants={itemVariants}>
              <StepItem number={1} text="Unlock encrypted vault" />
              <StepItem number={2} text="Check pool membership" />
              <StepItem number={3} text="Loading wallet" active />
            </motion.div>
          </motion.div>
        </div>

        <div className="form-col">
          <motion.div
            className="form-container"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            style={{ maxWidth: "30rem" }}
          >
            <div>
              <h2 className="form-header-title">Loading wallet</h2>
              <p className="form-header-desc">
                VEIL is loading balances, notes, contacts, requests, jobs, and notifications before opening the dashboard.
              </p>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
              <div className="flex items-center gap-3">
                {walletPrepareError ? (
                  <ShieldAlert size={18} className="text-red-500" />
                ) : (
                  <Loader2 size={18} className="animate-spin text-stone-500" />
                )}
                <div>
                  <p className="text-sm font-semibold text-stone-900">
                    {walletPrepareError
                      ? "Wallet loading paused"
                      : walletPreparing
                      ? "Loading encrypted wallet state"
                      : "Preparing wallet state"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-stone-500">
                    {walletPrepareError
                      ? "Retry loading. The dashboard will open after the wallet data is ready."
                      : "This prevents false empty balances, notes, or request states during startup."}
                  </p>
                </div>
              </div>
            </div>

            {walletPrepareError && (
              <>
                <button
                  className={primaryButtonClass}
                  onClick={() => void runWalletPreparation()}
                  disabled={walletPreparing}
                  type="button"
                >
                  {walletPreparing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <span>Loading...</span>
                    </>
                  ) : (
                    <span>Retry loading wallet</span>
                  )}
                </button>
                <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-center text-xs text-red-700 animate-fade-in">
                  {walletPrepareError}
                </div>
              </>
            )}
          </motion.div>
        </div>
      </main>
    );
  }

  // 7. WALLET UNLOCKED STATE
  return (
    <div className="h-full w-full bg-stone-50 text-stone-950" data-testid="vault-gate">
      <div className="sr-only" data-testid="vault-security-bar">
        Vault security
      </div>
      {typeof children === "function" ? children(wallet, vaultControls) : children}
    </div>
  );
}

// ----------------------------------------------------------------------
// Reusable Sub-components (Aurora specific)
// ----------------------------------------------------------------------

function InitialVaultLookup({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15, delayChildren: 0.2 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
    },
  };

  const localStyleTag = (
    <style>{`
      /* Google Fonts Inter */
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

      .aurora-shell {
        font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
        min-height: 100dvh;
        width: 100%;
        background-color: #ffffff;
        color: #111827;
        display: flex;
        padding: 8px;
        transition: all 500ms ease;
        -webkit-font-smoothing: antialiased;
      }

      @media (min-width: 1024px) {
        .aurora-shell {
          height: 100vh;
          overflow: hidden;
          padding: 16px;
        }
      }

      /* LEFT HERO COLUMN */
      .hero-col {
        display: none;
        position: relative;
        width: 52%;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        padding-bottom: 8rem;
        padding-left: 3rem;
        padding-right: 3rem;
        border-radius: 1.5rem;
        overflow: hidden;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        height: 100%;
        color: white;
      }

      @media (min-width: 1024px) {
        .hero-col {
          display: flex;
        }
      }

      .hero-video {
        position: absolute;
        inset: 0;
        height: 100%;
        width: 100%;
        object-fit: cover;
      }

      .hero-content {
        position: relative;
        z-index: 10;
        width: 100%;
        max-w-md;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }

      .hero-brand {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .hero-heading {
        font-size: 2.25rem;
        font-weight: 700;
        letter-spacing: -0.03em;
        line-height: 1.15;
      }

      .hero-desc {
        margin-top: 0.5rem;
        font-size: 0.875rem;
        color: rgba(255, 255, 255, 0.8);
        line-height: 1.6;
      }

      /* RIGHT FORM COLUMN */
      .form-col {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem 1rem;
        background-color: #ffffff;
      }

      @media (min-width: 1024px) {
        .form-col {
          padding: 2rem;
        }
      }

      .form-container {
        width: 100%;
        max-w-md;
        display: flex;
        flex-direction: column;
        gap: 1.75rem;
      }

      .form-header-title {
        font-size: 1.5rem;
        font-weight: 700;
        letter-spacing: -0.025em;
        color: #111827;
      }

      .form-header-desc {
        margin-top: 0.375rem;
        font-size: 0.875rem;
        color: #6b7280;
        line-height: 1.5;
      }

      .warning-card {
        display: flex;
        gap: 0.75rem;
        border-radius: 1rem;
        border: 1px solid #fecaca;
        background-color: #fef2f2;
        padding: 1rem;
        color: #991b1b;
      }
    `}</style>
  );

  return (
    <main className="aurora-shell" data-testid="vault-gate">
      {localStyleTag}
      <div className="hero-col">
        <video
          className="hero-video"
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260506_081238_406ed0e3-5d83-436e-a512-0bbff7ec5b95.mp4"
          autoPlay
          muted
          loop
          playsInline
        />
        <motion.div
          className="hero-content"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div className="hero-brand" variants={itemVariants}>
            <Circle size={24} strokeWidth={2.5} color="white" fill="white" />
            <span style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.025em' }}>
              Veil
            </span>
          </motion.div>
          <motion.div variants={itemVariants}>
            <h1 className="hero-heading">Vault Connection</h1>
            <p className="hero-desc">Checking your secure vault database status.</p>
          </motion.div>
        </motion.div>
      </div>

      <div className="form-col">
        <motion.div
          className="form-container"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
        >
          {error ? (
            <>
              <div>
                <h2 className="form-header-title">Vault connection failed</h2>
                <p className="form-header-desc">
                  An error occurred while connecting to your secure vault storage.
                </p>
              </div>

              <div className="warning-card">
                <ShieldAlert size={20} className="shrink-0" />
                <div className="text-xs leading-5">
                  <span className="font-semibold block">Connection Error</span>
                  {error}
                </div>
              </div>

              <button
                className={primaryButtonClass}
                onClick={onRetry}
                type="button"
              >
                Retry vault check
              </button>
            </>
          ) : (
            <>
              <div>
                <h2 className="form-header-title">Connecting...</h2>
                <p className="form-header-desc">
                  Verifying the secure database state on your device.
                </p>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
                <div className="flex items-center gap-3">
                  <Loader2 size={18} className="animate-spin text-stone-500" />
                  <div>
                    <p className="text-sm font-semibold text-stone-900">
                      Checking vault storage
                    </p>
                    <p className="mt-1 text-xs leading-5 text-stone-500">
                      This query ensures your encrypted keys are available on startup.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </main>
  );
}

function StepItem({ number, text, active }: { number: number; text: string; active?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "1rem",
        borderRadius: "0.75rem",
        transition: "all 300ms ease",
        backgroundColor: active ? "#ffffff" : "transparent",
        color: active ? "#000000" : "#ffffff",
        border: active ? "1px solid #ffffff" : "none",
      }}
    >
      <div
        style={{
          width: "1.5rem",
          height: "1.5rem",
          borderRadius: "9999px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.75rem",
          fontWeight: 600,
          backgroundColor: active ? "#000000" : "rgba(255,255,255,0.1)",
          color: active ? "#ffffff" : "rgba(255,255,255,0.4)",
        }}
      >
        {number}
      </div>
      <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>{text}</span>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
        {label}
      </span>
      <span className="font-mono text-[11px] font-semibold text-stone-800">{value}</span>
    </div>
  );
}
