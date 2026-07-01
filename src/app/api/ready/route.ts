import { NextResponse } from "next/server";

import { getPgPool } from "@/lib/server/db";
import { getWalletServerEnv } from "@/lib/server/serverEnv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REQUIRED_ENV = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "INTERNAL_SERVICE_AUTH_TOKEN",
  "JOB_EXECUTION_ENCRYPTION_KEY",
  "PROVER_API_URL",
  "RELAYER_URL",
  "STELLAR_RPC_URL",
  "NEXT_PUBLIC_POOL_ID",
  "NEXT_PUBLIC_USDC_CONTRACT_ID",
  "MARKET_POOL_ID",
  "MARKET_POOL_CONTRACT_ID",
  "MARKET_POOL_DEPLOYMENT_LEDGER",
  "MARKET_ESCROW_BN254_PUBLIC_HEX",
  "MARKET_ESCROW_X25519_PUBLIC_HEX",
  "MARKET_ESCROW_BN254_PRIVATE_HEX",
  "MARKET_ESCROW_X25519_PRIVATE_HEX",
  "MARKET_ESCROW_MEMBERSHIP_BLINDING_HEX",
] as const;

function envStatus(env: Record<string, string | undefined>) {
  return REQUIRED_ENV.map((key) => ({
    key,
    ok: Boolean(env[key]),
  }));
}

async function serviceHealth(name: string, baseUrl: string | undefined) {
  if (!baseUrl) return { ok: false, error: `${name} URL is missing` };
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return {
      ok: response.ok,
      error: response.ok ? null : `${name} health returned HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : `${name} health failed`,
    };
  }
}

export async function GET() {
  const env = getWalletServerEnv();
  const envChecks = envStatus(env);
  const missingEnv = envChecks.filter((item) => !item.ok).map((item) => item.key);

  let databaseOk = false;
  let databaseError: string | null = null;
  try {
    const result = await getPgPool().query<{ ok: number }>("select 1 as ok");
    databaseOk = result.rows[0]?.ok === 1;
  } catch (error) {
    databaseError = error instanceof Error ? error.message : "Database readiness failed";
  }

  const [prover, relayer] = await Promise.all([
    serviceHealth("prover", env.PROVER_API_URL),
    serviceHealth("relayer", env.RELAYER_URL),
  ]);

  const ok = missingEnv.length === 0 && databaseOk && prover.ok && relayer.ok;
  return NextResponse.json(
    {
      ok,
      checks: {
        env: envChecks,
        database: {
          ok: databaseOk,
          error: databaseOk ? null : databaseError,
        },
        services: {
          prover,
          relayer,
        },
      },
    },
    { status: ok ? 200 : 503 },
  );
}
