import { NextRequest, NextResponse } from "next/server";

import { parseHorizonAccount } from "@/lib/publicWalletCore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HORIZON_URL =
  process.env.HORIZON_URL ??
  "https://horizon-testnet.stellar.org";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(`${HORIZON_URL}/accounts/${encodeURIComponent(address)}`, {
      cache: "no-store",
    });
  } catch (err) {
    console.warn("Public account Horizon lookup failed", err);
    return NextResponse.json(parseHorizonAccount(null));
  }
  if (response.status === 404) {
    return NextResponse.json(parseHorizonAccount(null));
  }
  if (!response.ok) {
    return NextResponse.json(
      { error: `Failed to load Stellar account: HTTP ${response.status}` },
      { status: 502 },
    );
  }

  return NextResponse.json(parseHorizonAccount(await response.json()));
}
