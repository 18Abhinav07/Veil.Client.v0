import "server-only";

import PostgresAdapter from "@auth/pg-adapter";
import type { Adapter } from "next-auth/adapters";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import type { Pool } from "pg";

import {
  attachUserIdToSession,
  ensureWalletProfileForAuthUser,
  getAuthSecret,
  getGoogleOAuthCredentials,
  isGoogleSignInAllowed,
  resolveAuthBaseUrl,
} from "./authCore";
import { getPgPool } from "./db";
import { getWalletServerEnv } from "./serverEnv";
import { upsertWalletProfileForUser } from "./walletRepository";

export function createAuthOptions(pool: Pool = getPgPool()): NextAuthOptions {
  const env = getWalletServerEnv();
  const google = getGoogleOAuthCredentials(env);
  const authBaseUrl =
    resolveAuthBaseUrl(env) ??
    (process.env.NODE_ENV === "development" ? "http://localhost:3002" : undefined);
  if (authBaseUrl && !process.env.NEXTAUTH_URL) {
    process.env.NEXTAUTH_URL = authBaseUrl;
  }
  if (!process.env.NEXTAUTH_SECRET) {
    process.env.NEXTAUTH_SECRET = getAuthSecret(env);
  }

  return {
    adapter: PostgresAdapter(pool) as unknown as Adapter,
    secret: getAuthSecret(env),
    session: { strategy: "database" },
    providers: [
      GoogleProvider({
        clientId: google.clientId,
        clientSecret: google.clientSecret,
      }),
    ],
    callbacks: {
      async signIn({ account, profile }) {
        return isGoogleSignInAllowed({ account, profile });
      },
      async session({ session, user }) {
        return attachUserIdToSession(session, user);
      },
    },
    pages: { signIn: "/signin" },
    events: {
      async signIn({ user, account, profile }) {
        if (account?.provider !== "google") return;
        await ensureWalletProfileForAuthUser({
          user,
          profile,
          upsertProfile: (walletProfile) =>
            upsertWalletProfileForUser(pool, walletProfile),
        });
      },
    },
  };
}
