"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { decimalToStellarUnits, formatStellarUnits, type PublicWalletState } from "@/lib/publicWalletCore";
import type { WalletSecrets } from "@/lib/vaultCrypto";
import {
  decryptPrivateNote,
  encryptPrivateNote,
  type EncryptedPrivateNotePayload,
  type PrivateNoteSecrets,
} from "@/lib/noteCrypto";
import { signStellarPayload } from "@/lib/walletSigner";
import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  Banknote,
  Eye, 
  EyeOff, 
  Copy, 
  Check, 
  Loader2, 
  Plus, 
  Info,
  Lock,
  Trash2,
  Send,
  BookUser
} from "lucide-react";

const POOL_ID =
  process.env.NEXT_PUBLIC_POOL_ID ??
  "CCGTSXKMJUMPKKCZY7JMW4266XVLYCRM6I7ZIFWVGQBIDSGM7SVMAWXD";
const MAX_INTERACTIVE_RECIPIENTS = 5;

interface PrivateDashboardProps {
  wallet: WalletSecrets;
  openDrawer: (content: React.ReactNode) => void;
  initialNotes?: DecryptedNote[];
  initialPublicAccount?: PublicWalletState | null;
  initialContacts?: ContactView[];
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

interface PreparedDeposit {
  noteBlindingHex: string;
  noteCommitmentHex: string;
  amountUnits: string;
  unsignedXdr: string;
  signingPayloadBase64: string;
  dummyBlindingHex: string;
  dummyCommitmentHex: string;
}

interface DepositSubmitResult {
  txHash: string;
  minedLedger: number | null;
  leafIndex: number | null;
  indexingStatus: "indexed" | "pending_index" | "pending_mine";
  error?: string;
}

interface RecipientDraft {
  id: string;
  address: string;
  amount: string;
}

type SendMode = "lane1" | "lane2";

type BackgroundBatchPrompt = {
  recipientCount: number;
  totalAmountUnits: string;
  mode: SendMode;
};

interface ResolvedRecipient {
  userId: string;
  email: string;
  handle: string | null;
  stellarPublicKey: string;
  registeredInPool: boolean;
  bn254PublicHex: string;
  x25519PublicHex: string;
}

interface ContactView {
  id: string;
  status: string;
  direction: "incoming" | "outgoing" | "mutual";
  otherEmail: string | null;
  otherHandle: string | null;
  otherStellarPublicKey: string | null;
  otherRegisteredInPool: boolean | null;
  otherBn254PublicHex: string | null;
  otherX25519PublicHex: string | null;
}

interface SpendJobStepView {
  id: string;
  ordinal: number;
  recipientAddress: string;
  recipientUserId: string | null;
  recipientHandle: string | null;
  recipientNotePublicHex: string | null;
  recipientX25519PublicHex: string | null;
  recipientOutputCommitmentHex: string | null;
  recipientOutputLeafIndex: number | null;
  recipientEncryptedOutput: string | null;
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
    kind: string;
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

interface IncomingNoteView {
  id: string;
  commitmentHex: string;
  amountUnits: string;
  encryptedOutput: string;
  txHash: string | null;
  leafIndex: number | null;
  status: "pending" | "claimed" | "failed";
}

interface IncomingOutputEnvelope {
  version: 1;
  encryptedOutputKind: "spp-x25519-output-note";
  outputIndex: number;
  commitmentHex: string;
  amountUnits: string;
  recipientNotePublicHex: string;
  recipientX25519PublicHex: string;
  encryptedOutput: number[];
  extAmount: number | string;
}

interface DecryptOutputNoteResult {
  amountUnits: string;
  blindingHex: string;
  commitmentHex: string;
  expectedNullifierHex: string;
}

interface ProveResult {
  result: {
    status: "proof_ready";
    jobId: string;
    stepId: string;
    ordinal: number;
    recipientAddress: string;
    recipientUserId?: string | null;
    recipientHandle?: string | null;
    recipientOutputCommitmentHex?: string | null;
    recipientEncryptedOutput?: string | null;
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

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
  return data as T;
}

function activeNoteStatus(status: NoteStatus) {
  return status === "unspent" || status === "received";
}

function isNoteSpendable(item: DecryptedNote) {
  return activeNoteStatus(item.row.status) && !item.row.activeJobId;
}

function shortHash(value: string) {
  return value.length <= 16 ? value : `${value.slice(0, 8)}...${value.slice(-8)}`;
}

function createRecipientDraft(index: number): RecipientDraft {
  return { id: `recipient-${index}-${Date.now()}`, address: "", amount: index === 1 ? "10" : "" };
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(padded, "base64"));
  }
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function walletX25519PrivateHex(wallet: WalletSecrets): string {
  const privateKey = wallet.x25519PrivateJwk.d;
  if (!privateKey) {
    throw new Error("Wallet is missing the private encryption key");
  }
  return bytesToHex(base64UrlToBytes(privateKey));
}

function parseIncomingOutputEnvelope(input: string): IncomingOutputEnvelope {
  const parsed = JSON.parse(input) as IncomingOutputEnvelope;
  if (
    parsed.version !== 1 ||
    parsed.encryptedOutputKind !== "spp-x25519-output-note" ||
    !Array.isArray(parsed.encryptedOutput)
  ) {
    throw new Error("Incoming note has an invalid encrypted output envelope");
  }
  return parsed;
}

async function saveEncryptedNote(input: {
  note: PrivateNoteSecrets;
  wallet: WalletSecrets;
  status: NoteStatus;
  source: NoteSource;
  txHash?: string | null;
}) {
  const encrypted = await encryptPrivateNote(input.note, input.wallet);
  await parseResponse<{ note: { id: string } }>(
    await fetch("/api/wallet/notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commitmentHex: input.note.commitmentHex,
        encryptedNoteCiphertext: JSON.stringify(encrypted),
        amountUnits: input.note.amountUnits,
        leafIndex: input.note.leafIndex,
        status: input.status,
        source: input.source,
        txHash: input.txHash,
      }),
    }),
  );
}

const USDC_LOGO = "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdc.png";

function noteSerial(commitmentHex: string) {
  return commitmentHex.slice(-12).toUpperCase();
}

