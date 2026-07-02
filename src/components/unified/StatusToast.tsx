"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, X } from "lucide-react";

const MAX_COLLAPSED_MESSAGE_LENGTH = 50;

interface StatusToastProps {
  tone: "success" | "error";
  message: string;
  onDismiss: () => void;
}

function collapsedMessage(message: string) {
  if (message.length <= MAX_COLLAPSED_MESSAGE_LENGTH) return message;
  return `${message.slice(0, MAX_COLLAPSED_MESSAGE_LENGTH).trimEnd()}...`;
}

export default function StatusToast({ tone, message, onDismiss }: StatusToastProps) {
  const isError = tone === "error";
  const isLong = message.length > MAX_COLLAPSED_MESSAGE_LENGTH;
  const Icon = isError ? AlertTriangle : CheckCircle2;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[calc(100vw-32px)] max-w-[min(420px,calc(100vw-32px))] rounded-xl border border-stone-200 bg-stone-50/95 p-4 shadow-xl shadow-stone-950/10 backdrop-blur-md animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
            isError ? "bg-red-50 text-red-700 ring-1 ring-red-100" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold ${isError ? "text-red-950" : "text-emerald-950"}`}>
            {isError ? "Action needs attention" : "Update complete"}
          </p>
          {isLong ? (
            <details className="group mt-1">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-xs leading-5 text-stone-600">
                <span className="min-w-0 flex-1 break-words">{collapsedMessage(message)}</span>
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-stone-500 transition group-open:text-stone-800">
                  Details
                  <ChevronDown className="h-3 w-3 transition group-open:rotate-180" />
                </span>
              </summary>
              <p className="mt-3 max-h-44 overflow-y-auto rounded-lg bg-stone-100/70 p-3 font-mono text-[11px] leading-5 text-stone-700 break-words">
                {message}
              </p>
            </details>
          ) : (
            <p className="mt-1 text-xs leading-5 text-stone-600 break-words">{message}</p>
          )}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
