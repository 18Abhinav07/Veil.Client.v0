"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, Loader2, Search, ReceiptText, UserPlus, Check, X } from "lucide-react";
import { motion } from "framer-motion";
import { DitherShader } from "./DitherShader";
import ExpandableCard from "./ExpandableCard";
import { decryptPrivateNote, encryptPrivateNote, type EncryptedPrivateNotePayload, type PrivateNoteSecrets } from "@/lib/noteCrypto";
import { decryptRequestMemo, encryptRequestMemo, type EncryptedRequestMemoEnvelope, type RequestMemoPlaintext } from "@/lib/requestMemoCrypto";
import { decimalToStellarUnits, formatStellarUnits } from "@/lib/publicWalletCore";
import type { WalletSecrets } from "@/lib/vaultCrypto";
import { useWalletRealtimeEvent } from "./WalletRealtimeProvider";

const POOL_ID =
  process.env.NEXT_PUBLIC_POOL_ID ??
  "CDEB3AIFRAGHGPLM24EDHHETSH4Y4L4NAYGSHHW7MQWXUQ65G7LEDBFY";

interface ContactView {
  id: string;
  status: "pending" | "accepted" | "declined" | "removed";
  direction: "incoming" | "outgoing" | "mutual";
  otherUserId: string;
  otherEmail: string | null;
  otherHandle: string | null;
  otherStellarPublicKey: string | null;
  otherRegisteredInPool: boolean | null;
  otherX25519PublicHex: string | null;
}

interface RequestsTabProps {
  wallet: WalletSecrets;
  initialContacts?: ContactView[];
  initialRequests?: PaymentRequestView[];
}

interface PaymentRequestView {
  id: string;
  requesterUserId: string;
  payerUserId: string | null;
  payerEmail: string | null;
  amountUnits: string;
  assetCode: string;
  memoCiphertext: string | null;
  status: "open" | "paid" | "declined" | "expired" | "failed_recoverable";
  paidSpendJobId: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  direction: "inbox" | "sent";
  requesterEmail: string | null;
  requesterHandle: string | null;
  requesterStellarPublicKey: string | null;
  requesterBn254PublicHex: string | null;
  requesterX25519PublicHex: string | null;
  payerHandle: string | null;
  decryptedMemo?: RequestMemoPlaintext | null;
}

interface StoredNoteRow {
  id: string;
  commitmentHex: string;
  encryptedNoteCiphertext: string;
  amountUnits: string;
  leafIndex: number | null;
  status: string;
  activeJobId: string | null;
}

interface DecryptedNote {
  row: StoredNoteRow;
  note: PrivateNoteSecrets;
}

interface SpendJobView {
  job: {
    id: string;
    status: string;
  };
}

interface ProveResult {
  result: {
    stepId: string;
    ordinal: number;
    changeNote: PrivateNoteSecrets;
  };
}

interface SubmitResult {
  result: {
    changeLeaf: number;
    changeAmountUnits: string;
  };
  job: SpendJobView | null;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
  return data as T;
}

