"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bell, Check, Globe, Loader2, Lock, BarChart3 } from "lucide-react";
import { useWalletRealtimeEvent } from "./WalletRealtimeProvider";

interface NotificationView {
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
}

interface TopHeaderProps {
  mode: "public" | "private" | "markets";
  onChangeMode: (mode: "public" | "private" | "markets") => void;
  title: string;
  accountEmail?: string | null;
  initialNotifications?: NotificationView[];
  notificationUnreadCount?: number;
  onNotificationsRead?: () => void;
  onNotificationAction?: (actionUrl: string | null) => void;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
  return data as T;
}

function formatNotificationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function severityClass(severity: NotificationView["severity"]) {
  if (severity === "success") return "bg-emerald-500";
  if (severity === "warning") return "bg-amber-500";
  if (severity === "error") return "bg-red-500";
  return "bg-stone-900";
}

const NOTIFICATION_RELEVANT_EVENT_TYPES = new Set([
  "private_note_received",
  "spend_job_completed",
  "private_payment_sent",
  "payment_request_created",
  "payment_request_received",
  "payment_request_paid",
  "contact_request_received",
  "contact_request_accepted",
  "market_deposit_confirmed",
  "market_withdraw_confirmed",
  "market_bet_confirmed",
  "market_payout_ready",
  "market_payout_claimed",
  "market_payout_failed",
]);

