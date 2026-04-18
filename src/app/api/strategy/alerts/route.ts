import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

// Price alert system: checks if any DCA asset has dipped significantly
// from its 7-day average → opportunity to buy early

const CRYPTO_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana",
  PEPE: "pepe", BNB: "binancecoin", SHIB: "shiba-inu",
};

async function getCryptoHistory(id: string, days: number): Promise<number[]> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=eur&days=${days}`,
      { next: { revalidate: 300 } } // cache 5 min
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.prices || []).map((p: number[]) => p[1]);
  } catch { return []; }
}

async function getETFPrice(symbol: string): Promise<{ current: number; avg7d: number } | null> {
  // Use Yahoo Finance via the existing price data
  try {
    const tickers: Record<string, string> = {
      "MSCI World": "IWDA.AS", "MSCI Momentum": "IWMO.AS",
      "Gold ETC": "4GLD.DE", "EU Infl Bond": "IBCI.DE", "MSFT": "MSFT",
    };
    const ticker = tickers[symbol];
    if (!ticker) return null;

    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=7d&interval=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 300 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const closes = data.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(Boolean) || [];
    if (closes.length === 0) return null;
    const avg = closes.reduce((s: number, v: number) => s + v, 0) / closes.length;
    return { current: closes[closes.length - 1], avg7d: avg };
  } catch { return null; }
}

export async function GET() {
  try {
    const plans = await db.select().from(schema.investmentPlans);
    const activePlans = plans.filter(p => p.enabled);
    const alerts: {
      asset: string; type: "dip" | "surge" | "opportunity";
      currentPrice: number; avg7d: number; changePct: number;
      message: string; severity: "info" | "warning" | "action";
    }[] = [];

    for (const plan of activePlans) {
      const cryptoId = CRYPTO_IDS[plan.asset];
      
      if (cryptoId) {
        // Crypto: use CoinGecko
        const prices = await getCryptoHistory(cryptoId, 7);
        if (prices.length > 10) {
          const current = prices[prices.length - 1];
          const avg7d = prices.reduce((s, v) => s + v, 0) / prices.length;
          const changePct = ((current - avg7d) / avg7d) * 100;
          
          if (changePct <= -5) {
            alerts.push({
              asset: plan.asset, type: "dip",
              currentPrice: Math.round(current * 100) / 100,
              avg7d: Math.round(avg7d * 100) / 100,
              changePct: Math.round(changePct * 10) / 10,
              message: `${plan.asset} ha caído ${Math.abs(changePct).toFixed(1)}% respecto a su media de 7 días. Buen momento para adelantar DCA.`,
              severity: "action",
            });
          } else if (changePct <= -3) {
            alerts.push({
              asset: plan.asset, type: "dip",
              currentPrice: Math.round(current * 100) / 100,
              avg7d: Math.round(avg7d * 100) / 100,
              changePct: Math.round(changePct * 10) / 10,
              message: `${plan.asset} está ${Math.abs(changePct).toFixed(1)}% por debajo de su media semanal.`,
              severity: "info",
            });
          } else if (changePct >= 10) {
            alerts.push({
              asset: plan.asset, type: "surge",
              currentPrice: Math.round(current * 100) / 100,
              avg7d: Math.round(avg7d * 100) / 100,
              changePct: Math.round(changePct * 10) / 10,
              message: `${plan.asset} ha subido ${changePct.toFixed(1)}%. Considera esperar al siguiente DCA semanal.`,
              severity: "warning",
            });
          }
        }
        // Rate limit CoinGecko
        await new Promise(r => setTimeout(r, 300));
      } else {
        // ETF/Stock: use Yahoo
        const priceData = await getETFPrice(plan.asset);
        if (priceData) {
          const changePct = ((priceData.current - priceData.avg7d) / priceData.avg7d) * 100;
          
          if (changePct <= -3) {
            alerts.push({
              asset: plan.asset, type: "dip",
              currentPrice: Math.round(priceData.current * 100) / 100,
              avg7d: Math.round(priceData.avg7d * 100) / 100,
              changePct: Math.round(changePct * 10) / 10,
              message: `${plan.asset} ha caído ${Math.abs(changePct).toFixed(1)}% esta semana. Oportunidad de compra.`,
              severity: changePct <= -5 ? "action" : "info",
            });
          }
        }
      }
    }

    // Sort: action first, then warning, then info
    const order = { action: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => order[a.severity] - order[b.severity]);

    return NextResponse.json({
      alerts,
      checkedAt: new Date().toISOString(),
      assetsChecked: activePlans.length,
      hasOpportunity: alerts.some(a => a.severity === "action"),
    });
  } catch (err) {
    console.error("Alerts error:", err);
    return NextResponse.json({ alerts: [], error: String(err) }, { status: 500 });
  }
}
