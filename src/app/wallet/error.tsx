"use client";

export default function WalletError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6">
      <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
          Wallet error
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-stone-950">
          VEIL could not open this wallet view
        </h1>
        <p className="mt-3 text-sm leading-6 text-stone-500">
          {error.message || "A wallet dependency failed while loading. No wallet secrets were exposed."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 h-11 rounded-xl bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-stone-800"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
