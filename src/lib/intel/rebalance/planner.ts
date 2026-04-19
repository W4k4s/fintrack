import type { Asset, StrategyProfile } from "@/lib/db/schema";
import { ASSET_CLASSES, classifyAsset, type AssetClass } from "../allocation/classify";
import type { AllocationSnapshot } from "../allocation/compute";
import type { PositionPnL, TaxBucket } from "../tax/positions";
import { irpfOnGain } from "./irpf";
import type {
  ClassDrift,
  PlanBuy,
  PlanCoverage,
  PlanFiscal,
  PlanSell,
  RebalancePlan,
  TransferNeed,
} from "./types";

const DRIFT_MED_PP = 7;
/** Cap: no vender más del 50% de una posición en un único rebalance. */
const MAX_POSITION_SELL_PCT = 0.5;
/** Mínimo EUR por movimiento: debajo se descarta (polvo). */
const MIN_MOVE_EUR = 10;
/** Redondeo de importes a múltiplos de 10 EUR para UI. */
const ROUND_STEP = 10;
/**
 * Venue default por clase cuando `needsStrategyPick=true` (clase vacía). La UI
 * puede sugerir otro al resolver el pick, pero por defecto asumimos el venue
 * más alineado con la naturaleza de la clase.
 */
const DEFAULT_VENUE_BY_CLASS: Record<AssetClass, string> = {
  cash: "trade-republic",
  crypto: "binance",
  etfs: "trade-republic",
  gold: "trade-republic",
  bonds: "trade-republic",
  stocks: "trade-republic",
};

export interface PositionDetail {
  symbol: string;
  /** Exchange slug (e.g. "binance", "trade-republic"). Distingue dual-venue BTC→binance vs BTC→trade-republic. */
  venue: string;
  class: AssetClass;
  bucket: TaxBucket | null;
  amount: number;
  valueEur: number;
  pnlEur: number;
  /** Marca forzada de bucket desde exchange category (broker = traditional). */
  bucketForced?: boolean;
}

export interface PlannerInput {
  allocation: AllocationSnapshot;
  profile: StrategyProfile;
  positions: PositionDetail[];
  realizedYtd: { crypto: number; traditional: number };
  /** Override manual del YTD traditional cuando el usuario lo completa en el perfil. */
  realizedYtdTraditionalOverrideEur?: number | null;
  /** ISO week key pasado desde el detector para staleness. */
  weekKey: string;
}

/**
 * Deriva positions con bucket forzado por category del exchange: si el asset
 * vive en una cuenta de broker (TR), el bucket fiscal es "traditional" aunque
 * el classifyAsset devuelva crypto (fallback peligroso ante símbolos nuevos).
 */
export function buildPositionDetails(
  assets: Asset[],
  accountCategoryById: Map<number, string | undefined>,
  exchangeIdByAccountId: Map<number, number | undefined>,
  exchangeCategoryById: Map<number, string | undefined>,
  exchangeSlugById: Map<number, string>,
  eurPerUsd: number,
): PositionDetail[] {
  // Agrupamos por (symbol, venue) — NO por symbol solo. BTC en binance y BTC en
  // trade-republic son posiciones separadas con cost-basis propio y venue de
  // ejecución distinto.
  const byKey = new Map<
    string,
    {
      symbol: string;
      venue: string;
      amount: number;
      valueUsd: number;
      costUsd: number;
      cls: AssetClass;
      bucket: TaxBucket | null;
      bucketForced: boolean;
    }
  >();

  for (const a of assets) {
    if (!a.amount || a.amount <= 0) continue;
    if (!a.currentPrice) continue;

    const exchangeId = exchangeIdByAccountId.get(a.accountId);
    const exchangeCat = exchangeId ? exchangeCategoryById.get(exchangeId) : undefined;
    const venue = exchangeId ? exchangeSlugById.get(exchangeId) : undefined;

    // Bank accounts = cash para allocation. No se vende, no forma parte de positions vendibles.
    if (exchangeCat === "bank") continue;
    if (!venue) continue; // sin venue conocido no podemos ejecutar — descartar.

    const classified = classifyAsset(a.symbol);
    let cls: AssetClass = classified;
    let bucket: TaxBucket | null;
    let bucketForced = false;

    if (cls === "cash") {
      bucket = null;
    } else if (exchangeCat === "broker") {
      bucket = "traditional";
      if (cls === "crypto") {
        cls = "stocks";
        bucketForced = true;
      }
    } else if (cls === "crypto") {
      bucket = "crypto";
    } else {
      bucket = "traditional";
    }

    const key = `${a.symbol}@${venue}`;
    const entry = byKey.get(key) ?? {
      symbol: a.symbol,
      venue,
      amount: 0,
      valueUsd: 0,
      costUsd: 0,
      cls,
      bucket,
      bucketForced,
    };
    entry.amount += a.amount;
    entry.valueUsd += a.amount * (a.currentPrice || 0);
    entry.costUsd += a.amount * (a.avgBuyPrice || 0);
    byKey.set(key, entry);
  }

  const out: PositionDetail[] = [];
  for (const e of byKey.values()) {
    const valueEur = e.valueUsd * eurPerUsd;
    const costEur = e.costUsd * eurPerUsd;
    const pnlEur = valueEur - costEur;
    out.push({
      symbol: e.symbol,
      venue: e.venue,
      class: e.cls,
      bucket: e.bucket,
      amount: e.amount,
      valueEur,
      pnlEur,
      bucketForced: e.bucketForced || undefined,
    });
  }
  return out;
}