export default function TopHeader({
  mode,
  onChangeMode,
  title,
  accountEmail,
  initialNotifications = [],
  notificationUnreadCount = 0,
  onNotificationsRead,
  onNotificationAction,
}: TopHeaderProps) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] =
    useState<NotificationView[]>(() =>
      initialNotifications.filter((notification) => notification.readAt === null),
    );
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const [unreadCountOverride, setUnreadCountOverride] = useState<number | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const notificationRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNotifications(initialNotifications.filter((notification) => notification.readAt === null));
  }, [initialNotifications]);

  useEffect(() => {
    setUnreadCountOverride(null);
  }, [notificationUnreadCount]);

  const unreadNotifications = useMemo(
    () => notifications.filter((notification) => notification.readAt === null),
    [notifications],
  );
  const visibleUnreadCount =
    unreadCountOverride ?? (notificationUnreadCount || unreadNotifications.length);

  const refreshNotifications = useCallback(async () => {
    setLoadingNotifications(true);
    setNotificationError("");
    try {
      const data = await parseResponse<{ notifications: NotificationView[] }>(
        await fetch("/api/wallet/notifications?limit=20&unreadOnly=true", {
          cache: "no-store",
        }),
      );
      const unread = data.notifications.filter((notification) => notification.readAt === null);
      setNotifications(unread);
      setUnreadCountOverride(unread.length);
    } catch (err) {
      setNotificationError(String(err));
    } finally {
      setLoadingNotifications(false);
    }
  }, []);

  const scheduleNotificationsRefresh = useCallback(() => {
    if (notificationRefreshTimer.current) return;
    notificationRefreshTimer.current = setTimeout(() => {
      notificationRefreshTimer.current = null;
      void refreshNotifications();
    }, 500);
  }, [refreshNotifications]);

  const markNotificationsRead = async () => {
    const unreadIds = notifications
      .filter((notification) => notification.readAt === null)
      .map((notification) => notification.id);
    if (unreadIds.length === 0) return;
    setLoadingNotifications(true);
    setNotificationError("");
    try {
      const data = await parseResponse<{ notifications: NotificationView[] }>(
        await fetch("/api/wallet/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notificationIds: unreadIds }),
        }),
      );
      const readById = new Map(
        data.notifications.map((notification) => [
          notification.id,
          notification,
        ]),
      );
      setNotifications((current) =>
        current.filter((notification) => !readById.has(notification.id)),
      );
      setUnreadCountOverride((current) =>
        Math.max(0, (current ?? unreadNotifications.length) - readById.size),
      );
      onNotificationsRead?.();
    } catch (err) {
      setNotificationError(String(err));
    } finally {
      setLoadingNotifications(false);
    }
  };

  const toggleNotifications = async () => {
    const nextOpen = !notificationsOpen;
    setNotificationsOpen(nextOpen);
    if (nextOpen) {
      await refreshNotifications();
    }
  };

  useEffect(() => {
    if (!notificationsOpen) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && popoverRef.current?.contains(target)) return;
      setNotificationsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [notificationsOpen]);

  useEffect(() => {
    return () => {
      if (notificationRefreshTimer.current) {
        clearTimeout(notificationRefreshTimer.current);
        notificationRefreshTimer.current = null;
      }
    };
  }, []);

  useWalletRealtimeEvent(
    useCallback(
      (event) => {
        if (event.event !== "wallet_activity") return;
        const eventType = String(event.data.eventType ?? "");
        if (NOTIFICATION_RELEVANT_EVENT_TYPES.has(eventType)) {
          scheduleNotificationsRefresh();
        }
      },
      [scheduleNotificationsRefresh],
    ),
  );

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/60 bg-white/80 backdrop-blur-xl shrink-0">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 md:px-6">
        <h1 className="text-lg md:text-xl font-semibold tracking-tight text-stone-950 truncate max-w-[150px] sm:max-w-none">
          {title}
        </h1>

        <div className="flex items-center gap-3 md:gap-6">
          {/* Global Context Switcher (Soft Pill Switcher) */}
          <div className="relative flex h-9 md:h-10 items-center rounded-full bg-stone-100/60 p-0.5 md:p-1 border border-stone-200/30">
            <button
              type="button"
              onClick={() => onChangeMode("public")}
              className="relative z-10 flex h-full w-16 sm:w-20 md:w-28 items-center justify-center rounded-full text-[10px] md:text-xs font-semibold tracking-wide transition-colors duration-200"
              style={{ color: mode === "public" ? "#0c0a09" : "#7c726a" }}
            >
              <Globe size={11} className="mr-1 md:mr-1.5 opacity-80" />
              Public
              {mode === "public" && (
                <motion.div
                  layoutId="mode-indicator"
                  className="absolute inset-0 -z-10 rounded-full bg-white shadow-sm border border-stone-200/40"
                  transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}
                />
              )}
            </button>
            <button
              type="button"
              onClick={() => onChangeMode("private")}
              className="relative z-10 flex h-full w-16 sm:w-20 md:w-28 items-center justify-center rounded-full text-[10px] md:text-xs font-semibold tracking-wide transition-colors duration-200"
              style={{ color: mode === "private" ? "#0c0a09" : "#7c726a" }}
            >
              <Lock size={11} className="mr-1 md:mr-1.5 opacity-80" />
              Private
              {mode === "private" && (
                <motion.div
                  layoutId="mode-indicator"
                  className="absolute inset-0 -z-10 rounded-full bg-white shadow-sm border border-stone-200/40"
                  transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}
                />
              )}
            </button>
            <button
              type="button"
              onClick={() => onChangeMode("markets")}
              className="relative z-10 flex h-full w-16 sm:w-20 md:w-28 items-center justify-center rounded-full text-[10px] md:text-xs font-semibold tracking-wide transition-colors duration-200"
              style={{ color: mode === "markets" ? "#0c0a09" : "#7c726a" }}
            >
              <BarChart3 size={11} className="mr-1 md:mr-1.5 opacity-80" />
              Markets
              {mode === "markets" && (
                <motion.div
                  layoutId="mode-indicator"
                  className="absolute inset-0 -z-10 rounded-full bg-white shadow-sm border border-stone-200/40"
                  transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}
                />
              )}
            </button>
          </div>

          {/* User Profile Area */}
          <div className="relative" ref={popoverRef}>
            <button
              type="button"
              onClick={() => void toggleNotifications()}
              aria-label="Notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 hover:text-stone-950"
            >
              <Bell className="h-4 w-4" />
              {visibleUnreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-stone-950 px-1 text-[10px] font-bold text-white">
                  {visibleUnreadCount > 9 ? "9+" : visibleUnreadCount}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 top-11 z-50 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl shadow-stone-950/10">
                <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-stone-950">
                      Notifications
                    </p>
                    <p className="text-xs text-stone-500">
                      {visibleUnreadCount > 0
                        ? `${visibleUnreadCount} unread`
                        : "All caught up"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void markNotificationsRead()}
                    disabled={
                      loadingNotifications || unreadNotifications.length === 0
                    }
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {loadingNotifications ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    Read
                  </button>
                </div>

                <div className="max-h-[420px] overflow-y-auto">
                  {loadingNotifications && notifications.length === 0 ? (
                    <div className="flex h-32 items-center justify-center text-stone-500">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : notificationError ? (
                    <div className="p-4 text-sm font-medium text-red-700">
                      {notificationError}
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="p-6 text-center">
                      <p className="text-sm font-semibold text-stone-900">
                        No notifications yet
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        Payments, received notes, contacts, and requests will
                        appear here.
                      </p>
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setNotificationsOpen(false);
                          onNotificationAction?.(notification.actionUrl);
                        }}
                        className="flex w-full gap-3 border-b border-stone-100 px-4 py-3 text-left last:border-b-0 transition hover:bg-stone-50"
                      >
                        <span
                          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${severityClass(notification.severity)}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-stone-950">
                              {notification.title}
                            </span>
                            {notification.readAt === null && (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-stone-950" />
                            )}
                          </span>
                          {notification.body && (
                            <span className="mt-0.5 block text-xs leading-5 text-stone-600">
                              {notification.body}
                            </span>
                          )}
                          <span className="mt-1 block text-[11px] font-medium text-stone-400">
                            {formatNotificationDate(notification.createdAt)}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-l border-stone-200 pl-3 md:pl-6">
            <div className="flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-full bg-stone-900 text-white">
              <span className="text-[10px] md:text-xs font-semibold uppercase">
                {accountEmail?.charAt(0) ?? "U"}
              </span>
            </div>
            {accountEmail && (
              <span className="hidden text-xs md:text-sm font-medium text-stone-700 lg:inline-block">
                {accountEmail}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
