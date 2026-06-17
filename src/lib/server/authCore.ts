export interface AuthEnv {
  AUTH_SECRET?: string;
  NEXTAUTH_SECRET?: string;
  AUTH_GOOGLE_ID?: string;
  AUTH_GOOGLE_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  [key: string]: string | undefined;
}

export interface AuthAccountLike {
  provider?: string | null;
}

export interface AuthProfileLike {
  email?: unknown;
  email_verified?: unknown;
}

export interface AuthUserLike {
  id?: unknown;
  email?: unknown;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getAuthSecret(env: AuthEnv = process.env): string {
  const secret = readNonEmptyString(env.AUTH_SECRET ?? env.NEXTAUTH_SECRET);
  if (!secret) {
    throw new Error("AUTH_SECRET is required for Wallet V2 Google auth");
  }
  return secret;
}

export function getGoogleOAuthCredentials(env: AuthEnv = process.env) {
  const clientId = readNonEmptyString(env.AUTH_GOOGLE_ID ?? env.GOOGLE_CLIENT_ID);
  const clientSecret = readNonEmptyString(
    env.AUTH_GOOGLE_SECRET ?? env.GOOGLE_CLIENT_SECRET,
  );
  if (!clientId || !clientSecret) {
    throw new Error("AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET are required");
  }
  return { clientId, clientSecret };
}

export function resolveAuthBaseUrl(
  env: AuthEnv = process.env,
  requestUrl?: string,
): string | undefined {
  const configured =
    readNonEmptyString(env.AUTH_URL) ??
    readNonEmptyString(env.NEXTAUTH_URL) ??
    readNonEmptyString(env.NEXT_PUBLIC_APP_URL);
  if (configured) return configured;
  return requestUrl ? new URL(requestUrl).origin : undefined;
}

export function hasVerifiedGoogleEmail(profile: AuthProfileLike | null | undefined): boolean {
  const email = readNonEmptyString(profile?.email);
  const verified = profile?.email_verified;
  return Boolean(email) && (verified === true || verified === "true");
}

export function isGoogleSignInAllowed(input: {
  account?: AuthAccountLike | null;
  profile?: AuthProfileLike | null;
}): boolean {
  return input.account?.provider === "google" && hasVerifiedGoogleEmail(input.profile);
}

export async function ensureWalletProfileForAuthUser(input: {
  user: AuthUserLike;
  profile?: AuthProfileLike | null;
  upsertProfile: (profile: { userId: string; email: string }) => Promise<unknown>;
}): Promise<void> {
  const userId = readNonEmptyString(input.user.id);
  const email =
    readNonEmptyString(input.profile?.email) ?? readNonEmptyString(input.user.email);

  if (!userId) {
    throw new Error("Cannot create wallet profile without an Auth.js user id");
  }
  if (!email) {
    throw new Error("Cannot create wallet profile without a verified email");
  }
  await input.upsertProfile({ userId, email });
}

export function attachUserIdToSession<SessionLike extends { user?: Record<string, unknown> }>(
  session: SessionLike,
  user: AuthUserLike,
): SessionLike {
  const userId = readNonEmptyString(user.id);
  if (userId && session.user) {
    session.user.id = userId;
  }
  return session;
}