export default function PrivateDashboard({
  wallet,
  openDrawer,
  initialNotes,
  initialPublicAccount,
  initialContacts,
}: PrivateDashboardProps) {
  const [notes, setNotes] = useState<DecryptedNote[]>(initialNotes ?? []);
  const [selectedCommitment, setSelectedCommitment] = useState(
    () => initialNotes?.find(isNoteSpendable)?.note.commitmentHex ?? "",
  );
  const [filter, setFilter] = useState<"available" | "spent">("available");
  const [hideBalance, setHideBalance] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [spending, setSpending] = useState(false);
  const [finalizingDepositId, setFinalizingDepositId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const busy = refreshing || depositing || spending || finalizingDepositId !== null;
  
  // Public USDC balance state
  const [publicUsdcUnits, setPublicUsdcUnits] = useState(initialPublicAccount?.usdcUnits ?? "0");
  const [hasUsdcTrustline, setHasUsdcTrustline] = useState(
    initialPublicAccount?.hasUsdcTrustline ?? true,
  );

  // Persistent Right Card Tab State: "deposit" | "send"
  const [activeRightTab, setActiveRightTab] = useState<"deposit" | "send">("deposit");
  const [sendMode, setSendMode] = useState<SendMode>("lane1");

  // Form inputs
  const [depositAmount, setDepositAmount] = useState("25");
  const [sendRecipients, setSendRecipients] = useState<RecipientDraft[]>([
    { id: "recipient-1", address: "", amount: "10" }
  ]);
  const [lane2RecipientQuery, setLane2RecipientQuery] = useState("");
  const [resolvedRecipient, setResolvedRecipient] = useState<ResolvedRecipient | null>(null);
  const [resolvingRecipient, setResolvingRecipient] = useState(false);
  const [contactOptions, setContactOptions] = useState<ContactView[]>(
    () => (initialContacts ?? []).filter((contact) => contact.status === "accepted"),
  );
  const [backgroundBatchPrompt, setBackgroundBatchPrompt] =
    useState<BackgroundBatchPrompt | null>(null);

  const liveNotes = useMemo(() => notes.filter(isNoteSpendable), [notes]);
  const spentNotes = useMemo(() => notes.filter((item) => !isNoteSpendable(item)), [notes]);

  const selectedNote = useMemo(() => {
    return notes.find((item) => item.note.commitmentHex === selectedCommitment) ?? liveNotes[0] ?? null;
  }, [notes, selectedCommitment, liveNotes]);

  const privateBalanceUnits = useMemo(
    () => liveNotes.reduce((total, item) => total + BigInt(item.note.amountUnits), BigInt(0)).toString(),
    [liveNotes],
  );

  const publicUsdcRaw = useMemo(() => {
    return Number(formatStellarUnits(publicUsdcUnits, "").split(" ")[0]);
  }, [publicUsdcUnits]);

  const refreshPublicBalance = useCallback(async () => {
    try {
      const response = await fetch(`/api/wallet/public/account?address=${encodeURIComponent(wallet.stellarPublicKey)}`, { cache: "no-store" });
      if (response.ok) {
        const next = await response.json();
        setPublicUsdcUnits(next.usdcUnits || "0");
        setHasUsdcTrustline(next.hasUsdcTrustline ?? true);
      }
    } catch (err) {
      console.error("Failed to load public balance:", err);
    }
  }, [wallet.stellarPublicKey]);

  const claimIncomingNotes = useCallback(async () => {
    const data = await parseResponse<{ incomingNotes: IncomingNoteView[] }>(
      await fetch("/api/wallet/incoming-notes?status=pending", { cache: "no-store" }),
    );
    let claimedCount = 0;
    for (const incoming of data.incomingNotes) {
      if (incoming.status !== "pending" || incoming.leafIndex === null) continue;
      try {
        const envelope = parseIncomingOutputEnvelope(incoming.encryptedOutput);
        const decrypted = await parseResponse<DecryptOutputNoteResult>(
          await fetch("/api/wallet/keys/decrypt-output-note", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              notePrivateKeyHex: wallet.bn254NotePrivateKeyHex,
              encryptionPrivateKeyHex: walletX25519PrivateHex(wallet),
              commitmentHex: incoming.commitmentHex,
              leafIndex: incoming.leafIndex,
              encryptedOutput: envelope.encryptedOutput,
            }),
          }),
        );

        const note: PrivateNoteSecrets = {
          blindingHex: decrypted.blindingHex,
          commitmentHex: decrypted.commitmentHex,
          amountUnits: decrypted.amountUnits,
          leafIndex: incoming.leafIndex,
          dummyBlindingHex: "",
          dummyCommitmentHex: "",
          createdAt: Date.now(),
        };
        await saveEncryptedNote({
          note,
          wallet,
          status: "received",
          source: "received",
          txHash: incoming.txHash,
        });
        await parseResponse<{ incomingNote: { id: string; status: string } }>(
          await fetch("/api/wallet/incoming-notes", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              incomingNoteId: incoming.id,
              commitmentHex: incoming.commitmentHex,
            }),
          }),
        );
        claimedCount += 1;
      } catch (err) {
        console.warn("Could not claim incoming note:", err);
      }
    }
    if (claimedCount > 0) {
      setStatusMsg(
        `${claimedCount} received private note${claimedCount === 1 ? "" : "s"} added to your vault.`,
      );
    }
  }, [wallet]);

  const refreshNotes = useCallback(async () => {
    try {
      await claimIncomingNotes();
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
      setNotes(decrypted);
      setSelectedCommitment((current) => {
        if (decrypted.some((item) => item.note.commitmentHex === current && isNoteSpendable(item))) {
          return current;
        }
        return decrypted.find(isNoteSpendable)?.note.commitmentHex ?? "";
      });
    } catch (err) {
      console.error(err);
    }
  }, [claimIncomingNotes, wallet]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    setErrorMsg("");
    setStatusMsg("");
    try {
      await Promise.all([refreshNotes(), refreshPublicBalance()]);
    } catch (err) {
      console.error(err);
    } finally {
      setRefreshing(false);
    }
  }, [refreshNotes, refreshPublicBalance]);

  useEffect(() => {
    if (initialNotes === undefined) return;
    setNotes(initialNotes);
    setSelectedCommitment((current) => {
      if (initialNotes.some((item) => item.note.commitmentHex === current && isNoteSpendable(item))) {
        return current;
      }
      return initialNotes.find(isNoteSpendable)?.note.commitmentHex ?? "";
    });
  }, [initialNotes]);

  const markSelectedNoteLocked = useCallback((noteId: string, jobId: string) => {
    setNotes((current) =>
      current.map((item) =>
        item.row.id === noteId
          ? {
              ...item,
              row: {
                ...item.row,
                status: "pending_spend",
                activeJobId: jobId,
              },
            }
          : item,
      ),
    );
    setSelectedCommitment("");
  }, []);

  useEffect(() => {
    if (initialPublicAccount === undefined) return;
    setPublicUsdcUnits(initialPublicAccount?.usdcUnits ?? "0");
    setHasUsdcTrustline(initialPublicAccount?.hasUsdcTrustline ?? true);
  }, [initialPublicAccount]);

  useEffect(() => {
    if (initialNotes !== undefined && initialPublicAccount !== undefined) return;
    void refreshAll();
  }, [initialNotes, initialPublicAccount, refreshAll]);

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

  const displayedNotes = filter === "available" ? liveNotes : spentNotes;

  // Sorted notes so the selected card is drawn last (on top in stack)
  const sortedNotes = useMemo(() => {
    if (displayedNotes.length === 0) return [];
    return [...displayedNotes].sort((a, b) => {
      if (a.note.commitmentHex === selectedCommitment) return 1;
      if (b.note.commitmentHex === selectedCommitment) return -1;
      return a.note.createdAt - b.note.createdAt;
    });
  }, [displayedNotes, selectedCommitment]);

  // Cycle to the next note if the top (selected) note is clicked
  const cycleNotes = () => {
    if (displayedNotes.length <= 1) return;
    const currentIndex = displayedNotes.findIndex(n => n.note.commitmentHex === selectedCommitment);
    const nextIndex = (currentIndex + 1) % displayedNotes.length;
    setSelectedCommitment(displayedNotes[nextIndex].note.commitmentHex);
  };

  // Handle Deposit submit inside persistent tab
  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDepositing(true);
    setErrorMsg("");
    setStatusMsg("Generating private deposit proof...");
    try {
      const amountUnits = decimalToStellarUnits(depositAmount);
      
      const prepared = await parseResponse<PreparedDeposit>(
        await fetch("/api/wallet/private/deposit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: "prepare",
            source: wallet.stellarPublicKey,
            amountUnits,
            poolId: POOL_ID,
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

      setStatusMsg("Saving pending note before submission...");
      await saveEncryptedNote({
        note: pendingNote,
        wallet,
        status: "pending_deposit",
        source: "deposit",
        txHash: null,
      });

      setStatusMsg("Signing private deposit transaction...");
      const signature = signStellarPayload({
        stellarSecretKey: wallet.stellarSecretKey,
        payloadBase64: prepared.signingPayloadBase64,
      });

      setStatusMsg("Submitting deposit & indexing note secrets...");
      const submitted = await parseResponse<DepositSubmitResult>(
        await fetch("/api/wallet/private/deposit", {
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

      if (submitted.indexingStatus !== "indexed" || submitted.leafIndex === null) {
        await saveEncryptedNote({
          note: pendingNote,
          wallet,
          status: "pending_deposit",
          source: "deposit",
          txHash: submitted.txHash,
        });
        await refreshAll();
        setStatusMsg(
          submitted.indexingStatus === "pending_mine"
            ? `Deposit submitted as ${shortHash(submitted.txHash)}. Waiting for mining confirmation.`
            : `Deposit submitted as ${shortHash(submitted.txHash)}. Note indexing is still catching up.`,
        );
        return;
      }

      const note: PrivateNoteSecrets = {
        ...pendingNote,
        leafIndex: submitted.leafIndex,
      };
      
      await saveEncryptedNote({
        note,
        wallet,
        status: "unspent",
        source: "deposit",
        txHash: submitted.txHash,
      });

      setDepositAmount("25");
      await refreshAll();
      setSelectedCommitment(note.commitmentHex);
      setStatusMsg("Success! Shielded note deposited into your vault.");
    } catch (err) {
      setErrorMsg(String(err));
      setStatusMsg("");
    } finally {
      setDepositing(false);
    }
  };

  async function finalizePendingDeposit(item: DecryptedNote) {
    setFinalizingDepositId(item.row.id);
    setErrorMsg("");
    setStatusMsg("Finalizing pending deposit...");
    try {
      const submitted = await parseResponse<DepositSubmitResult>(
        await fetch("/api/wallet/private/deposit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: "finalize",
            noteCommitmentHex: item.note.commitmentHex,
            txHash: item.row.txHash,
          }),
        }),
      );

      if (submitted.indexingStatus !== "indexed" || submitted.leafIndex === null) {
        await saveEncryptedNote({
          note: item.note,
          wallet,
          status: "pending_deposit",
          source: "deposit",
          txHash: submitted.txHash ?? item.row.txHash,
        });
        await refreshAll();
        setStatusMsg("Deposit is still pending chain indexing. Try again shortly.");
        return;
      }

      const finalizedNote: PrivateNoteSecrets = {
        ...item.note,
        leafIndex: submitted.leafIndex,
      };
      await saveEncryptedNote({
        note: finalizedNote,
        wallet,
        status: "unspent",
        source: "deposit",
        txHash: submitted.txHash ?? item.row.txHash,
      });
      await refreshAll();
      setSelectedCommitment(finalizedNote.commitmentHex);
      setStatusMsg("Pending deposit finalized and added to spendable balance.");
    } catch (err) {
      setErrorMsg(String(err));
      setStatusMsg("");
    } finally {
      setFinalizingDepositId(null);
    }
  }

  const resolveLane2Recipient = async () => {
    const query = lane2RecipientQuery.trim();
    if (!query) throw new Error("Enter a VEIL email, user id, or wallet address");
    setResolvingRecipient(true);
    try {
      const data = await parseResponse<{ recipient: ResolvedRecipient | null; registeredInPool: boolean }>(
        await fetch(`/api/wallet/resolve?query=${encodeURIComponent(query)}`, { cache: "no-store" }),
      );
      if (!data.recipient || !data.registeredInPool) {
        throw new Error("Recipient has not finished wallet registration");
      }
      setResolvedRecipient(data.recipient);
      return data.recipient;
    } finally {
      setResolvingRecipient(false);
    }
  };

  const resolveDirectRecipientAddress = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) throw new Error("Enter an email, user id, or Stellar address");
    if (/^G[A-Z0-9]{55}$/.test(trimmed)) return trimmed;
    const data = await parseResponse<{ recipient: ResolvedRecipient | null; registeredInPool: boolean }>(
      await fetch(
        `/api/wallet/resolve?mode=public&query=${encodeURIComponent(trimmed)}`,
        { cache: "no-store" },
      ),
    );
    if (!data.recipient?.stellarPublicKey) {
      throw new Error("No public wallet address found for this recipient");
    }
    return data.recipient.stellarPublicKey;
  };

  const resolveDirectRecipient = async (id: string) => {
    setResolvingRecipient(true);
    try {
      const item = sendRecipients.find((recipient) => recipient.id === id);
      if (!item) return;
      const address = await resolveDirectRecipientAddress(item.address);
      updateRecipientField(id, "address", address);
    } finally {
      setResolvingRecipient(false);
    }
  };

  // Spend/Send helper
  const runJobFromNote = async (jobId: string, startingNote: PrivateNoteSecrets) => {
    let currentNote = startingNote;
    for (let guard = 0; guard < 100; guard += 1) {
      if (currentNote.leafIndex === null) {
        throw new Error("This private note is still pending deposit indexing");
      }
      setStatusMsg(`Proving step ${guard + 1} locally...`);
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
      setStatusMsg(`Relaying step ${proved.result.ordinal} output...`);
      const submitted = await parseResponse<SubmitResult>(
        await fetch(`/api/wallet/private/spend-jobs/${jobId}/advance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: "submit",
            stepId: proved.result.stepId,
            encryptedChangeNoteCiphertext: JSON.stringify(encryptedChange),
          }),
        }),
      );

      currentNote = {
        ...proved.result.changeNote,
        leafIndex: submitted.result.changeLeaf,
        amountUnits: submitted.result.changeAmountUnits,
      };

      if (submitted.job?.job.status === "completed") {
        setStatusMsg("Success! Payment transaction complete.");
        return;
      }
    }
  };

  const submitPrivateSend = async ({
    backgroundApproved = false,
  }: { backgroundApproved?: boolean } = {}) => {
    if (!selectedNote) return;
    setSpending(true);
    setErrorMsg("");
    setStatusMsg("Registering private send job...");
    try {
      if (!isNoteSpendable(selectedNote)) {
        throw new Error("This private note is already locked by an active payment job");
      }
      if (selectedNote.note.leafIndex === null) {
        throw new Error("This private note is still pending deposit indexing");
      }
      const lane2Recipient =
        sendMode === "lane2" ? resolvedRecipient ?? (await resolveLane2Recipient()) : null;
      const validRecipients =
        sendMode === "lane2"
          ? [
              {
                address: lane2Recipient?.stellarPublicKey ?? "",
                amountUnits: decimalToStellarUnits(sendRecipients[0]?.amount.trim() ?? ""),
                recipientUserId: lane2Recipient?.userId ?? null,
                recipientHandle: lane2Recipient?.handle ?? null,
                recipientNotePublicHex: lane2Recipient?.bn254PublicHex ?? null,
                recipientX25519PublicHex: lane2Recipient?.x25519PublicHex ?? null,
              },
            ]
          : await Promise.all(
              sendRecipients
                .filter((item) => item.address.trim() && item.amount.trim())
                .map(async (item) => ({
                  address: await resolveDirectRecipientAddress(item.address),
                  amountUnits: decimalToStellarUnits(item.amount.trim()),
                })),
            );

      if (validRecipients.length === 0) throw new Error("Add at least one recipient");
      const totalOut = validRecipients.reduce((total, item) => total + BigInt(item.amountUnits), BigInt(0));
      if (totalOut > BigInt(selectedNote.note.amountUnits)) {
        throw new Error("Total transfer amount exceeds note capacity");
      }

      const useBackgroundWorker = validRecipients.length > MAX_INTERACTIVE_RECIPIENTS;
      if (useBackgroundWorker && !backgroundApproved) {
        setBackgroundBatchPrompt({
          recipientCount: validRecipients.length,
          totalAmountUnits: totalOut.toString(),
          mode: sendMode,
        });
        setStatusMsg("");
        return;
      }
      setBackgroundBatchPrompt(null);

      const created = await parseResponse<{ job: SpendJobView }>(
        await fetch("/api/wallet/private/spend-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceNoteId: selectedNote.row.id,
            sourceCommitmentHex: selectedNote.note.commitmentHex,
            sourceAmountUnits: selectedNote.note.amountUnits,
            sourceLeafIndex: selectedNote.note.leafIndex,
            poolId: POOL_ID,
            kind: sendMode === "lane2" ? "lane2_transfer" : "lane1_withdraw",
            idempotencyKey: `${sendMode}-${selectedNote.note.commitmentHex}-${Date.now()}`,
            recipients: validRecipients,
            backgroundConsent: useBackgroundWorker,
            executionPackage: useBackgroundWorker
              ? {
                  notePrivateKeyHex: wallet.bn254NotePrivateKeyHex,
                  senderEncryptionPublicHex: wallet.x25519PublicHex,
                  membershipBlindingHex: wallet.membershipBlindingHex,
                  activeNote: selectedNote.note,
                }
              : undefined,
          }),
        }),
	      );
	      markSelectedNoteLocked(selectedNote.row.id, created.job.job.id);

      if (useBackgroundWorker) {
        setStatusMsg("Batch queued for background execution. Activity will update as each payment completes.");
      } else {
        await runJobFromNote(created.job.job.id, selectedNote.note);
      }
      setSendRecipients([{ id: "recipient-1", address: "", amount: "10" }]);
      setResolvedRecipient(null);
      setLane2RecipientQuery("");
      await refreshAll();
    } catch (err) {
      setErrorMsg(String(err));
      setStatusMsg("");
      await refreshAll().catch(() => undefined);
    } finally {
      setSpending(false);
    }
  };

  const handlePrivateSend = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitPrivateSend();
  };

  const setPercentAmount = (percent: number) => {
    if (activeRightTab === "deposit") {
      setDepositAmount((publicUsdcRaw * percent).toFixed(6));
    } else if (activeRightTab === "send" && selectedNote) {
      const noteBal = Number(formatStellarUnits(selectedNote.note.amountUnits, "").split(" ")[0]);
      setSendRecipients(prev => {
        const next = [...prev];
        if (next[0]) next[0].amount = (noteBal * percent).toFixed(6);
        return next;
      });
    }
  };

  const addRecipientInput = () => {
    setSendRecipients(prev => [...prev, createRecipientDraft(prev.length + 1)]);
  };

  const removeRecipientInput = (id: string) => {
    setSendRecipients(prev => prev.length <= 1 ? prev : prev.filter(r => r.id !== id));
  };

  const updateRecipientField = (id: string, field: "address" | "amount", value: string) => {
    setSendRecipients(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  // Open note details pop-up modal/drawer
  const openNoteDetails = (item: DecryptedNote) => {
    openDrawer(
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-bold text-stone-900 font-sans">Note Secrets</h3>
          <p className="text-xs text-stone-500 mt-1">Shielded parameters loaded client-side from your local vault.</p>
        </div>

        <div className="space-y-4 rounded-2xl bg-stone-50 border border-stone-200 p-4 font-mono text-xs text-stone-700 divide-y divide-stone-150">
          <div className="pb-3 flex justify-between items-start">
            <div>
              <span className="text-[10px] uppercase font-bold text-stone-400">Value</span>
              <p className="mt-0.5 text-stone-900 font-bold text-sm">
                {formatStellarUnits(item.note.amountUnits, "USDC")}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-stone-400">Note Profile</span>
              <p className="mt-0.5 text-stone-900 font-bold">{shortHash(item.note.commitmentHex)}</p>
            </div>
          </div>

          <div className="py-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase font-bold text-stone-400">Commitment Hash</span>
              <button 
                type="button"
                onClick={() => navigator.clipboard.writeText(item.note.commitmentHex)} 
                className="text-stone-400 hover:text-stone-600 transition"
              >
                <Copy size={11} />
              </button>
            </div>
            <p className="mt-1 break-all text-[10px] text-stone-900 bg-white p-2 rounded-xl border border-stone-100 leading-relaxed select-all">
              {item.note.commitmentHex}
            </p>
          </div>

          <div className="py-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase font-bold text-stone-400">Blinding Hex</span>
              <button 
                type="button"
                onClick={() => navigator.clipboard.writeText(item.note.blindingHex)} 
                className="text-stone-400 hover:text-stone-600 transition"
              >
                <Copy size={11} />
              </button>
            </div>
            <p className="mt-1 break-all text-[10px] text-stone-900 bg-white p-2 rounded-xl border border-stone-100 leading-relaxed select-all">
              {item.note.blindingHex}
            </p>
          </div>

          <div className="pt-3 flex justify-between items-center">
            <div>
              <span className="text-[10px] uppercase font-bold text-stone-400">Leaf Index</span>
              <p className="mt-0.5 text-stone-900 font-bold">
                {item.note.leafIndex !== null ? item.note.leafIndex : "Pending Indexing..."}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-stone-400">Status</span>
              <p className="mt-0.5 font-bold uppercase text-[9px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                {item.row.status}
              </p>
            </div>
          </div>
        </div>

        {item.row.status === "pending_deposit" && (
          <button
            type="button"
            onClick={() => void finalizePendingDeposit(item)}
            disabled={busy}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-stone-950 px-4 text-xs font-bold uppercase tracking-widest text-white transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {finalizingDepositId === item.row.id ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Finalizing...</span>
              </>
            ) : (
              <span>Finalize Deposit</span>
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] max-w-[1600px] w-full mx-auto px-4 lg:px-6 lg:h-[calc(100vh-112px)] min-h-[calc(100vh-112px)] items-stretch">
      
      {/* LEFT COLUMN - Balance, private currency notes, and balance cards */}
      <div className="flex flex-col gap-4 lg:h-full lg:max-h-full lg:overflow-y-auto no-scrollbar min-h-0">
        
        {/* SHIELDED BALANCE CARD (Theme Gradient matching public page style) */}
        <div className="relative overflow-hidden rounded-3xl border border-indigo-200/50 bg-gradient-to-br from-indigo-50/70 to-[#ECE9FF] p-5 shadow-sm shrink-0">
          {/* Large elegant subtle background lock */}
          <div className="absolute right-6 top-1/2 -translate-y-1/2 select-none opacity-[0.06] text-[180px] font-black text-indigo-950 pointer-events-none leading-none">
            <Lock size={120} strokeWidth={1} />
          </div>

          <div className="relative flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-850/70 font-sans">
                  Shielded Vault Balance
                </span>
                <button 
                  type="button"
                  onClick={() => setHideBalance(!hideBalance)}
                  className="text-indigo-800/60 hover:text-indigo-950 transition"
                >
                  {hideBalance ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
              
              <h1 className="mt-1 text-3xl lg:text-4xl font-bold tracking-tight text-stone-900 font-mono">
                {hideBalance ? "•••••" : `${formatStellarUnits(privateBalanceUnits, "USDC")}`}
              </h1>

              <p className="mt-1 text-[9px] font-bold text-indigo-850/65 uppercase tracking-wider font-sans">
                ZK-Proof Shielded Enclave
              </p>
            </div>

            {/* Quick Actions trigger Persistent Tabs */}
            <div className="mt-4 flex flex-wrap gap-2">
              <button 
                type="button"
                onClick={refreshAll}
                disabled={busy}
                className="flex items-center justify-center min-w-[80px] gap-1.5 rounded-xl bg-stone-950 px-3.5 py-2 text-xs font-bold text-white transition-all hover:bg-stone-800 active:scale-95 disabled:opacity-50"
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
                type="button"
                onClick={() => setActiveRightTab("deposit")}
                className="flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-stone-850 border border-indigo-200/50 shadow-sm hover:bg-indigo-50/30 transition active:scale-95"
              >
                <ArrowDownLeft size={12} className="text-indigo-650" />
                Deposit
              </button>

              <button 
                type="button"
                onClick={() => setActiveRightTab("send")}
                disabled={liveNotes.length === 0}
                className="flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-stone-850 border border-indigo-200/50 shadow-sm hover:bg-indigo-50/30 transition active:scale-95 disabled:opacity-50"
              >
                <ArrowUpRight size={12} className="text-indigo-650" />
                Send Shielded
              </button>
            </div>
          </div>
        </div>

        {/* PRIVATE CURRENCY NOTES BLOCK */}
        <section className="flex flex-col min-h-0 flex-1 overflow-hidden px-1">
          
          {/* Notes Toggle Header */}
          <div className="flex shrink-0 items-center justify-between gap-3 pb-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-normal text-stone-500 font-sans">Private Currency Notes</p>
              <h2 className="mt-0.5 text-lg font-semibold tracking-normal text-stone-950">Spendable note stack</h2>
            </div>
            
            {/* Toggle switch above notes stack */}
            <div className="flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 p-0.5 text-[9px] font-sans shadow-[0_8px_22px_rgba(43,38,28,0.04)]">
              <button
                type="button"
                onClick={() => setFilter("available")}
                className={`rounded-full px-2.5 py-1 font-bold transition ${
                  filter === "available" ? "bg-white text-stone-950 shadow-sm" : "text-stone-550 hover:text-stone-800"
                }`}
              >
                Available ({liveNotes.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter("spent")}
                className={`rounded-full px-2.5 py-1 font-bold transition ${
                  filter === "spent" ? "bg-white text-stone-950 shadow-sm" : "text-stone-550 hover:text-stone-800"
                }`}
              >
                Spent ({spentNotes.length})
              </button>
            </div>
          </div>

          {/* Tactile 3D stacked notes viewport - Notes span full width of parent card content padding width */}
          <div className="relative h-[230px] max-h-[230px] flex items-center justify-center overflow-visible perspective-[1000px] select-none py-1 w-full shrink-0">
            {sortedNotes.length === 0 ? (
              <div className="flex h-[200px] flex-col items-center justify-center text-center p-4">
                <Banknote className="h-6 w-6 text-stone-300 mb-2" />
                <p className="text-xs text-stone-400 font-medium">No notes in stack.</p>
              </div>
            ) : (
              sortedNotes.map((item, idx) => {
                const isSelected = item.note.commitmentHex === selectedCommitment;
                const total = sortedNotes.length;
                const revIndex = total - 1 - idx; // selected note has index total-1, so revIndex is 0 (top)

                // 3D Stacking translates (Notes stretch exactly to fit left-6 and right-6 borders of parent card space)
                const yOffset = isSelected ? 0 : revIndex * 8;
                const scale = isSelected ? 1 : Math.max(0.92, 1 - revIndex * 0.02);
                const rotate = isSelected ? 0 : (revIndex % 2 === 0 ? 0.6 : -0.6);
                const zIndex = idx; // DOM order correctly overlay cards

                return (
                  <motion.div
                    key={item.note.commitmentHex}
                    layout
                    onClick={() => {
                      if (isSelected) {
                        cycleNotes();
                      } else {
                        setSelectedCommitment(item.note.commitmentHex);
                      }
                      setActiveRightTab("send");
                    }}
                    animate={{
                      y: yOffset,
                      scale: scale,
                      rotate: rotate,
                      zIndex: zIndex,
                    }}
                    transition={{
                      type: "spring",
                      stiffness: 280,
                      damping: 24,
                    }}
                    className="absolute inset-x-0 h-[200px] rounded-[1.15rem] border border-[oklch(73%_0.034_88)] bg-[oklch(96%_0.018_90)] p-4 select-none flex flex-col justify-between cursor-pointer transition-shadow hover:shadow-none"
                    style={{ transformStyle: "preserve-3d" }}
                  >
                    <div className="pointer-events-none absolute inset-0 opacity-85 [background-image:radial-gradient(ellipse_at_50%_48%,oklch(74%_0.042_145/.24),transparent_44%),repeating-radial-gradient(ellipse_at_18%_50%,oklch(48%_0.042_150/.16)_0_1px,transparent_1px_7px),repeating-linear-gradient(100deg,transparent_0_14px,oklch(54%_0.038_142/.14)_14px_15px)]" />
                    
                    <div className="absolute inset-3 rounded-[0.82rem] border border-[oklch(68%_0.034_88)] pointer-events-none" />
                    <div className="absolute inset-5 rounded-[0.58rem] border border-[oklch(80%_0.024_92/.78)] pointer-events-none" />
                    <div className="pointer-events-none absolute inset-x-10 top-1/2 h-18 -translate-y-1/2 rounded-[999px] border border-[oklch(69%_0.04_145/.54)] opacity-75" />
                    <div className="pointer-events-none absolute inset-x-20 top-1/2 h-12 -translate-y-1/2 rounded-[999px] border border-[oklch(71%_0.042_88/.5)] opacity-75" />

                    <div className="relative flex justify-between items-center gap-4 text-[10px] uppercase font-bold tracking-normal">
                      <div className="flex items-center gap-1.5">
                        <span style={{ fontFamily: '"Cinzel", serif' }} className="text-[10px] font-black text-[oklch(34%_0.045_80)]">
                          VEIL private note
                        </span>
                      </div>
                      <span className="rounded-md border border-[oklch(77%_0.03_88)] bg-[oklch(97%_0.012_88/.78)] px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase text-[oklch(35%_0.04_80)] shadow-sm">
                        SN {noteSerial(item.note.commitmentHex)}
                      </span>
                    </div>

                    <div className="absolute inset-x-9 top-1/2 -translate-y-1/2 flex items-center justify-between pointer-events-none">
                      <div className="h-px flex-1 bg-[repeating-linear-gradient(90deg,oklch(65%_0.035_88)_0_5px,transparent_5px_10px)] opacity-65" />
                      <div className="mx-4 flex h-16 min-w-[200px] flex-col items-center justify-center rounded-[999px] border border-[oklch(70%_0.038_145/.6)] bg-[oklch(95%_0.018_92/.58)] px-8 text-center">
                        <span className="text-[8px] font-bold uppercase text-[oklch(42%_0.05_148)]">USDC</span>
                        <span className="text-2xl font-semibold tracking-normal text-[oklch(27%_0.055_82)]">
                          {hideBalance ? "••••" : formatStellarUnits(item.note.amountUnits, "").split(" ")[0]}
                        </span>
                      </div>
                      <div className="h-px flex-1 bg-[repeating-linear-gradient(90deg,oklch(65%_0.035_88)_0_5px,transparent_5px_10px)] opacity-65" />
                    </div>

                    <div className="relative flex justify-between items-end pt-2 border-t border-[oklch(78%_0.024_88/.58)]">
                      <div>
                        <p className="text-[8px] uppercase tracking-normal font-sans font-semibold text-[oklch(46%_0.04_86)]">
                          Commitment
                        </p>
                        <p className="font-mono text-[9px] font-bold text-[oklch(32%_0.045_78)]">
                          {shortHash(item.note.commitmentHex)}
                        </p>
                        <p className="mt-0.5 font-mono text-[8px] font-semibold text-[oklch(39%_0.04_80/.78)]">
                          Leaf {item.note.leafIndex ?? "Pending"}
                        </p>
                      </div>
                      
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openNoteDetails(item);
                        }}
                        className="relative z-20 flex h-7.5 w-7.5 items-center justify-center rounded-full border border-[oklch(75%_0.035_88)] bg-[oklch(97%_0.012_88/.86)] text-[oklch(34%_0.05_75)] shadow-sm transition hover:bg-[oklch(99%_0.008_88)] active:scale-95"
                      >
                        <Eye size={12} />
                      </button>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
          
        </section>

        <PrivateBalanceBand
          hideBalance={hideBalance}
          privateBalanceUnits={privateBalanceUnits}
          publicUsdcUnits={publicUsdcUnits}
          spendableNotes={liveNotes.length}
        />
      </div>

      {/* RIGHT COLUMN - PERSISTENT ACTIONS CARD MATCHING HEIGHT OF LEFT COLUMN */}
      <div className="overflow-y-auto no-scrollbar flex flex-col lg:h-full w-full lg:max-h-[calc(100vh-112px)] min-h-0 p-1">
        
        {/* Toggle Headings (Premium Pill toggle style matching TopHeader) */}
        <div className="flex justify-center mb-6 shrink-0">
          <div className="relative flex h-9.5 items-center rounded-full bg-stone-100/60 p-0.5">
            <button
              type="button"
              onClick={() => setActiveRightTab("deposit")}
              className="relative z-10 flex h-full w-28 items-center justify-center rounded-full text-xs font-bold tracking-wide transition-colors duration-200"
              style={{ color: activeRightTab === "deposit" ? "#0c0a09" : "#7c726a" }}
            >
              Deposit
              {activeRightTab === "deposit" && (
                <motion.div
                  layoutId="private-tab-indicator"
                  className="absolute inset-0 -z-10 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                  transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}
                />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveRightTab("send")}
              disabled={liveNotes.length === 0}
              className="relative z-10 flex h-full w-28 items-center justify-center rounded-full text-xs font-bold tracking-wide transition-colors duration-200 disabled:opacity-40"
              style={{ color: activeRightTab === "send" ? "#0c0a09" : "#7c726a" }}
            >
              Send
              {activeRightTab === "send" && (
                <motion.div
                  layoutId="private-tab-indicator"
                  className="absolute inset-0 -z-10 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                  transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}
                />
              )}
            </button>
          </div>
        </div>

        {/* Tab Body (Stretches full height, layout centers short forms cleanly with my-auto) */}
        <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col min-h-0">
          
          <div className="my-auto w-full space-y-6">
            {/* TAB 1: SHIELDED DEPOSIT FORM */}
            {activeRightTab === "deposit" && (
              <form onSubmit={handleDeposit} className="space-y-6">
                
                {/* DEPOSIT INPUT BLOCK */}
                <div className="rounded-xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-stone-100 relative">
                  <div className="flex justify-between items-center text-[10px] font-bold tracking-wider text-stone-400">
                    <span>DEPOSIT FROM PUBLIC</span>
                    <span>PUBLIC BAL: {formatStellarUnits(publicUsdcUnits, "").split(" ")[0]} USDC</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <input 
                      type="text" 
                      placeholder="0"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="bg-transparent text-3xl font-semibold outline-none text-stone-900 placeholder:text-stone-300 w-full font-mono mt-1"
                    />
                    <div className="flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-1 font-semibold text-xs text-stone-800 shrink-0">
                      <img src={USDC_LOGO} alt="" className="w-4 h-4 object-contain" />
                      <span>USDC</span>
                    </div>
                  </div>
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

                <div className="rounded-lg bg-amber-50/50 p-3.5 text-xs leading-relaxed text-amber-900 flex gap-2">
                  <Info size={14} className="shrink-0 mt-0.5 text-amber-700" />
                  <span>Depositing shields public USDC into a ZK-proof note inside your vault. The transaction depositor wallet remains public on the ledger.</span>
                </div>

                {/* DEPOSIT ACTION BUTTON */}
                <button
                  type="submit"
                  disabled={busy || !hasUsdcTrustline || publicUsdcRaw <= 0}
                  className="w-full h-12 rounded-xl bg-stone-950 text-white font-bold text-xs uppercase tracking-widest hover:bg-stone-800 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {depositing ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>{statusMsg || "Creating Private Note..."}</span>
                    </>
                  ) : (
                    <span>Create Private Note</span>
                  )}
                </button>
              </form>
            )}

            {/* TAB 2: SHIELDED SEND/SPEND FORM */}
            {activeRightTab === "send" && selectedNote && (
              <form onSubmit={handlePrivateSend} className="space-y-6">
                <div className="grid grid-cols-2 gap-1 rounded-full bg-stone-100/60 p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSendMode("lane1");
                      setResolvedRecipient(null);
                    }}
                    className={`h-8.5 rounded-full text-xs font-bold transition ${
                      sendMode === "lane1"
                        ? "bg-white text-stone-950 shadow-sm"
                        : "text-stone-500 hover:text-stone-850"
                    }`}
                  >
                    Direct-2-Wallet
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSendMode("lane2");
                      setSendRecipients((current) => [current[0] ?? createRecipientDraft(1)]);
                    }}
                    className={`h-8.5 rounded-full text-xs font-bold transition ${
                      sendMode === "lane2"
                        ? "bg-white text-stone-950 shadow-sm"
                        : "text-stone-500 hover:text-stone-850"
                    }`}
                  >
                    Note-2-Note
                  </button>
                </div>
                
                {/* SOURCE NOTE PICKER */}
                <div className="rounded-xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-stone-100 relative">
                  <div className="flex justify-between items-center text-[10px] font-bold tracking-wider text-stone-400">
                    <span>SOURCE NOTE</span>
                    <span>CAPACITY: {formatStellarUnits(selectedNote.note.amountUnits, "USDC")}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <select
                      className="bg-transparent font-semibold outline-none text-stone-900 text-sm w-full font-mono cursor-pointer"
                      disabled={busy || liveNotes.length === 0}
                      onChange={(e) => setSelectedCommitment(e.target.value)}
                      value={selectedNote.note.commitmentHex}
                    >
                      {liveNotes.map((item) => (
                        <option key={item.note.commitmentHex} value={item.note.commitmentHex}>
                          {shortHash(item.note.commitmentHex)} · ({formatStellarUnits(item.note.amountUnits, "")} USDC)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* RECIPIENTS SECTION */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                      {sendMode === "lane2" ? "Note-2-Note recipient" : "Direct-2-Wallet recipients"}
                    </span>
                    {sendMode === "lane1" && (
                      <button 
                        type="button"
                        onClick={addRecipientInput}
                        className="text-[10px] font-bold uppercase tracking-wider text-stone-700 hover:text-stone-950 underline"
                      >
                        + Add Recipient
                      </button>
                    )}
                  </div>

                  {sendMode === "lane2" && (
                    <div className="rounded-xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-stone-100 space-y-4">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Email, @user id, or Stellar address"
                          value={lane2RecipientQuery}
                          onChange={(e) => {
                            setLane2RecipientQuery(e.target.value);
                            setResolvedRecipient(null);
                          }}
                          className="h-12 min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10 focus:outline-none transition"
                        />
                        {contactOptions.length > 0 && (
                          <div className="relative h-12 w-12 shrink-0">
                            <select
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                              onChange={(e) => {
                                const contact = contactOptions.find((c) => c.id === e.target.value);
                                if (contact) {
                                  setLane2RecipientQuery(contact.otherHandle ? `@${contact.otherHandle}` : contact.otherEmail ?? contact.otherStellarPublicKey ?? "");
                                  setResolvedRecipient(null);
                                }
                                e.target.value = "";
                              }}
                              value=""
                            >
                              <option value="">Contacts</option>
                              {contactOptions.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.otherHandle ? `@${c.otherHandle}` : c.otherEmail ?? shortHash(c.otherStellarPublicKey ?? "")}
                                </option>
                              ))}
                            </select>
                            <div className="absolute inset-0 pointer-events-none flex items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                              <BookUser size={18} />
                            </div>
                          </div>
                        )}
                        <button
                          type="button"
                          disabled={busy || resolvingRecipient}
                          onClick={() => void resolveLane2Recipient().catch((err) => setErrorMsg(String(err)))}
                          className="h-12 rounded-xl bg-stone-950 px-5 text-[10px] font-bold uppercase tracking-wider text-white transition hover:bg-stone-800 disabled:opacity-50 shrink-0"
                        >
                          {resolvingRecipient ? "Finding" : "Find"}
                        </button>
                      </div>
                      {resolvedRecipient && (
                        <div className="rounded-xl bg-emerald-50/70 p-4 text-xs text-emerald-900">
                          <div className="font-bold">
                            {resolvedRecipient.handle ? `@${resolvedRecipient.handle}` : resolvedRecipient.email}
                          </div>
                          <div className="mt-1 font-mono text-[10px] text-emerald-800">
                            {shortHash(resolvedRecipient.stellarPublicKey)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-4">
                    {sendRecipients.map((item, index) => (
                      <div key={item.id} className="rounded-xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-stone-100 space-y-4">
                        <div className="flex justify-between items-center text-[10px] font-bold text-stone-400 tracking-wider">
                          <span>{sendMode === "lane2" ? "TRANSFER AMOUNT" : `RECIPIENT ${index + 1}`}</span>
                          {sendMode === "lane1" && sendRecipients.length > 1 && (
                            <button 
                              type="button"
                              onClick={() => removeRecipientInput(item.id)}
                              className="text-stone-400 hover:text-red-650 transition"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>

                        <div className="space-y-3">
                          {sendMode === "lane1" && (
                            <div className="flex gap-2">
                              <input 
                                type="text" 
                                placeholder="Email, @user id, or Stellar address"
                                value={item.address}
                                onChange={(e) => updateRecipientField(item.id, "address", e.target.value)}
                                className="w-full h-12 px-4 rounded-xl border border-stone-200 bg-white text-sm font-mono focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10 focus:outline-none placeholder:text-stone-400 transition-all"
                              />
                               {contactOptions.length > 0 && (
                                <div className="relative h-12 w-12 shrink-0">
                                  <select
                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                                    onChange={(e) => {
                                      const contact = contactOptions.find((c) => c.id === e.target.value);
                                      if (contact) {
                                        updateRecipientField(item.id, "address", contact.otherStellarPublicKey ?? contact.otherEmail ?? "");
                                      }
                                      e.target.value = "";
                                    }}
                                    value=""
                                  >
                                    <option value="">Contacts</option>
                                    {contactOptions.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.otherHandle ? `@${c.otherHandle}` : c.otherEmail ?? shortHash(c.otherStellarPublicKey ?? "")}
                                      </option>
                                    ))}
                                  </select>
                                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                                    <BookUser size={18} />
                                  </div>
                                </div>
                              )}
                              <button
                                type="button"
                                disabled={busy || resolvingRecipient}
                                onClick={() => void resolveDirectRecipient(item.id).catch((err) => setErrorMsg(String(err)))}
                                className="h-12 rounded-xl bg-stone-950 px-5 text-[10px] font-bold uppercase tracking-wider text-white transition hover:bg-stone-800 disabled:opacity-50 shrink-0"
                              >
                                Find
                              </button>
                            </div>
                          )}
                          
                          <div className="flex gap-2 items-center">
                            <input 
                              type="text" 
                              placeholder="Amount"
                              value={item.amount}
                              onChange={(e) => updateRecipientField(item.id, "amount", e.target.value)}
                              className="w-full h-12 px-4 rounded-xl border border-stone-200 bg-white text-sm focus:border-stone-900 focus:ring-2 focus:ring-stone-900/10 focus:outline-none placeholder:text-stone-400 transition-all"
                            />
                            <span className="text-[10px] font-bold text-stone-400 px-2">USDC</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* PERCENTAGE HOTKEYS FOR FIRST RECIPIENT */}
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

                <div className="rounded-lg bg-indigo-50/40 p-3.5 text-xs leading-relaxed text-indigo-950 flex gap-2">
                  <Info size={14} className="shrink-0 mt-0.5 text-indigo-750" />
                  <span>
                    {sendMode === "lane2"
                      ? "Note-2-Note transfer. On-chain recipient and amount stay inside the pool; VEIL stores an encrypted incoming note for the recipient."
                      : "Direct-2-Wallet spend. Your public wallet is hidden, but the destination wallet address and withdrawal amount are public."}
                  </span>
                </div>

                {/* SUBMIT BUTTON */}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full h-12 rounded-xl bg-stone-950 text-white font-bold text-xs uppercase tracking-widest hover:bg-stone-800 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {spending ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>{statusMsg || "Executing ZK Proof..."}</span>
                    </>
                  ) : (
                    <span>{sendMode === "lane2" ? "Send Note-2-Note" : "Send Direct-2-Wallet"}</span>
                  )}
                </button>
              </form>
            )}

            {!selectedNote && activeRightTab === "send" && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Banknote className="h-10 w-10 text-stone-300 mb-2" />
                <p className="text-sm text-stone-550 font-bold">Select a note or deposit first</p>
                <button 
                  type="button"
                  onClick={() => setActiveRightTab("deposit")}
                  className="mt-4 text-xs font-bold uppercase tracking-wider text-indigo-700 underline"
                >
                  Go to Deposit
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      {backgroundBatchPrompt && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-950/18 px-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="background-batch-title"
            aria-describedby="background-batch-description"
            className="w-full max-w-md overflow-hidden rounded-3xl border border-stone-200 bg-[oklch(99%_0.006_86)] shadow-[0_30px_90px_rgba(28,25,23,0.20)]"
          >
            <div className="border-b border-stone-200/70 bg-gradient-to-br from-indigo-50/70 to-stone-50 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-700">
                    Background execution
                  </p>
                  <h3
                    id="background-batch-title"
                    className="mt-2 text-xl font-semibold tracking-normal text-stone-950"
                  >
                    Send batch in background
                  </h3>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-indigo-200 bg-white text-indigo-700 shadow-sm">
                  <Send size={17} />
                </div>
              </div>
            </div>

            <div className="space-y-5 px-6 py-5">
              <p
                id="background-batch-description"
                className="text-sm leading-6 text-stone-650"
              >
                Send the batch to worker for async execution in an encrypted package.
                The batch can continue if this tab closes, and progress will stay visible in Activity.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-stone-200 bg-white p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                    Recipients
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-stone-950">
                    {backgroundBatchPrompt.recipientCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-stone-200 bg-white p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                    Total
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-stone-950">
                    {formatStellarUnits(backgroundBatchPrompt.totalAmountUnits, "").split(" ")[0]}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                    USDC
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs leading-5 text-indigo-950">
                {backgroundBatchPrompt.mode === "lane2"
                  ? "Note-2-Note privacy is preserved while VEIL processes each recipient in sequence."
                  : "Direct-2-Wallet recipients and withdrawal amounts remain public, while your source wallet stays hidden."}
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setBackgroundBatchPrompt(null);
                    setStatusMsg("");
                  }}
                  disabled={spending}
                  className="h-12 flex-1 rounded-xl border border-stone-200 bg-white text-xs font-bold uppercase tracking-widest text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitPrivateSend({ backgroundApproved: true })}
                  disabled={spending}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-stone-950 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-stone-800 disabled:opacity-50"
                >
                  {spending ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Queuing</span>
                    </>
                  ) : (
                    <span>Send batch</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
  );
}

function PrivateBalanceBand({
  hideBalance,
  privateBalanceUnits,
  publicUsdcUnits,
  spendableNotes,
}: {
  hideBalance: boolean;
  privateBalanceUnits: string;
  publicUsdcUnits: string;
  spendableNotes: number;
}) {
  return (
    <section className="shrink-0 px-1 py-1">
      <div className="flex flex-col gap-3.5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-normal text-stone-500">Assets</p>
          <h2 className="mt-1 text-xl font-semibold text-stone-950">USDC balances</h2>
        </div>
        <div className="grid gap-3.5 md:grid-cols-[1.05fr_0.95fr]">
          <VaultBalanceCard
            amount={hideBalance ? "•••• USDC" : formatStellarUnits(privateBalanceUnits, "USDC")}
            detail={`${spendableNotes} active private note${spendableNotes === 1 ? "" : "s"}`}
            label="Shielded USDC"
            tone="shielded"
          />
          <VaultBalanceCard
            amount={formatStellarUnits(publicUsdcUnits, "USDC")}
            detail="Available for note creation"
            label="Unshielded USDC"
            tone="public"
          />
        </div>
      </div>
    </section>
  );
}

function VaultBalanceCard({
  amount,
  detail,
  label,
  tone,
}: {
  amount: string;
  detail: string;
  label: string;
  tone: "shielded" | "public";
}) {
  const [value, symbol = "USDC"] = amount.split(" ");
  const noteClass =
    tone === "shielded"
      ? "bg-[oklch(96%_0.018_152)] text-[oklch(30%_0.052_154)] shadow-[0_14px_32px_oklch(33%_0.035_150/.075)]"
      : "bg-[oklch(96%_0.006_78)] text-[oklch(30%_0.018_78)] shadow-[0_14px_32px_oklch(32%_0.018_78/.07)]";
  const patternClass =
    tone === "shielded"
      ? "[background-image:linear-gradient(90deg,oklch(52%_0.045_154/.08)_1px,transparent_1px),radial-gradient(circle_at_80%_20%,oklch(68%_0.055_154/.18),transparent_28%)]"
      : "[background-image:linear-gradient(90deg,oklch(45%_0.012_78/.07)_1px,transparent_1px),radial-gradient(circle_at_78%_18%,oklch(72%_0.016_78/.20),transparent_30%)]";
  const dividerClass =
    tone === "shielded"
      ? "border-[oklch(83%_0.04_154/.82)]"
      : "border-[oklch(84%_0.012_78/.82)]";
  const ovalClass =
    tone === "shielded"
      ? "border-[oklch(78%_0.044_154)]"
      : "border-[oklch(79%_0.012_78)]";

  return (
    <article className={`relative min-h-[120px] overflow-hidden rounded-lg p-4 ${noteClass}`}>
      <div className={`absolute inset-0 opacity-75 ${patternClass} [background-size:18px_18px,100%_100%]`} />
      <div className="relative flex h-full flex-col justify-between gap-3">
        <div>
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-normal opacity-72">{label}</p>
            <div className="mt-2 flex min-w-0 flex-wrap items-end gap-1.5">
              <span className="break-all font-mono text-3xl font-semibold leading-none md:text-[2.2rem]">{value}</span>
              <span className="pb-1 text-sm font-semibold opacity-72">{symbol}</span>
            </div>
          </div>
        </div>
        <div className={`flex items-end justify-between gap-2 border-t pt-2 ${dividerClass}`}>
          <p className="max-w-[24ch] text-[10px] font-medium leading-4 opacity-72">{detail}</p>
          <div className={`hidden h-6 w-16 rounded-[50%] border opacity-55 sm:block ${ovalClass}`} />
        </div>
      </div>
    </article>
  );
}
