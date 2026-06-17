import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  attachUserIdToSession,
  ensureWalletProfileForAuthUser,
  getAuthSecret,
  getGoogleOAuthCredentials,
  hasVerifiedGoogleEmail,
  isGoogleSignInAllowed,
  resolveAuthBaseUrl,
} from "./authCore";

const root = process.cwd();

test("auth config reads Auth.js Google OAuth environment variables", () => {
  assert.equal(
    getAuthSecret({ AUTH_SECRET: "auth-secret", NEXTAUTH_SECRET: "legacy" }),
    "auth-secret",
  );
  assert.deepEqual(
    getGoogleOAuthCredentials({
      AUTH_GOOGLE_ID: "google-id",
      AUTH_GOOGLE_SECRET: "google-secret",
    }),
    { clientId: "google-id", clientSecret: "google-secret" },
  );
  assert.throws(() => getAuthSecret({}), /AUTH_SECRET/);
  assert.throws(
    () => getGoogleOAuthCredentials({ AUTH_GOOGLE_ID: "google-id" }),
    /AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET/,
  );
});

test("Google sign-in only allows verified email profiles", () => {
  assert.equal(
    hasVerifiedGoogleEmail({ email: "user@example.com", email_verified: true }),
    true,
  );
  assert.equal(
    isGoogleSignInAllowed({
      account: { provider: "google" },
      profile: { email: "user@example.com", email_verified: "true" },
    }),
    true,
  );
  assert.equal(
    isGoogleSignInAllowed({
      account: { provider: "google" },
      profile: { email: "user@example.com", email_verified: false },
    }),
    false,
  );
  assert.equal(
    isGoogleSignInAllowed({
      account: { provider: "github" },
      profile: { email: "user@example.com", email_verified: true },
    }),
    false,
  );
});

test("auth URL resolution prefers configured app URLs and falls back to request origin", () => {
  assert.equal(
    resolveAuthBaseUrl({ AUTH_URL: "http://localhost:3002" }, "http://127.0.0.1:3009/x"),
    "http://localhost:3002",
  );
  assert.equal(
    resolveAuthBaseUrl({}, "http://localhost:3002/api/auth/providers"),
    "http://localhost:3002",
  );
});

test("OAuth sign-in event creates or reuses one wallet profile by Auth.js user id and email", async () => {
  const calls: Array<{ userId: string; email: string }> = [];
  await ensureWalletProfileForAuthUser({
    user: { id: "auth-user-1", email: "fallback@example.com" },
    profile: { email: "User@Example.com", email_verified: true },
    upsertProfile: async (profile) => {
      calls.push(profile);
    },
  });

  assert.deepEqual(calls, [{ userId: "auth-user-1", email: "User@Example.com" }]);

  const fallbackCalls: Array<{ userId: string; email: string }> = [];
  await ensureWalletProfileForAuthUser({
    user: { id: "auth-user-2", email: "event-user@example.com" },
    upsertProfile: async (profile) => {
      fallbackCalls.push(profile);
    },
  });
  assert.deepEqual(fallbackCalls, [
    { userId: "auth-user-2", email: "event-user@example.com" },
  ]);

  await assert.rejects(
    () =>
      ensureWalletProfileForAuthUser({
        user: { id: "auth-user-2" },
        upsertProfile: async () => {},
      }),
    /without a verified email/,
  );
});

test("session callback exposes the stable Auth.js user id to server-rendered wallet routes", () => {
  const initialSession: { user: Record<string, unknown> } = {
    user: { email: "user@example.com" },
  };
  const session = attachUserIdToSession(
    initialSession,
    { id: "auth-user-1" },
  );

  assert.equal(session.user.id, "auth-user-1");
});

