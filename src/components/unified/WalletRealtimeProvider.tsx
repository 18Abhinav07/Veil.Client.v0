"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

export interface WalletRealtimeEvent {
  event: "connected" | "wallet_activity" | "stream_error" | "heartbeat";
  id?: string;
  data: Record<string, unknown>;
}

type WalletRealtimeListener = (event: WalletRealtimeEvent) => void;

interface WalletRealtimeContextValue {
  subscribe: (listener: WalletRealtimeListener) => () => void;
}

const WalletRealtimeContext = createContext<WalletRealtimeContextValue | null>(null);

function readEventData(event: MessageEvent): Record<string, unknown> {
  try {
    const parsed = JSON.parse(event.data);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function WalletRealtimeProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<WalletRealtimeListener>());

  const subscribe = useCallback((listener: WalletRealtimeListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const emit = useCallback((event: WalletRealtimeEvent) => {
    for (const listener of listeners.current) {
      listener(event);
    }
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/wallet/events");
    const forward = (eventName: WalletRealtimeEvent["event"]) => (event: Event) => {
      const message = event as MessageEvent;
      emit({
        event: eventName,
        id: message.lastEventId || undefined,
        data: readEventData(message),
      });
    };

    source.addEventListener("connected", forward("connected"));
    source.addEventListener("wallet_activity", forward("wallet_activity"));
    source.addEventListener("stream_error", forward("stream_error"));
    source.addEventListener("heartbeat", forward("heartbeat"));
    source.onerror = () => undefined;

    return () => {
      source.close();
      listeners.current.clear();
    };
  }, [emit]);

  const value = useMemo(() => ({ subscribe }), [subscribe]);
  return <WalletRealtimeContext.Provider value={value}>{children}</WalletRealtimeContext.Provider>;
}

export function useWalletRealtimeEvent(handler: WalletRealtimeListener) {
  const context = useContext(WalletRealtimeContext);
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!context) return undefined;
    return context.subscribe((event) => handlerRef.current(event));
  }, [context]);
}
