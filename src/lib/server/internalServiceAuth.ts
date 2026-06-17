type EnvLike = {
  ENABLE_LEGACY_PROOF_ROUTES?: string;
  INTERNAL_SERVICE_AUTH_TOKEN?: string;
};

export interface LegacyRouteAccess {
  ok: boolean;
  status: number;
  code: "LEGACY_ROUTE_DISABLED" | "SERVICE_AUTH_REQUIRED" | null;
}

export interface InternalServiceAccess {
  ok: boolean;
  status: number;
  code: "SERVICE_AUTH_REQUIRED" | null;
}

function readToken(env: EnvLike): string {
  return (env.INTERNAL_SERVICE_AUTH_TOKEN ?? "").trim();
}

export function getInternalServiceHeaders(
  env: EnvLike = process.env as EnvLike,
): Record<string, string> {
  const token = readToken(env);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function legacyProofRoutesEnabled(env: EnvLike = process.env as EnvLike): boolean {
  return (env.ENABLE_LEGACY_PROOF_ROUTES ?? "").trim().toLowerCase() === "true";
}

export function requireLegacyProofRouteAccess(
  headers: Headers,
  env: EnvLike = process.env as EnvLike,
): LegacyRouteAccess {
  if (!legacyProofRoutesEnabled(env)) {
    return { ok: false, status: 404, code: "LEGACY_ROUTE_DISABLED" };
  }

  const token = readToken(env);
  if (!token || headers.get("authorization") !== `Bearer ${token}`) {
    return { ok: false, status: 401, code: "SERVICE_AUTH_REQUIRED" };
  }

  return { ok: true, status: 200, code: null };
}

export function requireInternalServiceAccess(
  headers: Headers,
  env: EnvLike = process.env as EnvLike,
): InternalServiceAccess {
  const token = readToken(env);
  if (!token || headers.get("authorization") !== `Bearer ${token}`) {
    return { ok: false, status: 401, code: "SERVICE_AUTH_REQUIRED" };
  }

  return { ok: true, status: 200, code: null };
}
