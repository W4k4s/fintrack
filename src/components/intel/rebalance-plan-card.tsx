import type { RebalancePlan } from "@/lib/intel/rebalance/types";

const CLASS_LABEL: Record<string, string> = {
  cash: "Cash",
  crypto: "Crypto",
  etfs: "ETFs",
  gold: "Gold",
  bonds: "Bonds",
  stocks: "Stocks",
};

function eur(v: number): string {
  return `${Math.round(v).toLocaleString("es-ES")}€`;
}

export function RebalancePlanCard({
  plan,
  stale,
}: {
  plan: RebalancePlan;
  stale?: { driftNow: Record<string, number>; maxDeltaPp: number } | null;
}) {
  const sellSum = plan.moves.sells.reduce((a, s) => a + s.amountEur, 0);
  const buySum = plan.moves.buys.reduce((a, b) => a + b.amountEur, 0);
  const hasPicks = plan.moves.buys.some((b) => b.needsStrategyPick);

  return (
    <section className="border border-border rounded-xl p-4 bg-card mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">
          Plan ejecutable
        </div>
        <div className="text-xs text-muted-foreground">
          Semana {plan.generatedWeek} · Net {eur(plan.netWorthEur)}
        </div>
      </div>

      {stale && stale.maxDeltaPp >= 2 && (
        <div className="mb-3 border border-amber-500/40 bg-amber-500/10 rounded px-3 py-2 text-xs text-amber-200">
          ⚠️ Plan desactualizado: el drift ha variado hasta{" "}
          <span className="font-mono">{stale.maxDeltaPp.toFixed(1)}pp</span>{" "}
          desde que se generó. Espera al próximo tick o recomputa con un tick manual
          antes de accionar.
        </div>
      )}

      {plan.coverage.coveragePct < 100 && (
        <div className="mb-3 border border-amber-500/30 bg-amber-500/5 rounded px-3 py-2 text-xs text-amber-300">
          Cobertura parcial {plan.coverage.coveragePct}% — capital disponible ≈
          {eur(plan.coverage.capitalAvailableEur)} vs necesario{" "}
          {eur(plan.coverage.capitalNeededEur)}.
          {plan.coverage.capApplied && " Cap 50%/posición aplicado."}
        </div>
      )}

      {plan.moves.sells.length > 0 && (
        <div className="mb-4">
          <div className="text-sm font-medium mb-2">
            1. Vender {eur(sellSum)}{" "}
            <span className="text-xs text-muted-foreground font-normal">
              (ejecutar primero)
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left pb-1 font-normal">Activo</th>
                <th className="text-left pb-1 font-normal">Clase</th>
                <th className="text-right pb-1 font-normal">Importe</th>
                <th className="text-right pb-1 font-normal">P&amp;L unreal</th>
                <th className="text-right pb-1 font-normal">Bucket</th>
              </tr>
            </thead>
            <tbody>
              {plan.moves.sells.map((s, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1.5 font-mono">{s.symbol}</td>
                  <td className="py-1.5">{CLASS_LABEL[s.class] ?? s.class}</td>
                  <td className="py-1.5 text-right font-mono">{eur(s.amountEur)}</td>
                  <td
                    className={
                      "py-1.5 text-right font-mono " +
                      (s.unrealizedPnlEur >= 0 ? "text-green-400" : "text-red-400")
                    }
                  >
                    {s.unrealizedPnlEur >= 0 ? "+" : ""}
                    {s.unrealizedPnlEur.toFixed(0)}€
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground">
                    {s.bucket}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {plan.moves.cashDeployEur > 0 && (
        <div className="mb-4 text-sm">
          <span className="font-medium">2. Desplegar cash:</span>{" "}
          <span className="font-mono">{eur(plan.moves.cashDeployEur)}</span>
          <span className="text-xs text-muted-foreground ml-2">
            (sin IRPF — cash bancario)
          </span>
        </div>
      )}

      {plan.moves.buys.length > 0 && (
        <div className="mb-4">
          <div className="text-sm font-medium mb-2">
            3. Comprar {eur(buySum)}{" "}
            <span className="text-xs text-muted-foreground font-normal">
              (con cash liberado + deploy)
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left pb-1 font-normal">Activo</th>
                <th className="text-left pb-1 font-normal">Clase</th>
                <th className="text-right pb-1 font-normal">Importe</th>
              </tr>
            </thead>
            <tbody>
              {plan.moves.buys.map((b, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1.5 font-mono">
                    {b.needsStrategyPick ? (
                      <span className="text-amber-300">
                        ⚠ Elegir activo ({CLASS_LABEL[b.class] ?? b.class})
                      </span>
                    ) : (
                      b.symbol
                    )}
                  </td>
                  <td className="py-1.5">{CLASS_LABEL[b.class] ?? b.class}</td>
                  <td className="py-1.5 text-right font-mono">{eur(b.amountEur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasPicks && (
            <div className="mt-2 text-xs text-muted-foreground">
              Para clases sin holdings existentes, el plan no puede sugerir un ticker.
              Abre <span className="font-mono">/strategy</span> para añadir la posición.
            </div>
          )}
        </div>
      )}

      <div className="mt-4 border-t border-border pt-3">
        <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
          Coste fiscal estimado
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <Stat label="IRPF estimado" value={eur(plan.fiscal.irpfEstimateEur)} highlight />
          <Stat
            label="Tasa efectiva"
            value={
              plan.fiscal.effectiveRate > 0
                ? `${(plan.fiscal.effectiveRate * 100).toFixed(1)}%`
                : "—"
            }
          />
          <Stat label="Ganancia bruta" value={eur(plan.fiscal.totalGainEur)} />
          <Stat
            label="Pérdidas compensadas"
            value={eur(plan.fiscal.totalLossEur)}
          />
          <Stat
            label="Net gain crypto"
            value={eur(plan.fiscal.netGainCryptoEur)}
          />
          <Stat
            label="Net gain traditional"
            value={eur(plan.fiscal.netGainTraditionalEur)}
          />
          <Stat label="YTD base tramos" value={eur(plan.fiscal.realizedYtdEur)} />
          {plan.fiscal.realizedYtdOverrideEur != null && (
            <Stat
              label="Override YTD TR"
              value={eur(plan.fiscal.realizedYtdOverrideEur)}
            />
          )}
        </div>

        {plan.fiscal.notes.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {plan.fiscal.notes.map((n, i) => (
              <li
                key={i}
                className={
                  n.startsWith("⚠️")
                    ? "text-amber-300"
                    : "text-muted-foreground"
                }
              >
                {n}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div
        className={
          "font-mono " + (highlight ? "text-base font-semibold" : "text-sm")
        }
      >
        {value}
      </div>
    </div>
  );
}