function roundToStep(v: number, step = ROUND_STEP): number {
  return Math.round(v / step) * step;
}

function driftByClass(
  allocation: AllocationSnapshot,
  profile: StrategyProfile,
): Record<AssetClass, ClassDrift> {
  const targetMap: Record<AssetClass, number> = {
    cash: Number(profile.targetCash ?? 0),
    crypto: Number(profile.targetCrypto ?? 0),
    etfs: Number(profile.targetEtfs ?? 0),
    gold: Number(profile.targetGold ?? 0),
    bonds: Number(profile.targetBonds ?? 0),
    stocks: Number(profile.targetStocks ?? 0),
  };
  const out = {} as Record<AssetClass, ClassDrift>;
  for (const cls of ASSET_CLASSES) {
    const actualPct = allocation.byClass[cls]?.pct ?? 0;
    const targetPct = targetMap[cls] ?? 0;
    out[cls] = {
      actualPct: Math.round(actualPct * 100) / 100,
      targetPct,
      driftPp: Math.round((actualPct - targetPct) * 100) / 100,
    };
  }
  return out;
}

/**
 * Algoritmo:
 *  1. Gap EUR por clase = (actual% - target%)/100 * netWorth.
 *  2. Cash sobreexpuesto → capital disponible sin IRPF ("deploy").
 *     Cash infraexpuesto → reserva a reponer ANTES de repartir a otras clases.
 *  3. Capital disponible = sum(gap_over no-cash) + cash_deploy.
 *     Capital necesario  = sum(|gap_under| no-cash).
 *  4. Drenar cash_deficit (si cash infraexpuesto) del capital antes de repartir.
 *  5. Dentro de cada clase sobreexpuesta: seleccionar sells ordenados por pnlEur ASC
 *     (pérdidas/BEP primero → minimiza IRPF, hace tax-loss harvest). Cap por
 *     posición: 50% del value actual. Redondeo 10€, descartar <10€.
 *  6. Dentro de cada clase infraexpuesta: distribución proporcional al value
 *     actual de holdings existentes (mantén mix). Clase vacía → needsStrategyPick.
 *     Ajuste de redondeo sobre asset de mayor value.
 *  7. Fiscal: compensación intra-bucket → IRPF marginal sobre base ahorro total
 *     con YTD total como punto de partida.
 */
