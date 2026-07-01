import { NextRequest, NextResponse } from "next/server";

import {
  getInternalServiceHeaders,
  requireLegacyProofRouteAccess,
} from "@/lib/server/internalServiceAuth";

const PROVER_API = process.env.PROVER_API_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest) {
  const access = requireLegacyProofRouteAccess(req.headers);
  if (!access.ok) {
    const error =
      access.code === "LEGACY_ROUTE_DISABLED"
        ? "LEGACY_ROUTE_DISABLED"
        : "SERVICE_AUTH_REQUIRED";
    return NextResponse.json({ error }, { status: access.status });
  }

  try {
    const body = await req.json();
    const upstream = await fetch(`${PROVER_API}/prove/withdraw`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getInternalServiceHeaders() },
      body: JSON.stringify(body),
    });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 502 }
    );
  }
}
