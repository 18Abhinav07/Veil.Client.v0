import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";

import UnifiedWalletApp from "@/components/unified/UnifiedWalletApp";
import { createAuthOptions } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function WalletPage() {
  const session = await getServerSession(createAuthOptions());
  if (!session) {
    redirect("/signin?callbackUrl=/wallet");
  }

  return (
    <UnifiedWalletApp
      accountEmail={session.user?.email ?? null}
      accountName={session.user?.name ?? null}
    />
  );
}
