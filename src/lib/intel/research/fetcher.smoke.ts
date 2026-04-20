/**
 * Smoke test manual del fetcher — hace network I/O, NO se corre en CI.
 * Ejecutar: `npx tsx src/lib/intel/research/fetcher.smoke.ts`
 */
import { fetchPriceHistory, fetchSpotPrice, resolveTicker } from "./fetcher";
import { computeTechnicalSnapshot } from "./indicators";

const SEED = ["TTWO", "SAN.MC", "NVDA", "XLE", "REP.MC", "BTC", "ETH"];

async function run() {
  for (const t of SEED) {
    const resolved = resolveTicker(t);
    const spot = await fetchSpotPrice(t);
    const hist = await fetchPriceHistory(t, 1100);
    if (!hist.ok) {
      console.log(`${t}  [${resolved.source}]  FAIL: ${hist.reason}`);
      continue;
    }
    const closes = hist.data.points.map((p) => p.close);
    const snap = computeTechnicalSnapshot(closes);
    console.log(
      `${t}  src=${resolved.source}  bars=${closes.length}  ccy=${hist.data.currency}` +
      `  spot=${spot.ok ? spot.data.price.toFixed(3) : "?"}` +
      `  rsi=${snap.rsi14?.toFixed(1) ?? "?"}` +
      `  distSMA200=${snap.distToSma200Pct?.toFixed(1) ?? "?"}%` +
      `  vol90d=${snap.vol90dPct?.toFixed(1) ?? "?"}%`,
    );
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
