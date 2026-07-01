import { NextResponse } from "next/server";

import { USDC_CODE, USDC_ISSUER } from "@/lib/publicWalletCore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HORIZON_URL =
  process.env.HORIZON_URL ??
  "https://horizon-testnet.stellar.org";
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

interface HorizonTradeAggregation {
  timestamp: number;
  close: string;
}

function readPrice(value: string): number | null {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export async function GET() {
  const endTime = Date.now();
  const startTime = endTime - 24 * 60 * 60 * 1000;
  const params = new URLSearchParams({
    base_asset_type: "native",
    counter_asset_type: "credit_alphanum4",
    counter_asset_code: USDC_CODE,
    counter_asset_issuer: USDC_ISSUER,
    start_time: String(startTime),
    end_time: String(endTime),
    resolution: String(FIFTEEN_MINUTES_MS),
    order: "desc",
    limit: "48",
  });

  const response = await fetch(`${HORIZON_URL}/trade_aggregations?${params}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: `Failed to load XLM/USDC market: HTTP ${response.status}` },
      { status: 502 },
    );
  }

  const data = (await response.json()) as {
    _embedded?: { records?: HorizonTradeAggregation[] };
  };
  
  // Fetch real price from CoinGecko with fallback
  let realPrice = 0.172;
  try {
    const cgRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd", {
      next: { revalidate: 60 }
    });
    if (cgRes.ok) {
      const cgData = await cgRes.json() as { stellar?: { usd?: number } };
      if (cgData.stellar?.usd) {
        realPrice = cgData.stellar.usd;
      }
    }
  } catch (err) {
    console.error("Failed to fetch price from CoinGecko, using fallback:", err);
  }

  const rawPoints = (data._embedded?.records ?? [])
    .map((record) => ({
      time: new Date(Number(record.timestamp)).toISOString(),
      price: readPrice(record.close),
    }))
    .filter((point): point is { time: string; price: number } => point.price !== null)
    .reverse();

  // Scale raw testnet prices to match Coingecko real price
  const testnetLatest = rawPoints.at(-1)?.price ?? 1.0;
  const scaleFactor = realPrice / testnetLatest;

  const points = rawPoints.map(p => ({
    time: p.time,
    price: p.price * scaleFactor
  }));

  const latest = points.at(-1)?.price ?? realPrice;
  const previous = points.at(-2)?.price ?? latest;
  const changePct =
    latest !== null && previous !== null && previous > 0
      ? ((latest - previous) / previous) * 100
      : null;

  return NextResponse.json({
    pair: "XLM/USDC",
    source: "Stellar Horizon (Scaled to CoinGecko)",
    latest,
    changePct,
    points,
    updatedAt: new Date().toISOString(),
  });
}
