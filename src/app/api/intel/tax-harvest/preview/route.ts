import { NextRequest, NextResponse } from "next/server";
import { taxHarvestWindowDetector } from "@/lib/intel/detectors/tax-harvest-window";
import { computeUnrealizedPnL, estimateRealizedYtdEur, daysToYearEnd } from "@/lib/intel/tax/positions";

/**
 * GET /api/intel/tax-harvest/preview?month=11&day=15
 *
 * Preview del detector tax-harvest-window sin persistir. Fuerza una fecha
 * dentro de la ventana Oct-Dec para verificar qué surfaces generaría dado
 * el estado actual del portfolio. Defaults: month=11 day=15.
 */
export async function GET(req: NextRequest) {
  const now = new Date();
  const month = Math.min(11, Math.max(9, Number(req.nextUrl.searchParams.get("month") ?? 10)));
  const day = Math.min(28, Math.max(1, Number(req.nextUrl.searchParams.get("day") ?? 15)));
  const fake = new Date(Date.UTC(now.getUTCFullYear(), month, day, 12, 0, 0));

  const [pnl, realized, signals] = await Promise.all([
    computeUnrealizedPnL(),
    estimateRealizedYtdEur(fake),
    taxHarvestWindowDetector.run({ now: fake, madridNow: fake }),
  ]);

  return NextResponse.json({
    previewDate: fake.toISOString(),
    daysToYearEnd: daysToYearEnd(fake),
    unrealized: {
      crypto: {
        lossEur: Math.round(pnl.byBucket.crypto.lossEur),
        positions: pnl.byBucket.crypto.positions.length,
      },
      traditional: {
        lossEur: Math.round(pnl.byBucket.traditional.lossEur),
        positions: pnl.byBucket.traditional.positions.length,
      },
    },
    realizedYtdEur: {
      crypto: Math.round(realized.crypto),
      traditional: Math.round(realized.traditional),
      sellCount: realized.sellCount,
    },
    signalsThatWouldFire: signals,
  });
}