function shortHash(value?: string | null) {
  if (!value) return "pending";
  return value.length <= 18 ? value : `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function contactLabel(contact: ContactView) {
  return contact.otherHandle ? `@${contact.otherHandle}` : contact.otherEmail ?? shortHash(contact.otherStellarPublicKey);
}

function requestCounterparty(request: PaymentRequestView) {
  if (request.direction === "inbox") {
    return request.requesterHandle ? `@${request.requesterHandle}` : request.requesterEmail ?? "Requester";
  }
  return request.payerHandle ? `@${request.payerHandle}` : request.payerEmail ?? "Payer";
}

function activeNoteStatus(status: string) {
  return status === "unspent" || status === "received";
}

function isNoteSpendable(item: DecryptedNote) {
  return activeNoteStatus(item.row.status) && !item.row.activeJobId && item.note.leafIndex !== null;
}

const primaryButton =
  "inline-flex h-10 items-center justify-center rounded-xl bg-stone-950 px-5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-stone-850 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-xl border border-stone-200 bg-white px-5 text-xs font-bold uppercase tracking-wider text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50";

export default function RequestsTab({ wallet, initialContacts, initialRequests }: RequestsTabProps) {
  const [contacts, setContacts] = useState<ContactView[]>(initialContacts ?? []);
  const [requests, setRequests] = useState<PaymentRequestView[]>([]);
  const [notes, setNotes] = useState<DecryptedNote[]>([]);
  const [selectedContact, setSelectedContact] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState("");
  const [amount, setAmount] = useState("25");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [decliningRequestId, setDecliningRequestId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"inbound" | "outbound" | "create">("inbound");

  const busy = refreshing || sendingRequest || processingRequestId !== null || decliningRequestId !== null;

  const acceptedContacts = useMemo(
    () => contacts.filter((contact) => contact.status === "accepted"),
    [contacts],
  );
  const inbox = useMemo(() => requests.filter((request) => request.direction === "inbox"), [requests]);
  const sent = useMemo(() => requests.filter((request) => request.direction === "sent"), [requests]);
  const activeNotes = useMemo(() => notes.filter(isNoteSpendable), [notes]);
  const selectedNote = useMemo(
    () => activeNotes.find((item) => item.row.id === selectedNoteId) ?? activeNotes[0] ?? null,
    [activeNotes, selectedNoteId],
  );

  const loadNotes = useCallback(async () => {
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
        decrypted.push({ row, note: { ...note, amountUnits: row.amountUnits, leafIndex: row.leafIndex ?? note.leafIndex } });
      } catch {
        continue;
      }
    }
    setNotes(decrypted);
    setSelectedNoteId(
      (current) => current || (decrypted.find(isNoteSpendable)?.row.id ?? ""),
    );
  }, [wallet]);

  const decryptRequestRows = useCallback(async (rows: PaymentRequestView[]) => {
    const decryptedRequests: PaymentRequestView[] = [];
    for (const item of rows) {
      let decryptedMemo: RequestMemoPlaintext | null = null;
      if (item.memoCiphertext) {
        try {
          decryptedMemo = await decryptRequestMemo({
            envelope: JSON.parse(item.memoCiphertext) as EncryptedRequestMemoEnvelope,
            wallet,
            role: item.direction === "sent" ? "requester" : "payer",
          });
        } catch {
          decryptedMemo = null;
        }
      }
      decryptedRequests.push({ ...item, decryptedMemo });
    }
    setRequests(decryptedRequests);
  }, [wallet]);

  const refresh = useCallback(async () => {
    const [contactsData, requestsData] = await Promise.all([
      parseResponse<{ contacts: ContactView[] }>(
        await fetch("/api/wallet/contacts", { cache: "no-store" }),
      ),
      parseResponse<{ requests: PaymentRequestView[] }>(
        await fetch("/api/wallet/requests", { cache: "no-store" }),
      ),
    ]);
    setContacts(contactsData.contacts);
    await decryptRequestRows(requestsData.requests);
  }, [decryptRequestRows]);

  useEffect(() => {
    if (initialContacts !== undefined) {
      setContacts(initialContacts);
    }
    if (initialRequests !== undefined) {
      void decryptRequestRows(initialRequests)
        .then(() => loadNotes())
        .catch((err) => setError(String(err)));
      return;
    }
    void Promise.all([refresh(), loadNotes()]).catch((err) => setError(String(err)));
  }, [decryptRequestRows, initialContacts, initialRequests, loadNotes, refresh]);

  useWalletRealtimeEvent(
    useCallback(
      (event) => {
        if (event.event !== "wallet_activity") return;
        const eventType = String(event.data.eventType ?? "");
        if (eventType.startsWith("payment_request_") || eventType.startsWith("contact_")) {
          void refresh().catch(() => undefined);
        }
        if (eventType === "private_note_received") {
          void loadNotes().catch(() => undefined);
        }
      },
      [loadNotes, refresh],
    ),
  );

  const createRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    const contact = acceptedContacts.find((item) => item.id === selectedContact);
    if (!contact) return setError("Select an accepted contact");
    if (!contact.otherX25519PublicHex) return setError("This contact is missing an encryption key");
    setSendingRequest(true);
    setError("");
    setMessage("");
    try {
      const amountUnits = decimalToStellarUnits(amount);
      const memo = await encryptRequestMemo({
        requesterWallet: wallet,
        payerX25519PublicHex: contact.otherX25519PublicHex,
        memo: {
          title: title.trim() || "Payment request",
          details: details.trim(),
          createdAt: new Date().toISOString(),
        },
      });
      await parseResponse<{ request: PaymentRequestView }>(
        await fetch("/api/wallet/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payerQuery: contact.otherHandle ? `@${contact.otherHandle}` : contact.otherEmail ?? contact.otherStellarPublicKey,
            amountUnits,
            memoCiphertext: JSON.stringify(memo),
          }),
        }),
      );
      setAmount("25");
      setTitle("");
      setDetails("");
      await refresh();
      setMessage("Payment request sent.");
      setActiveTab("outbound");
    } catch (err) {
      setError(String(err));
    } finally {
      setSendingRequest(false);
    }
  };

  const declineRequest = async (requestId: string) => {
    setDecliningRequestId(requestId);
    setError("");
    setMessage("");
    try {
      await parseResponse<{ request: PaymentRequestView }>(
        await fetch(`/api/wallet/requests/${requestId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "decline" }),
        }),
      );
      await refresh();
      setMessage("Payment request declined.");
    } catch (err) {
      setError(String(err));
    } finally {
      setDecliningRequestId(null);
    }
  };

  const runJobFromNote = async (jobId: string, startingNote: PrivateNoteSecrets) => {
    let currentNote = startingNote;
    for (let guard = 0; guard < 100; guard += 1) {
      if (currentNote.leafIndex === null) throw new Error("Selected note is still indexing");
      setMessage(`Proving private payment step ${guard + 1}...`);
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
      setMessage(`Relaying private payment step ${proved.result.ordinal}...`);
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
      if (submitted.job?.job.status === "completed") return;
    }
    throw new Error("Payment request approval did not complete");
  };

  const approveRequest = async (request: PaymentRequestView) => {
    if (!selectedNote) return setError("Select a private note to pay this request");
    if (!isNoteSpendable(selectedNote)) {
      return setError("This private note is already locked by an active payment job");
    }
    if (!request.requesterUserId || !request.requesterStellarPublicKey || !request.requesterBn254PublicHex || !request.requesterX25519PublicHex) {
      return setError("Requester is missing private receive keys");
    }
    if (BigInt(request.amountUnits) > BigInt(selectedNote.note.amountUnits)) {
      return setError("Selected note does not cover this request");
    }
    setProcessingRequestId(request.id);
    setError("");
    setMessage("Creating private payment job...");
    try {
      const created = await parseResponse<{ job: SpendJobView }>(
        await fetch("/api/wallet/private/spend-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: request.id,
            sourceNoteId: selectedNote.row.id,
            sourceCommitmentHex: selectedNote.note.commitmentHex,
            sourceAmountUnits: selectedNote.note.amountUnits,
            sourceLeafIndex: selectedNote.note.leafIndex,
            poolId: POOL_ID,
            kind: "lane2_transfer",
            idempotencyKey: `request-${request.id}-${selectedNote.note.commitmentHex}`,
            recipients: [
              {
                address: request.requesterStellarPublicKey,
                amountUnits: request.amountUnits,
                recipientUserId: request.requesterUserId,
                recipientHandle: request.requesterHandle,
                recipientNotePublicHex: request.requesterBn254PublicHex,
                recipientX25519PublicHex: request.requesterX25519PublicHex,
              },
            ],
          }),
        }),
      );
      await runJobFromNote(created.job.job.id, selectedNote.note);
      await Promise.all([refresh(), loadNotes()]);
      setMessage("Payment request paid privately.");
    } catch (err) {
      setError(String(err));
      setMessage("");
    } finally {
      setProcessingRequestId(null);
    }
  };

  // Map inbox payment requests to ExpandableCard items
  const inboxItems = useMemo(() => {
    return inbox.map((request) => ({
      id: request.id,
      title: requestCounterparty(request),
      subtitle: request.decryptedMemo ? request.decryptedMemo.title : "Inbound Payment Request",
      icon: (
        <div className="h-8 w-8 rounded-full bg-stone-100 text-stone-700 flex items-center justify-center font-bold text-xs">
          {requestCounterparty(request).replace(/[@]/g, "").charAt(0).toUpperCase()}
        </div>
      ),
      description: formatStellarUnits(request.amountUnits, "USDC"),
      metadata: request.status.toUpperCase(),
      details: (
        <div className="space-y-4 pt-2">
          {request.decryptedMemo && (
            <div className="space-y-1 bg-stone-50 p-3 rounded-2xl border border-stone-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 font-sans">Memo Details</span>
              <p className="text-xs text-stone-700 font-semibold">{request.decryptedMemo.title}</p>
              {request.decryptedMemo.details && <p className="text-xs text-stone-500 mt-1">{request.decryptedMemo.details}</p>}
            </div>
          )}
          {request.status === "open" ? (
            <div className="space-y-3 pt-2">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 font-sans">Select private note to pay</span>
                <select
                  className="mt-1.5 h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-xs outline-none focus:border-stone-950 transition-colors"
                  onChange={(event) => setSelectedNoteId(event.target.value)}
                  value={selectedNote?.row.id ?? ""}
                >
                  {activeNotes.map((item) => (
                    <option key={item.row.id} value={item.row.id}>
                      {shortHash(item.note.commitmentHex)} · {formatStellarUnits(item.note.amountUnits, "USDC")}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2 pt-1">
                <button className={`${primaryButton} transition-all active:scale-[0.98] h-9 px-4`} disabled={busy} onClick={() => void approveRequest(request)} type="button">
                  {processingRequestId === request.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <span>Paying...</span>
                    </>
                  ) : (
                    <span>Pay privately</span>
                  )}
                </button>
                <button className={`${secondaryButton} transition-all active:scale-[0.98] h-9 px-4`} disabled={busy} onClick={() => void declineRequest(request.id)} type="button">
                  {decliningRequestId === request.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <span>Declining...</span>
                    </>
                  ) : (
                    <span>Decline</span>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-stone-500">This request is {request.status.toLowerCase()}.</p>
          )}
        </div>
      ),
    }));
  }, [inbox, selectedNote, activeNotes, busy, processingRequestId, decliningRequestId]);

  // Map sent payment requests to ExpandableCard items
  const sentItems = useMemo(() => {
    return sent.map((request) => ({
      id: request.id,
      title: requestCounterparty(request),
      subtitle: request.decryptedMemo ? request.decryptedMemo.title : "Outbound Payment Request",
      icon: (
        <div className="h-8 w-8 rounded-full bg-stone-100 text-stone-700 flex items-center justify-center font-bold text-xs">
          {requestCounterparty(request).replace(/[@]/g, "").charAt(0).toUpperCase()}
        </div>
      ),
      description: formatStellarUnits(request.amountUnits, "USDC"),
      metadata: request.status.toUpperCase(),
      details: (
        <div className="space-y-3 pt-2">
          {request.decryptedMemo && (
            <div className="space-y-1 bg-stone-50 p-3 rounded-2xl border border-stone-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 font-sans">Memo Details</span>
              <p className="text-xs text-stone-700 font-semibold">{request.decryptedMemo.title}</p>
              {request.decryptedMemo.details && <p className="text-xs text-stone-500 mt-1">{request.decryptedMemo.details}</p>}
            </div>
          )}
          {request.paidSpendJobId && (
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 font-sans">Spend Job ID</span>
              <div className="font-mono text-xs text-stone-600 select-all break-all bg-stone-50 p-3 rounded-2xl border border-stone-100">
                {request.paidSpendJobId}
              </div>
            </div>
          )}
          <p className="text-xs text-stone-500 leading-normal">Sent on {new Date(request.createdAt).toLocaleString()}</p>
        </div>
      ),
    }));
  }, [sent]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] max-w-[1600px] w-full mx-auto px-4 lg:px-6 lg:h-[calc(100vh-112px)] min-h-[calc(100vh-112px)] items-stretch">
      {/* LEFT COLUMN: PURE DITHER CONTAINER (BORDERLESS) */}
      <div className="relative overflow-hidden rounded-3xl lg:h-full lg:max-h-full min-h-[300px]">
        <DitherShader
          src="/images/Cash.png"
          gridSize={2}
          pixelRatio={1}
          ditherMode="bayer"
          colorMode="duotone"
          primaryColor="#1c1917"
          secondaryColor="#f5f5f4"
          threshold={0.45}
          className="absolute inset-0 h-full w-full"
        />
      </div>

      {/* RIGHT COLUMN: FORMS & TABS (BORDERLESS CONTAINER) */}
      <div className="flex flex-col gap-6 lg:h-full lg:max-h-full lg:overflow-hidden min-h-0 bg-transparent p-1 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 font-sans">Requests</p>
            <h2 className="text-2xl font-bold tracking-tight text-stone-900">Inbound & Outbound</h2>
          </div>
          <button 
            className={`${secondaryButton} rounded-xl h-9 px-3.5`} 
            onClick={() => {
              setRefreshing(true);
              Promise.all([refresh(), loadNotes()]).catch(() => undefined).finally(() => setRefreshing(false));
            }} 
            disabled={busy}
            type="button"
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <span>Refresh</span>
            )}
          </button>
        </div>

        {/* Pill-based Tab Switcher (Soft Pill Switcher) */}
        <div className="relative flex h-10 items-center rounded-full bg-stone-100/60 p-1 border border-stone-200/30 w-fit self-start shrink-0">
          <button 
            type="button"
            className="relative z-10 flex h-full px-4 items-center justify-center rounded-full text-xs font-semibold tracking-wide transition-colors duration-200"
            style={{ color: activeTab === "inbound" ? "#0c0a09" : "#7c726a" }}
            onClick={() => setActiveTab("inbound")}
          >
            Inbound ({inbox.length})
            {activeTab === "inbound" && (
              <motion.div
                layoutId="requests-tab-indicator"
                className="absolute inset-0 -z-10 rounded-full bg-white shadow-sm border border-stone-200/40"
                transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}
              />
            )}
          </button>
          <button 
            type="button"
            className="relative z-10 flex h-full px-4 items-center justify-center rounded-full text-xs font-semibold tracking-wide transition-colors duration-200"
            style={{ color: activeTab === "outbound" ? "#0c0a09" : "#7c726a" }}
            onClick={() => setActiveTab("outbound")}
          >
            Outbound ({sent.length})
            {activeTab === "outbound" && (
              <motion.div
                layoutId="requests-tab-indicator"
                className="absolute inset-0 -z-10 rounded-full bg-white shadow-sm border border-stone-200/40"
                transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}
              />
            )}
          </button>
          <button 
            type="button"
            className="relative z-10 flex h-full px-4 items-center justify-center rounded-full text-xs font-semibold tracking-wide transition-colors duration-200"
            style={{ color: activeTab === "create" ? "#0c0a09" : "#7c726a" }}
            onClick={() => setActiveTab("create")}
          >
            Request USDC
            {activeTab === "create" && (
              <motion.div
                layoutId="requests-tab-indicator"
                className="absolute inset-0 -z-10 rounded-full bg-white shadow-sm border border-stone-200/40"
                transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}
              />
            )}
          </button>
        </div>

        {message && <div className="rounded-2xl border border-emerald-250 bg-emerald-50/70 p-4 text-xs text-emerald-800 animate-in fade-in duration-200">{message}</div>}
        {error && <div className="rounded-2xl border border-red-250 bg-red-50/70 p-4 text-xs text-red-800 animate-in fade-in duration-200">{error}</div>}

        {/* Tab Panels */}
        {activeTab === "inbound" && (
          <div className="flex-1 min-h-0 animate-in fade-in duration-300">
            {inbox.length === 0 ? (
              <EmptyState text="No incoming payment requests." />
            ) : (
              <ExpandableCard items={inboxItems} className="px-0 py-2" />
            )}
          </div>
        )}

        {activeTab === "outbound" && (
          <div className="flex-1 min-h-0 animate-in fade-in duration-300">
            {sent.length === 0 ? (
              <EmptyState text="No sent payment requests." />
            ) : (
              <ExpandableCard items={sentItems} className="px-0 py-2" />
            )}
          </div>
        )}

        {activeTab === "create" && (
          <div className="flex-1 min-h-0 animate-in fade-in duration-300">
            <form onSubmit={createRequest} className="p-1 space-y-6">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-400 font-sans">
                  Create request
                </label>
                <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                  Initiate a request to receive USDC. The memo and payment coordinates are fully encrypted before relay.
                </p>
              </div>
              <div className="space-y-4">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 font-sans">Payer contact</span>
                  <select
                    className="mt-2 h-11 w-full border-b border-stone-200 bg-transparent px-1 text-sm outline-none focus:border-stone-950 transition-colors"
                    onChange={(event) => setSelectedContact(event.target.value)}
                    value={selectedContact}
                  >
                    <option value="">Select contact</option>
                    {acceptedContacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contactLabel(contact)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 font-sans">Amount (USDC)</span>
                  <input
                    id="request-amount"
                    aria-label="Request amount in USDC"
                    className="mt-2 h-11 w-full border-b border-stone-200 bg-transparent px-1 text-sm outline-none focus:border-stone-950 transition-colors"
                    onChange={(event) => setAmount(event.target.value)}
                    value={amount}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    maxLength={20}
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 font-sans">Title</span>
                  <input
                    id="request-title"
                    aria-label="Request title"
                    className="mt-2 h-11 w-full border-b border-stone-200 bg-transparent px-1 text-sm outline-none focus:border-stone-950 transition-colors"
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Invoice, dinner, payout..."
                    value={title}
                    maxLength={100}
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 font-sans">Details</span>
                  <textarea
                    id="request-details"
                    aria-label="Request details (optional)"
                    className="mt-2 min-h-24 w-full resize-none border-b border-stone-200 bg-transparent p-1 text-sm outline-none focus:border-stone-950 transition-colors"
                    onChange={(event) => setDetails(event.target.value)}
                    placeholder="Encrypted details (optional)"
                    value={details}
                    maxLength={500}
                  />
                </label>
                <button className={`${primaryButton} mt-2`} disabled={busy}>
                  {sendingRequest ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <span>Sending request...</span>
                    </>
                  ) : (
                    <span>Send request</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-xl bg-stone-50/30 p-5 text-center text-sm text-stone-500">
      <div>
        <Clock className="mx-auto mb-3 h-5 w-5 text-stone-400" />
        {text}
      </div>
    </div>
  );
}