export function buildRebalancePlan(input: PlannerInput): RebalancePlan | null {
  const { allocation, profile, positions, realizedYtd, weekKey } = input;
  if (allocation.netWorth <= 0) return null;

  const targets = driftByClass(allocation, profile);
  const triggered: AssetClass[] = ASSET_CLASSES.filter(
    (c) => Math.abs(targets[c].driftPp) >= DRIFT_MED_PP,
  );
  if (triggered.length === 0) return null;

  // ── Paso 1-2: gap EUR por clase.
  const gapEur: Record<AssetClass, number> = {} as Record<AssetClass, number>;
  for (const c of ASSET_CLASSES) {
    gapEur[c] = (targets[c].driftPp / 100) * allocation.netWorth;
  }

  const cashDeployEurRaw = Math.max(0, gapEur.cash);
  const cashDeficitEurRaw = Math.max(0, -gapEur.cash);

  // Clases sobreexpuestas (vender) y infraexpuestas (comprar), EXCLUYENDO cash.
  const overClassesNonCash: AssetClass[] = [];
  const underClassesNonCash: AssetClass[] = [];
  for (const c of ASSET_CLASSES) {
    if (c === "cash") continue;
    if (gapEur[c] >= MIN_MOVE_EUR) overClassesNonCash.push(c);
    else if (-gapEur[c] >= MIN_MOVE_EUR) underClassesNonCash.push(c);
  }

  const totalSellEurRaw = overClassesNonCash.reduce((acc, c) => acc + gapEur[c], 0);
  const totalBuyEurRaw = underClassesNonCash.reduce((acc, c) => acc + -gapEur[c], 0);

  let capitalAvailable = totalSellEurRaw + cashDeployEurRaw;
  // Si cash está infraexpuesto, primero reponer cash desde sells antes de repartir.
  if (cashDeficitEurRaw > 0) {
    capitalAvailable = Math.max(0, capitalAvailable - cashDeficitEurRaw);
  }
  const capitalNeeded = totalBuyEurRaw;

  if (capitalAvailable <= MIN_MOVE_EUR && totalSellEurRaw <= MIN_MOVE_EUR) {
    return null;
  }

  // Escalado proporcional si no coinciden.
  const moveScale =
    capitalNeeded > 0 && capitalAvailable > 0
      ? Math.min(1, capitalAvailable / capitalNeeded)
      : capitalNeeded === 0
        ? 0
        : 1;
  const sellScale =
    capitalAvailable > capitalNeeded && totalSellEurRaw > 0
      ? Math.max(0, capitalAvailable - cashDeployEurRaw + cashDeficitEurRaw) > 0
        ? // Only sell enough to fulfil needed buys after using cash deploy.
          Math.min(
            1,
            Math.max(
              0,
              capitalNeeded + cashDeficitEurRaw - cashDeployEurRaw,
            ) / totalSellEurRaw,
          )
        : 0
      : 1;

  // ── Paso 5: sells.
  const sells: PlanSell[] = [];
  let capApplied = false;
  for (const cls of overClassesNonCash) {
    const classSellTarget = gapEur[cls] * sellScale;
    if (classSellTarget < MIN_MOVE_EUR) continue;

    const classPositions = positions
      .filter((p) => p.class === cls && p.valueEur >= MIN_MOVE_EUR && p.bucket !== null)
      .sort((a, b) => a.pnlEur - b.pnlEur); // pérdidas primero

    let remaining = classSellTarget;
    for (const pos of classPositions) {
      if (remaining < MIN_MOVE_EUR) break;
      const maxByCap = pos.valueEur * MAX_POSITION_SELL_PCT;
      const raw = Math.min(remaining, maxByCap);
      if (raw < MIN_MOVE_EUR) continue;
      const amountEur = roundToStep(raw);
      if (amountEur < MIN_MOVE_EUR) continue;
      if (amountEur < raw && raw >= maxByCap - 0.01) capApplied = true;
      const pnlShare =
        pos.valueEur > 0 ? (amountEur / pos.valueEur) * pos.pnlEur : 0;
      sells.push({
        symbol: pos.symbol,
        class: cls,
        bucket: pos.bucket!,
        venue: pos.venue,
        amountEur,
        unrealizedPnlEur: Math.round(pnlShare * 100) / 100,
      });
      remaining -= amountEur;
      if (amountEur >= maxByCap - 0.5) capApplied = true;
    }
    if (remaining >= MIN_MOVE_EUR) capApplied = true;
  }

  // ── Paso 6: buys.
  const buys: PlanBuy[] = [];
  for (const cls of underClassesNonCash) {
    const classBuyTarget = -gapEur[cls] * moveScale;
    if (classBuyTarget < MIN_MOVE_EUR) continue;

    const classPositions = positions.filter(
      (p) => p.class === cls && p.valueEur > 0,
    );

    if (classPositions.length === 0) {
      // Clase vacía — marcador, UI pedirá asset pick. Venue default por clase.
      buys.push({
        symbol: null,
        class: cls,
        venue: DEFAULT_VENUE_BY_CLASS[cls],
        amountEur: roundToStep(classBuyTarget),
        needsStrategyPick: true,
      });
      continue;
    }

    const classValue = classPositions.reduce((acc, p) => acc + p.valueEur, 0);
    const tentative = classPositions.map((p) => ({
      symbol: p.symbol,
      venue: p.venue,
      amountEur: roundToStep((p.valueEur / classValue) * classBuyTarget),
    }));
    // Ajuste del residuo en la posición de mayor value (match por symbol+venue,
    // no solo symbol: si hay SOL@binance y SOL@mexc, son filas distintas).
    const targetRounded = roundToStep(classBuyTarget);
    const sum = tentative.reduce((acc, t) => acc + t.amountEur, 0);
    const diff = targetRounded - sum;
    if (Math.abs(diff) >= ROUND_STEP && tentative.length > 0) {
      const sortedByValue = [...classPositions].sort((a, b) => b.valueEur - a.valueEur);
      const top = sortedByValue[0];
      const ix = tentative.findIndex((t) => t.symbol === top.symbol && t.venue === top.venue);
      if (ix >= 0) tentative[ix].amountEur = roundToStep(tentative[ix].amountEur + diff);
    }
    for (const t of tentative) {
      if (t.amountEur < MIN_MOVE_EUR) continue;
      buys.push({ symbol: t.symbol, class: cls, venue: t.venue, amountEur: t.amountEur });
    }
  }

  // ── Paso 7: fiscal.
  let totalGainEur = 0;
  let totalLossEur = 0;
  let gainsCrypto = 0;
  let lossesCrypto = 0;
  let gainsTraditional = 0;
  let lossesTraditional = 0;
  for (const s of sells) {
    if (s.unrealizedPnlEur >= 0) {
      totalGainEur += s.unrealizedPnlEur;
      if (s.bucket === "crypto") gainsCrypto += s.unrealizedPnlEur;
      else gainsTraditional += s.unrealizedPnlEur;
    } else {
      const absLoss = -s.unrealizedPnlEur;
      totalLossEur += absLoss;
      if (s.bucket === "crypto") lossesCrypto += absLoss;
      else lossesTraditional += absLoss;
    }
  }
  const netGainCryptoEur = Math.max(0, gainsCrypto - lossesCrypto);
  const netGainTraditionalEur = Math.max(0, gainsTraditional - lossesTraditional);

  const effectiveYtdTraditional =
    typeof input.realizedYtdTraditionalOverrideEur === "number" &&
    Number.isFinite(input.realizedYtdTraditionalOverrideEur)
      ? input.realizedYtdTraditionalOverrideEur
      : realizedYtd.traditional;
  const realizedYtdEur = realizedYtd.crypto + effectiveYtdTraditional;

  const netGainTotal = netGainCryptoEur + netGainTraditionalEur;
  const irpfEstimateEur = irpfOnGain(netGainTotal, realizedYtdEur);
  const effectiveRate = netGainTotal > 0 ? irpfEstimateEur / netGainTotal : 0;

  const notes: string[] = [];
  if (sells.some((s) => s.bucket === "traditional") &&
      (typeof input.realizedYtdTraditionalOverrideEur !== "number" ||
       !Number.isFinite(input.realizedYtdTraditionalOverrideEur))) {
    notes.push(
      "⚠️ Atención: el YTD traditional solo cubre ventas registradas en transactions (Binance). " +
      "Si has vendido ETFs/acciones en Trade Republic este año, rellena realizedYtdTraditionalOverrideEur " +
      "en el perfil de estrategia para un IRPF preciso.",
    );
  }
  if (sells.length > 0) {
    notes.push(
      "El cálculo de plusvalía usa EUR/USD actual; AEAT aplica el EUR/USD de la fecha de compra. " +
      "En posiciones largas con FX volátil puede haber desviación >10%.",
    );
  }
  notes.push(
    "No incluye dividendos/intereses YTD ni el residuo 25% AEAT de compensación entre bucket patrimonial y rendimientos.",
  );
  if (sells.some((s) => s.bucket === "crypto") && totalLossEur > totalGainEur) {
    notes.push("Plan contiene pérdidas netas compensables — posible tax-loss harvest adicional.");
  }
  if (input.realizedYtdTraditionalOverrideEur != null) {
    notes.push(
      `YTD traditional override manual aplicado: ${input.realizedYtdTraditionalOverrideEur.toFixed(0)}€.`,
    );
  }

  const fiscal: PlanFiscal = {
    totalGainEur: Math.round(totalGainEur),
    totalLossEur: Math.round(totalLossEur),
    netGainCryptoEur: Math.round(netGainCryptoEur),
    netGainTraditionalEur: Math.round(netGainTraditionalEur),
    realizedYtdEur: Math.round(realizedYtdEur),
    irpfEstimateEur: Math.round(irpfEstimateEur),
    effectiveRate: Math.round(effectiveRate * 10000) / 10000,
    notes,
    realizedYtdOverrideEur:
      typeof input.realizedYtdTraditionalOverrideEur === "number"
        ? input.realizedYtdTraditionalOverrideEur
        : undefined,
  };

  const sellSum = sells.reduce((a, s) => a + s.amountEur, 0);
  const buySum = buys.reduce((a, b) => a + b.amountEur, 0);
  const coverage: PlanCoverage = {
    capitalAvailableEur: Math.round(sellSum + Math.min(cashDeployEurRaw, Math.max(0, buySum - sellSum))),
    capitalNeededEur: Math.round(capitalNeeded),
    coveragePct:
      capitalNeeded > 0
        ? Math.min(100, Math.round((buySum / capitalNeeded) * 100))
        : sellSum >= MIN_MOVE_EUR
          ? 100
          : 0,
    capApplied,
  };

  const cashDeployRounded = roundToStep(
    Math.max(
      0,
      Math.min(cashDeployEurRaw, buySum - sellSum),
    ),
  );

  if (sells.length === 0 && buys.length === 0 && cashDeployRounded < MIN_MOVE_EUR) {
    return null;
  }

  return {
    netWorthEur: Math.round(allocation.netWorth),
    generatedWeek: weekKey,
    targets,
    moves: {
      sells,
      buys,
      cashDeployEur: cashDeployRounded,
      executionOrder: "sells_first",
    },
    fiscal,
    coverage,
    generatedFrom: triggered,
    transfersNeeded: computeTransfersNeeded(sells, buys),
  };
}

