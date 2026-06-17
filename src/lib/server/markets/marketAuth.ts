export const DEFAULT_MARKET_ADMIN_EMAIL = "abhinavpangaria2003@gmail.com";

export class MarketAdminError extends Error {
  readonly status = 403;

  constructor() {
    super("403: Market admin access is restricted");
    this.name = "MarketAdminError";
  }
}

function normalizeEmail(email: string | null | undefined) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function isMarketAdminEmail(email: string | null | undefined) {
  const configuredAdmin = normalizeEmail(
    process.env.MARKET_ADMIN_EMAIL ?? DEFAULT_MARKET_ADMIN_EMAIL,
  );
  return normalizeEmail(email) === configuredAdmin;
}

export function assertMarketAdminEmail(email: string | null | undefined) {
  if (!isMarketAdminEmail(email)) {
    throw new MarketAdminError();
  }
}

export async function requireMarketAdmin() {
  const [{ getServerSession }, { createAuthOptions }] = await Promise.all([
    import("next-auth/next"),
    import("../auth"),
  ]);
  const session = await getServerSession(createAuthOptions());
  assertMarketAdminEmail(session?.user?.email);
  return session;
}
