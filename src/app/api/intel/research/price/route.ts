import { NextRequest, NextResponse } from "next/server";
import { fetchSpotPrice } from "@/lib/intel/research/fetcher";

/**
 * GET /api/intel/research/price?ticker=TTWO
 * Resuelve un ticker y devuelve su precio spot actual vía Yahoo/CoinGecko.
 * Usado por la card Watchlist de /strategy para marcar entry_window en vivo.
 */
export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.trim();
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });
  if (ticker.length > 32) return NextResponse.json({ error: "ticker too long" }, { status: 400 });

  const result = await fetchSpotPrice(ticker);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? "fetch failed" }, { status: 404 });
  }
  return NextResponse.json({
    ticker,
    price: result.data.price,
    currency: result.data.currency,
    source: result.data.source,
  });
}
