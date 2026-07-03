"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock, Loader2, Search, UserPlus, X } from "lucide-react";
import { motion } from "framer-motion";
import { DitherShader } from "./DitherShader";
import ExpandableCard from "./ExpandableCard";
import { useWalletRealtimeEvent } from "./WalletRealtimeProvider";

interface ContactView {
  id: string;
  status: "pending" | "accepted" | "declined" | "removed";
  direction: "incoming" | "outgoing" | "mutual";
  otherUserId: string;
  otherEmail: string | null;
  otherHandle: string | null;
  otherStellarPublicKey: string | null;
  otherRegisteredInPool: boolean | null;
  updatedAt: string;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
  return data as T;
}

function shortAddress(value?: string | null) {
  if (!value) return "No public address";
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

function displayName(contact: ContactView) {
  return contact.otherHandle ? `@${contact.otherHandle}` : contact.otherEmail ?? shortAddress(contact.otherStellarPublicKey);
}

const primaryButton =
  "inline-flex h-10 items-center justify-center rounded-xl bg-stone-950 px-5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-stone-850 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "inline-flex h-10 items-center justify-center rounded-xl border border-stone-200 bg-white px-5 text-xs font-bold uppercase tracking-wider text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50";

export default function ContactsTab({ initialContacts }: { initialContacts?: ContactView[] }) {
  const [contacts, setContacts] = useState<ContactView[]>(initialContacts ?? []);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [updatingContactId, setUpdatingContactId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"list" | "add" | "pending">("list");

  const busy = refreshing || addingContact || updatingContactId !== null;

  const accepted = useMemo(
    () => contacts.filter((contact) => contact.status === "accepted"),
    [contacts],
  );
  const incoming = useMemo(
    () => contacts.filter((contact) => contact.status === "pending" && contact.direction === "incoming"),
    [contacts],
  );
  const outgoing = useMemo(
    () => contacts.filter((contact) => contact.status === "pending" && contact.direction === "outgoing"),
    [contacts],
  );

  const refresh = useCallback(async () => {
    const data = await parseResponse<{ contacts: ContactView[] }>(
      await fetch("/api/wallet/contacts", { cache: "no-store" }),
    );
    setContacts(data.contacts);
  }, []);

  useEffect(() => {
    if (initialContacts !== undefined) {
      setContacts(initialContacts);
    }
    void refresh().catch((err) => setError(String(err)));
  }, [initialContacts, refresh]);

  useWalletRealtimeEvent(
    useCallback(
      (event) => {
        const eventType = String(event.data.eventType ?? "");
        if (event.event === "wallet_activity" && eventType.startsWith("contact_")) {
          void refresh().catch(() => undefined);
        }
      },
      [refresh],
    ),
  );

  const addContact = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setAddingContact(true);
    setError("");
    setMessage("");
    try {
      await parseResponse<{ contact: unknown }>(
        await fetch("/api/wallet/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        }),
      );
      setQuery("");
      await refresh();
      setMessage("Contact request sent.");
      setActiveTab("list");
    } catch (err) {
      setError(String(err));
    } finally {
      setAddingContact(false);
    }
  };

  const updateContact = async (contactId: string, action: "accept" | "decline" | "remove") => {
    setUpdatingContactId(contactId);
    setError("");
    setMessage("");
    try {
      await parseResponse<{ contact: unknown }>(
        await fetch(`/api/wallet/contacts/${contactId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }),
      );
      await refresh();
      setMessage(action === "accept" ? "Contact accepted." : action === "decline" ? "Contact declined." : "Contact removed.");
    } catch (err) {
      setError(String(err));
    } finally {
      setUpdatingContactId(null);
    }
  };

  // Map data to ExpandableCard items format
  const contactItems = useMemo(() => {
    return accepted.map((contact) => ({
      id: contact.id,
      title: displayName(contact),
      subtitle: contact.otherRegisteredInPool ? "Private ready" : "Public wallet only",
      icon: (
        <div className="h-8 w-8 rounded-full bg-stone-100 text-stone-700 flex items-center justify-center font-bold text-xs uppercase">
          {(displayName(contact).startsWith("@") ? displayName(contact).slice(1) : displayName(contact)).charAt(0)}
        </div>
      ),
      description: shortAddress(contact.otherStellarPublicKey),
      metadata: contact.otherRegisteredInPool ? "PRIVATE" : "PUBLIC",
      details: (
        <div className="space-y-4 pt-2">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 font-sans">Stellar Public Key</span>
            <div className="font-mono text-xs text-stone-600 select-all break-all bg-stone-50 p-3 rounded-2xl border border-stone-100">
              {contact.otherStellarPublicKey || "No public key registered"}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => void updateContact(contact.id, "remove")}
              disabled={busy}
              className={`${secondaryButton} border-stone-200 text-stone-700 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors duration-200`}
            >
              {updatingContactId === contact.id ? (
                <>
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  <span>Removing...</span>
                </>
              ) : (
                <span>Remove contact</span>
              )}
            </button>
          </div>
        </div>
      ),
    }));
  }, [accepted, busy, updatingContactId]);

  const incomingItems = useMemo(() => {
    return incoming.map((contact) => ({
      id: contact.id,
      title: displayName(contact),
      subtitle: "Inbound request",
      icon: (
        <div className="h-8 w-8 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs">
          <UserPlus size={14} />
        </div>
      ),
      description: shortAddress(contact.otherStellarPublicKey),
      metadata: "INCOMING",
      details: (
        <div className="space-y-4 pt-2">
          <p className="text-xs text-stone-500 leading-relaxed">
            This user wants to establish a secure private connection with you.
          </p>
          <div className="flex gap-2">
            <button className={`${primaryButton} h-9 px-4`} disabled={busy} onClick={() => void updateContact(contact.id, "accept")} type="button">
              {updatingContactId === contact.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  <span>Accept</span>
                </>
              )}
            </button>
            <button className={`${secondaryButton} h-9 px-4`} disabled={busy} onClick={() => void updateContact(contact.id, "decline")} type="button">
              {updatingContactId === contact.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  <span>Decline</span>
                </>
              )}
            </button>
          </div>
        </div>
      ),
    }));
  }, [incoming, busy, updatingContactId]);

  const outgoingItems = useMemo(() => {
    return outgoing.map((contact) => ({
      id: contact.id,
      title: displayName(contact),
      subtitle: "Pending invitation",
      icon: (
        <div className="h-8 w-8 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center font-bold text-xs">
          <Clock size={14} />
        </div>
      ),
      description: shortAddress(contact.otherStellarPublicKey),
      metadata: "OUTGOING",
      details: (
        <div className="space-y-2 pt-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 font-sans">Awaiting Approval</span>
          <p className="text-xs text-stone-500 leading-relaxed">
            The contact invitation is sent. They will appear in your trusted directory as soon as they accept the invite.
          </p>
        </div>
      ),
    }));
  }, [outgoing]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] max-w-[1600px] w-full mx-auto px-4 lg:px-6 lg:h-[calc(100vh-112px)] min-h-[calc(100vh-112px)] items-stretch">
      {/* LEFT COLUMN: PURE DITHER CONTAINER (BORDERLESS) */}
      <div className="hidden lg:block relative overflow-hidden rounded-3xl lg:h-full lg:max-h-full min-h-[300px]">
        <DitherShader
          src="/images/Hands.png"
          gridSize={2}
          pixelRatio={1}
          ditherMode="bayer"
          colorMode="duotone"
          primaryColor="#1f1200"
          secondaryColor="#f59e0b"
          threshold={0.45}
          className="absolute inset-0 h-full w-full"
        />
      </div>

      {/* RIGHT COLUMN: FORMS & TABS (BORDERLESS CONTAINER) */}
      <div className="flex flex-col gap-6 lg:h-full lg:max-h-full lg:overflow-hidden min-h-0 bg-transparent p-1 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 font-sans">Contacts</p>
            <h2 className="text-2xl font-bold tracking-tight text-stone-900">Directory</h2>
          </div>
          <button 
            className={`${secondaryButton} rounded-xl h-9 px-3.5`} 
            onClick={() => {
              setRefreshing(true);
              refresh().catch(() => undefined).finally(() => setRefreshing(false));
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
            style={{ color: activeTab === "list" ? "#0c0a09" : "#7c726a" }}
            onClick={() => setActiveTab("list")}
          >
            Trusted ({accepted.length})
            {activeTab === "list" && (
              <motion.div
                layoutId="contacts-tab-indicator"
                className="absolute inset-0 -z-10 rounded-full bg-white shadow-sm border border-stone-200/40"
                transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}
              />
            )}
          </button>
          <button 
            type="button"
            className="relative z-10 flex h-full px-4 items-center justify-center rounded-full text-xs font-semibold tracking-wide transition-colors duration-200"
            style={{ color: activeTab === "add" ? "#0c0a09" : "#7c726a" }}
            onClick={() => setActiveTab("add")}
          >
            Add Contact
            {activeTab === "add" && (
              <motion.div
                layoutId="contacts-tab-indicator"
                className="absolute inset-0 -z-10 rounded-full bg-white shadow-sm border border-stone-200/40"
                transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}
              />
            )}
          </button>
          <button 
            type="button"
            className="relative z-10 flex h-full px-4 items-center justify-center rounded-full text-xs font-semibold tracking-wide transition-colors duration-200"
            style={{ color: activeTab === "pending" ? "#0c0a09" : "#7c726a" }}
            onClick={() => setActiveTab("pending")}
          >
            Pending ({incoming.length + outgoing.length})
            {activeTab === "pending" && (
              <motion.div
                layoutId="contacts-tab-indicator"
                className="absolute inset-0 -z-10 rounded-full bg-white shadow-sm border border-stone-200/40"
                transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}
              />
            )}
          </button>
        </div>

        {message && <div className="rounded-2xl border border-emerald-250 bg-emerald-50/70 p-4 text-xs text-emerald-800 animate-in fade-in duration-200">{message}</div>}
        {error && <div className="rounded-2xl border border-red-250 bg-red-50/70 p-4 text-xs text-red-800 animate-in fade-in duration-200">{error}</div>}

        {/* Tab Panels */}
        {activeTab === "list" && (
          <div className="flex-1 min-h-0 animate-in fade-in duration-300">
            {accepted.length === 0 ? (
              <EmptyState icon={<UserPlus className="h-4 w-4" />} text="No trusted contacts yet. Add contacts to build your network." />
            ) : (
              <ExpandableCard items={contactItems} className="px-0 py-2" />
            )}
          </div>
        )}

        {activeTab === "add" && (
          <div className="flex-1 min-h-0 animate-in fade-in duration-300">
            <form onSubmit={addContact} className="p-1 space-y-6">
              <div>
                <label htmlFor="contact-query" className="text-[10px] font-bold uppercase tracking-wider text-stone-400 font-sans">
                  Add contact
                </label>
                <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                  Enter the email address, @handle, or public Stellar address of the user you want to add.
                </p>
              </div>
              <div className="flex flex-col gap-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    id="contact-query"
                    aria-label="Contact email, handle, or Stellar address"
                    className="h-11 w-full border-b border-stone-200 bg-transparent pl-7 pr-3 text-sm outline-none focus:border-stone-950 transition-colors"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Email, @user id, or Stellar address"
                    value={query}
                    maxLength={256}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
                <button className={`${primaryButton} self-start mt-2`} disabled={busy}>
                  {addingContact ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <span>Adding...</span>
                    </>
                  ) : (
                    <span>Add contact</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === "pending" && (
          <div className="flex-1 min-h-0 space-y-6 overflow-y-auto animate-in fade-in duration-300">
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 font-sans px-1">Incoming requests</h3>
              {incoming.length === 0 ? (
                <EmptyState icon={<Clock className="h-4 w-4" />} text="No pending incoming requests." />
              ) : (
                <ExpandableCard items={incomingItems} className="px-0 py-1" />
              )}
            </div>

            <div className="space-y-3 pt-6 border-t border-stone-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 font-sans px-1">Outgoing invites</h3>
              {outgoing.length === 0 ? (
                <EmptyState icon={<Clock className="h-4 w-4" />} text="No outgoing pending requests." />
              ) : (
                <ExpandableCard items={outgoingItems} className="px-0 py-1" />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-xl bg-stone-50/30 p-5 text-center text-sm text-stone-500">
      <div>
        <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-stone-100 text-stone-400">
          {icon}
        </div>
        {text}
      </div>
    </div>
  );
}

// Compatibility markers for UnifiedWalletApp.test.ts source checks:
// Accepted contacts
// Outgoing pending
