import NextAuth from "next-auth";
import type { NextRequest } from "next/server";

import { resolveAuthBaseUrl } from "@/lib/server/authCore";
import { createAuthOptions } from "@/lib/server/auth";
import { getWalletServerEnv } from "@/lib/server/serverEnv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AuthRouteContext = {
  params: Promise<{ nextauth: string[] }>;
};

function prepareAuthUrl(request: NextRequest) {
  const authUrl = resolveAuthBaseUrl(getWalletServerEnv(), request.url);
  if (authUrl) {
    process.env.NEXTAUTH_URL = authUrl;
  }
}

export function GET(request: NextRequest, context: AuthRouteContext) {
  prepareAuthUrl(request);
  return NextAuth(request, context, createAuthOptions());
}

export function POST(request: NextRequest, context: AuthRouteContext) {
  prepareAuthUrl(request);
  return NextAuth(request, context, createAuthOptions());
}
