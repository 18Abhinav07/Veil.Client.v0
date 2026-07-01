import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";

import AdminMarketsConsole from "@/components/admin/AdminMarketsConsole";
import { createAuthOptions } from "@/lib/server/auth";
import { isMarketAdminEmail } from "@/lib/server/markets/marketAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminMarketsPage() {
  const session = await getServerSession(createAuthOptions());
  if (!session) {
    redirect("/signin?callbackUrl=/admin/markets");
  }

  if (!isMarketAdminEmail(session.user?.email)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6 text-stone-950">
        <section className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
            Market Admin
          </p>
          <h1 className="mt-3 text-2xl font-black tracking-tight">
            Admin access is restricted
          </h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Sign in with the configured admin Google account to manage markets and payouts.
          </p>
        </section>
      </main>
    );
  }

  return <AdminMarketsConsole adminEmail={session.user?.email ?? "Admin"} />;
}