/**
 * Detecta venues donde los buys planeados superan a los sells liberados. Cash
 * deploy queda fuera porque vive en banks (ING/TR cash) y requiere SEPA a
 * cualquier venue — es el mecanismo por defecto. La hint específica depende
 * del venue destino.
 */
function computeTransfersNeeded(
  sells: PlanSell[],
  buys: PlanBuy[],
): TransferNeed[] {
  const sellByVenue: Record<string, number> = {};
  const buyByVenue: Record<string, number> = {};
  for (const s of sells) sellByVenue[s.venue] = (sellByVenue[s.venue] ?? 0) + s.amountEur;
  for (const b of buys) buyByVenue[b.venue] = (buyByVenue[b.venue] ?? 0) + b.amountEur;

  const needs: TransferNeed[] = [];
  for (const [venue, need] of Object.entries(buyByVenue)) {
    const freed = sellByVenue[venue] ?? 0;
    const gap = need - freed;
    if (gap < MIN_MOVE_EUR) continue;
    needs.push({
      venue,
      needEur: roundToStep(gap),
      hint: transferHint(venue),
    });
  }
  needs.sort((a, b) => b.needEur - a.needEur);
  return needs;
}

function transferHint(venue: string): string {
  if (venue === "trade-republic") {
    return "Transfiere desde tu banco (ING) vía SEPA al IBAN Trade Republic.";
  }
  if (venue === "binance" || venue === "kucoin" || venue === "mexc") {
    return `Fondea ${venue} vía SEPA desde ING/TR cash, o con USDC si ya tienes stablecoins.`;
  }
  return `Deposita EUR en ${venue} antes de ejecutar los buys.`;
}
