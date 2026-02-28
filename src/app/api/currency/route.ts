import { NextResponse } from "next/server";

let cache: { rates: Record<string, number>; ts: number } | null = null;
const CACHE_TTL = 3600_000; // 1 hour

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.rates);
  }
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    const data = await res.json();
    cache = { rates: data.rates, ts: Date.now() };
    return NextResponse.json(data.rates);
  } catch {
    return NextResponse.json({ USD: 1, EUR: 0.85, GBP: 0.73 });
  }
}
