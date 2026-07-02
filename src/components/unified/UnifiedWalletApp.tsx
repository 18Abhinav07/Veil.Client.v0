"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import VaultGate, { type VaultControls } from "@/components/VaultGate";
import WalletAccountMemory from "@/components/WalletAccountMemory";
import type { WalletSecrets } from "@/lib/vaultCrypto";
import type { PublicWalletState } from "@/lib/publicWalletCore";
import {
  decryptPrivateNote,
  type EncryptedPrivateNotePayload,
  type PrivateNoteSecrets,
} from "@/lib/noteCrypto";

import Sidebar, { type SidebarBadges, type WalletTab } from "./Sidebar";
import TopHeader from "./TopHeader";
import PublicDashboard from "./PublicDashboard";
import PublicActivity from "./PublicActivity";
import PrivateDashboard from "./PrivateDashboard";
import PrivateActivity from "./PrivateActivity";
import RightDrawer from "./RightDrawer";
import SettingsTab from "./SettingsTab";
import ContactsTab from "./ContactsTab";
import RequestsTab from "./RequestsTab";
import {
  WalletRealtimeProvider,
  useWalletRealtimeEvent,
} from "./WalletRealtimeProvider";

const DEFAULT_SIDEBAR_BADGES: SidebarBadges = {
  contactRequests: 0,
  paymentRequests: 0,
  unreadNotifications: 0,
  recoverable: 0,
};

const BADGE_RELEVANT_EVENT_TYPES = new Set([
  "contact_request_received",
  "contact_request_accepted",
  "contact_request_declined",
  "contact_removed",
  "payment_request_created",
  "payment_request_received",
  "payment_request_paid",
  "payment_request_declined",
  "payment_request_expired",
  "private_note_received",
  "private_payment_sent",
  "market_deposit_confirmed",
  "market_bet_confirmed",
  "market_payout_ready",
  "market_payout_claimed",
  "market_payout_failed",
  "spend_job_retry_wait",
  "spend_job_failed_recoverable",
  "spend_job_needs_reconcile",
  "spend_job_completed",
  "spend_job_resumed",
]);

type NoteStatus =
  | "unspent"
  | "spent"
  | "pending_deposit"
  | "pending_spend"
  | "received"
  | "failed_recovery";
type NoteSource = "deposit" | "change" | "received";

type StoredNoteRow = {
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
};

type DecryptedNote = {
  row: StoredNoteRow;
  note: PrivateNoteSecrets;
};

type ContactView = {
  id: string;
  status: "pending" | "accepted" | "declined" | "removed";
  direction: "incoming" | "outgoing" | "mutual";
  otherUserId: string;
  otherEmail: string | null;
  otherHandle: string | null;
  otherStellarPublicKey: string | null;
  otherRegisteredInPool: boolean | null;
  otherBn254PublicHex: string | null;
  otherX25519PublicHex: string | null;
  createdAt: string;
  updatedAt: string;
};

type PaymentRequestView = {
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
};

type SpendJobStepView = {
  id: string;
  ordinal: number;
  recipientAddress: string;
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
};