test("Auth.js integration uses Google, Postgres adapter, database sessions, and wallet profile sync", () => {
  const authSource = readFileSync(join(root, "src", "lib", "server", "auth.ts"), "utf8");
  const routeSource = readFileSync(
    join(root, "src", "app", "api", "auth", "[...nextauth]", "route.ts"),
    "utf8",
  );
  const pageSource = readFileSync(join(root, "src", "app", "page.tsx"), "utf8");
  const walletPageSource = readFileSync(join(root, "src", "app", "wallet", "page.tsx"), "utf8");
  const unifiedWalletAppSource = readFileSync(
    join(root, "src", "components", "unified", "UnifiedWalletApp.tsx"),
    "utf8",
  );
  const signInPageSource = readFileSync(
    join(root, "src", "app", "signin", "page.tsx"),
    "utf8",
  );
  const signInPanelSource = readFileSync(
    join(root, "src", "components", "SignInPanel.tsx"),
    "utf8",
  );
  const accountMemorySource = readFileSync(
    join(root, "src", "components", "WalletAccountMemory.tsx"),
    "utf8",
  );
  const rememberedAccountSource = readFileSync(
    join(root, "src", "lib", "rememberedWalletAccount.ts"),
    "utf8",
  );
  const iconSource = readFileSync(join(root, "src", "app", "icon.svg"), "utf8");
  const faviconSource = readFileSync(
    join(root, "src", "app", "favicon.ico", "route.ts"),
    "utf8",
  );

  assert.match(authSource, /GoogleProvider/);
  assert.match(authSource, /PostgresAdapter/);
  assert.match(authSource, /session:\s*\{\s*strategy:\s*"database"\s*\}/);
  assert.match(authSource, /NEXTAUTH_URL/);
  assert.match(authSource, /resolveAuthBaseUrl/);
  assert.match(authSource, /http:\/\/localhost:3002/);
  assert.match(authSource, /pages:\s*\{\s*signIn:\s*"\/signin"\s*\}/);
  assert.match(authSource, /upsertWalletProfileForUser/);
  assert.match(routeSource, /export function GET/);
  assert.match(routeSource, /export function POST/);
  assert.match(routeSource, /runtime = "nodejs"/);
  assert.doesNotMatch(pageSource, /getServerSession/);
  assert.match(pageSource, /\/signin\?callbackUrl=\/wallet/);
  assert.doesNotMatch(pageSource, /href="\/wallet"/);
  assert.match(walletPageSource, /UnifiedWalletApp/);
  assert.doesNotMatch(pageSource, /\{\(wallet\)/);
  assert.match(unifiedWalletAppSource, /"use client"/);
  assert.match(unifiedWalletAppSource, /VaultGate/);
  assert.match(unifiedWalletAppSource, /WalletAccountMemory/);
  assert.match(unifiedWalletAppSource, /PrivateDashboard/);
  assert.match(unifiedWalletAppSource, /PrivateActivity/);
  assert.match(signInPageSource, /SignInPanel/);
  assert.match(signInPageSource, /callbackUrl/);
  assert.match(walletPageSource, /accountEmail/);
  assert.match(signInPanelSource, /Continue with Google/);
  assert.match(signInPanelSource, /session-card/);
  assert.match(signInPanelSource, /Continue as/);
  assert.match(signInPanelSource, /Use another account/);
  assert.match(signInPanelSource, /login_hint/);
  assert.match(signInPanelSource, /prompt:\s*"select_account"/);
  assert.match(signInPanelSource, /clearRememberedWalletAccount/);
  assert.match(accountMemorySource, /rememberWalletAccount/);
  assert.match(rememberedAccountSource, /wallet-v2:last-google-account/);
  assert.match(iconSource, /<svg/);
  assert.match(faviconSource, /export function GET/);
  assert.match(faviconSource, /image\/svg\+xml/);
  assert.doesNotMatch(pageSource, /WalletConsole/);
  assert.doesNotMatch(walletPageSource, /components\/WalletApp|<WalletApp\b/);
  assert.doesNotMatch(unifiedWalletAppSource, /WalletHome/);
  assert.doesNotMatch(unifiedWalletAppSource, /PrivatePaymentsHome/);
});
