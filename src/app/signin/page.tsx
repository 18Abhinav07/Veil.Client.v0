import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import SignInPanel from "@/components/SignInPanel";
import { createAuthOptions } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SignInPageProps {
  searchParams?: Promise<{
    callbackUrl?: string;
  }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const callbackUrl = params?.callbackUrl?.startsWith("/") ? params.callbackUrl : "/wallet";

  return (
    <div>
      <SignInPanel callbackUrl={callbackUrl} />
    </div>
  );
}