type SpendJobView = {
  job: {
    id: string;
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
};

type PublicTransactionView = {
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
};

type NotificationView = {
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

type PublicMarketPoint = {
  time: string;
  price: number;
};

type PublicMarketState = {
  pair: string;
  source: string;
  latest: number | null;
  changePct: number | null;
  points: PublicMarketPoint[];
  updatedAt: string;
};

type BootstrapData = {
  badges: SidebarBadges;
  publicAccount: PublicWalletState | null;
  publicMarket: PublicMarketState | null;
  privateNotes: DecryptedNote[];
  contacts: ContactView[];
  requests: PaymentRequestView[];
  spendJobs: SpendJobView[];
  publicTransactions: PublicTransactionView[];
  notifications: NotificationView[];
};

const DEFAULT_BOOTSTRAP_DATA: BootstrapData = {
  badges: DEFAULT_SIDEBAR_BADGES,
  publicAccount: null,
  publicMarket: null,
  privateNotes: [],
  contacts: [],
  requests: [],
  spendJobs: [],
  publicTransactions: [],
  notifications: [],
};

async function decryptBootstrapNotes(
  rows: StoredNoteRow[],
  wallet: WalletSecrets,
): Promise<DecryptedNote[]> {
  const decrypted: DecryptedNote[] = [];
  for (const row of rows) {
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
      // Notes encrypted for another vault version should not block wallet entry.
    }
  }
  return decrypted;
}

function isPublicMarketState(value: unknown): value is PublicMarketState {
  const candidate = value as PublicMarketState | null | undefined;
  return (
    typeof candidate?.pair === "string" &&
    typeof candidate.source === "string" &&
    Array.isArray(candidate.points) &&
    typeof candidate.updatedAt === "string"
  );
}

export default function UnifiedWalletApp({
  accountEmail,
  accountName,
}: {
  accountEmail?: string | null;
  accountName?: string | null;
}) {
  const [bootstrapData, setBootstrapData] = useState<BootstrapData>(
    DEFAULT_BOOTSTRAP_DATA,
  );

  const bootstrapWalletData = useCallback(async (wallet: WalletSecrets) => {
    const response = await fetch(
      `/api/wallet/bootstrap?address=${encodeURIComponent(wallet.stellarPublicKey)}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(
        `/api/wallet/bootstrap failed with HTTP ${response.status}`,
      );
    }
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      any
    >;
    const initialPrivateNotes = await decryptBootstrapNotes(
      Array.isArray(payload.notes) ? (payload.notes as StoredNoteRow[]) : [],
      wallet,
    );
    const initialPublicAccount = (payload.publicAccount ??
      null) as PublicWalletState | null;
    const initialMarketState = isPublicMarketState(payload.publicMarket)
      ? payload.publicMarket
      : null;
    const badges = {
      contactRequests: payload.badges?.incomingContactRequests ?? 0,
      paymentRequests: payload.badges?.openPaymentRequests ?? 0,
      unreadNotifications: payload.badges?.unreadNotifications ?? 0,
      recoverable: payload.badges?.recoverableJobs ?? 0,
    };
    const initialContacts = Array.isArray(payload.contacts)
      ? payload.contacts
      : [];
    const initialRequests = Array.isArray(payload.requests)
      ? payload.requests
      : [];
    const initialSpendJobs = Array.isArray(payload.spendJobs)
      ? payload.spendJobs
      : [];
    const initialPublicTransactions = Array.isArray(payload.publicTransactions)
      ? payload.publicTransactions
      : [];
    const initialNotifications = Array.isArray(payload.notifications)
      ? payload.notifications
      : [];
    setBootstrapData({
      badges,
      publicAccount: initialPublicAccount,
      publicMarket: initialMarketState,
      privateNotes: initialPrivateNotes,
      contacts: initialContacts,
      requests: initialRequests,
      spendJobs: initialSpendJobs,
      publicTransactions: initialPublicTransactions,
      notifications: initialNotifications,
    });
  }, []);

  return (
    <>
      <WalletAccountMemory email={accountEmail} name={accountName} />
      <VaultGate prepareWallet={bootstrapWalletData}>
        {(wallet, controls) => (
          <WalletRealtimeProvider>
            <UnifiedWalletShell
              wallet={wallet}
              accountEmail={accountEmail}
              controls={controls}
              bootstrapData={bootstrapData}
            />
          </WalletRealtimeProvider>
        )}
      </VaultGate>
    </>
  );
}

function UnifiedWalletShell({
  wallet,
  accountEmail,
  controls,
  bootstrapData,
}: {
  wallet: WalletSecrets;
  accountEmail?: string | null;
  controls: VaultControls;
  bootstrapData: BootstrapData;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"public" | "private" | "markets">("public");
  const handleModeChange = (newMode: "public" | "private" | "markets") => {
    if (newMode === "markets") {
      router.push("/market");
    } else {
      setMode(newMode);
    }
  };
  const [currentTab, setCurrentTab] = useState<WalletTab>("dashboard");
  const [badges, setBadges] = useState<SidebarBadges>(bootstrapData.badges);
  const badgeRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationUnreadCount = badges.unreadNotifications ?? 0;

  // State for the Right Drawer
  const [drawerContent, setDrawerContent] = useState<React.ReactNode | null>(
    null,
  );

  const title =
    currentTab === "dashboard"
      ? mode === "public"
        ? "Public Wallet"
        : "Private Vault"
      : currentTab === "activity"
        ? "Activity History"
        : currentTab === "contacts"
          ? "Contacts"
          : currentTab === "requests"
            ? "Requests"
            : "Settings";

  const handleNotificationAction = useCallback((actionUrl: string | null) => {
    if (!actionUrl) return;
    try {
      const url = new URL(actionUrl, window.location.origin);
      if (url.origin !== window.location.origin || url.pathname !== "/wallet")
        return;
      const parsedMode = url.searchParams.get("mode");
      const parsedTab = url.searchParams.get("tab");
      const hasWalletTarget =
        parsedMode === "public" ||
        parsedMode === "private" ||
        parsedTab === "dashboard" ||
        parsedTab === "activity" ||
        parsedTab === "contacts" ||
        parsedTab === "requests" ||
        parsedTab === "settings";
      if (!hasWalletTarget) return;
      if (parsedMode === "public" || parsedMode === "private") {
        setMode(parsedMode);
      }
      if (
        parsedTab === "dashboard" ||
        parsedTab === "activity" ||
        parsedTab === "contacts" ||
        parsedTab === "requests" ||
        parsedTab === "settings"
      ) {
        setCurrentTab(parsedTab);
      }
    } catch {
      // Ignore malformed notification action URLs.
    }
  }, []);

  const refreshBadges = useCallback(async () => {
    try {
      const badgesRes = await fetch("/api/wallet/badges", {
        cache: "no-store",
      });
      const badgesData = badgesRes.ok
        ? await badgesRes.json()
        : {
            badges: {
              incomingContactRequests: 0,
              openPaymentRequests: 0,
              unreadNotifications: 0,
              recoverableJobs: 0,
            },
          };
      setBadges({
        contactRequests: badgesData.badges?.incomingContactRequests ?? 0,
        paymentRequests: badgesData.badges?.openPaymentRequests ?? 0,
        unreadNotifications: badgesData.badges?.unreadNotifications ?? 0,
        recoverable: badgesData.badges?.recoverableJobs ?? 0,
      });
    } catch {
      // Badges are non-critical; the destination tabs fetch their own data.
    }
  }, []);

  const scheduleBadgeRefresh = useCallback(() => {
    if (badgeRefreshTimer.current) return;
    badgeRefreshTimer.current = setTimeout(() => {
      badgeRefreshTimer.current = null;
      void refreshBadges();
    }, 500);
  }, [refreshBadges]);

  useEffect(() => {
    return () => {
      if (badgeRefreshTimer.current) {
        clearTimeout(badgeRefreshTimer.current);
        badgeRefreshTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setBadges(bootstrapData.badges);
  }, [bootstrapData.badges]);

  useWalletRealtimeEvent(
    useCallback(
      (event) => {
        if (event.event !== "wallet_activity") return;
        const eventType = String(event.data.eventType ?? "");
        if (BADGE_RELEVANT_EVENT_TYPES.has(eventType)) {
          scheduleBadgeRefresh();
        }
      },
      [scheduleBadgeRefresh],
    ),
  );

  return (
    <div className="flex h-screen w-screen flex-col md:flex-row overflow-hidden bg-stone-50">
      <Sidebar
        currentTab={currentTab}
        onChangeTab={setCurrentTab}
        badges={badges}
      />

      <div className="flex flex-1 flex-col h-full overflow-hidden md:ml-14">
        <TopHeader
          mode={mode}
          onChangeMode={handleModeChange}
          title={title}
          accountEmail={accountEmail}
          initialNotifications={bootstrapData.notifications}
          notificationUnreadCount={notificationUnreadCount}
          onNotificationsRead={scheduleBadgeRefresh}
          onNotificationAction={handleNotificationAction}
        />

        <main className="flex-1 overflow-y-auto no-scrollbar p-4 md:p-6 pb-24 md:pb-6">
          {currentTab === "dashboard" && mode === "public" && (
            <PublicDashboard
              wallet={wallet}
              openDrawer={setDrawerContent}
              initialWalletState={bootstrapData.publicAccount}
              initialMarketState={bootstrapData.publicMarket}
              initialContacts={bootstrapData.contacts}
            />
          )}

          {currentTab === "dashboard" && mode === "private" && (
            <PrivateDashboard
              wallet={wallet}
              openDrawer={setDrawerContent}
              initialNotes={bootstrapData.privateNotes}
              initialPublicAccount={bootstrapData.publicAccount}
              initialContacts={bootstrapData.contacts}
            />
          )}

          {currentTab === "activity" && mode === "public" && (
            <PublicActivity
              wallet={wallet}
              initialTransactions={bootstrapData.publicTransactions}
            />
          )}

          {currentTab === "activity" && mode === "private" && (
            <PrivateActivity
              wallet={wallet}
              initialJobs={bootstrapData.spendJobs}
            />
          )}

          {currentTab === "contacts" && (
            <ContactsTab initialContacts={bootstrapData.contacts} />
          )}

          {currentTab === "requests" && (
            <RequestsTab
              wallet={wallet}
              initialContacts={bootstrapData.contacts}
              initialRequests={bootstrapData.requests}
            />
          )}

          {currentTab === "settings" && (
            <SettingsTab wallet={wallet} controls={controls} />
          )}
        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-stone-200 bg-white/90 backdrop-blur-lg px-2 md:hidden">
        {[
          {
            id: "dashboard",
            label: "Dashboard",
            icon: require("lucide-react").Home,
          },
          {
            id: "activity",
            label: "Activity",
            icon: require("lucide-react").List,
          },
          {
            id: "contacts",
            label: "Contacts",
            icon: require("lucide-react").Users,
            badge: badges.contactRequests ?? 0,
          },
          {
            id: "requests",
            label: "Requests",
            icon: require("lucide-react").ReceiptText,
            badge: badges.paymentRequests ?? 0,
          },
          {
            id: "settings",
            label: "Settings",
            icon: require("lucide-react").Settings,
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id as any)}
              type="button"
              className={`flex flex-col items-center justify-center gap-1 w-14 h-12 rounded-xl transition relative ${
                active
                  ? "text-stone-950 font-bold"
                  : "text-stone-500 font-medium"
              }`}
            >
              <div className="relative">
                <Icon
                  className={`h-5 w-5 ${active ? "text-stone-950" : "text-stone-400"}`}
                />
                {tab.badge && tab.badge > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[7px] font-bold text-white ring-2 ring-white">
                    {tab.badge}
                  </span>
                ) : null}
              </div>
              <span className="text-[9px] tracking-wide">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <RightDrawer
        isOpen={!!drawerContent}
        onClose={() => setDrawerContent(null)}
      >
        {drawerContent}
      </RightDrawer>
    </div>
  );
}
