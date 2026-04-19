// CBOE VIX via Yahoo Finance (^VIX). Daily closes — no weekend updates.

export interface VixSnapshot {
  level: number;
  previousClose: number;
  changePct: number;
  asOf: number;
}

export async function fetchVix(): Promise<VixSnapshot | null> {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=5d&interval=1d",
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 900 } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
    const timestamps: number[] = result?.timestamp ?? [];
    const valid = closes
      .map((c, i) => ({ c, t: timestamps[i] }))
      .filter((x): x is { c: number; t: number } => typeof x.c === "number");
    if (valid.length < 2) return null;

    const last = valid[valid.length - 1];
    const prev = valid[valid.length - 2];
    const changePct = ((last.c - prev.c) / prev.c) * 100;

    return {
      level: last.c,
      previousClose: prev.c,
      changePct,
      asOf: last.t * 1000,
    };
  } catch {
    return null;
  }
}
