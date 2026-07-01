import { NextRequest, NextResponse } from "next/server";
import { fetchUsdcBalance } from "@/lib/stellar";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });
  const units = await fetchUsdcBalance(address);
  return NextResponse.json({ units });
}
