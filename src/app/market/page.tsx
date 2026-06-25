import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";

import MarketVaultShell from "@/components/markets/MarketVaultShell";
import { createAuthOptions } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function MarketPage() {
  const session = await getServerSession(createAuthOptions());
  if (!session) {
    redirect("/signin?callbackUrl=/market");
  }

  return <MarketVaultShell accountEmail={session.user?.email ?? null} />;
}
