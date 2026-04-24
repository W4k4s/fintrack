# Strategy data/UI consolidation — plan ajustado

Propuesto 2026-04-24 tras review del staff-reviewer (veredicto: PEDIR CAMBIOS al plan original). Este doc es la versión corregida.

## Problemas que resuelve

1. **Lógica derivada esparcida**. `autoPending`, `monthRemaining`, `displayAmount`, `done`, `gated` se calculan en `src/components/strategy/weekly-shopping-list.tsx` (cliente). Home (`src/app/page.tsx`), `/strategy` y `/strategy/guide` no tienen la misma derivación, así que cuando una vista nueva la necesita, la reimplementa distinta.
2. **Cascada de fetches sin cache cliente**. `/strategy` dispara 4 fetches paralelos al montar (`strategy + health + schedule + market`). `/guide` otros 4. Home 2. Tras `PUT /api/plans` el handler hace `fetchAll()` manual; las otras pestañas quedan stale hasta navegar.
3. **Fetch HTTP interno servidor→servidor**. `/api/strategy/schedule`, `/market`, `/health` hacen `fetch("http://localhost:3000/api/dashboard/summary")`. Además cada uno recalcula `cryptoAllocationPct` por su cuenta (drift latente).

## Orden y alcance (corregido por review)

### F4 — Funciones puras compartidas (0.5h)

- Extraer `src/lib/dashboard/summary.ts` con `getDashboardSummary()` invocable in-proc.
- Crear `src/lib/strategy/context.ts` con `getMultiplierContext()` que calcule fg + allocation + policies una sola vez y lo reutilicen `/schedule`, `/market`, `/health`.
- `/api/dashboard/summary/route.ts` pasa a ser una envoltura fina que llama la función pura.
- Resultado: fuera `fetch("http://localhost:3000/...")`. Fuera drift de `cryptoAllocationPct`.

### F1 — Consolidar lógica derivada en servidor (3-4h)

- Mover `autoPending`, `monthRemaining`, `displayAmount`, `done`, `pauseReason`, `actionLabel` al payload de `/api/strategy/schedule`. Cliente solo renderiza campos ya resueltos.
- **F1.5 — Tipos compartidos**: `src/lib/strategy/types.ts` con `ScheduleItem`, `PlanStatus` consumidos por los 4 call sites (home, /strategy, /guide, /plans). Evita que el problema 1 vuelva.
- **Tests vitest** en `src/lib/strategy/schedule.test.ts` cubriendo las derivaciones (`autoPending`, `displayAmount`, `done`, gates). Sin esto no hay red para borrar el código cliente viejo.
- **Matar legacy `fgMultiplier`** (`/api/strategy/schedule/route.ts:188-194`, IIFE marcado "por la UI antigua") + consumidores residuales. Oportunidad en la misma pasada.

### F3 — Invalidación tras cambios (1h)

- En handlers `PUT/POST /api/plans` y `PUT /api/strategy`: `revalidateTag("strategy")` de Next.
- Endpoints `/strategy/*` marcan sus respuestas con ese tag.
- Cliente con SWR hace `mutate()` automático (ver F2). Todas las vistas se refrescan sin navegar.

### F2 — Hook useStrategy() con SWR (1-2h, reducido)

- `src/lib/hooks/use-strategy.ts` wrapping los 4 fetches con SWR. Dedupe + revalidation automática. Handlers devuelven `mutate` para disparar refetch.
- **No crear endpoint `/api/strategy/full` agregado**. El review lo consideró sobreingeniería prematura: los fetches son paralelos en LAN local (<50ms), el cuello de botella real es el trabajo server-side duplicado — eso ya lo resuelve F4. Decidir tras medir si hace falta.
- **No cachear 30s server-side la composición**. Dashboard financiero: tras `POST /api/strategy/execute` se espera ver el cambio YA. El `revalidate:600` de F&G en `/market` está bien (fuente externa lenta), pero la composición DB no.

## Total estimado: 7-10h

Estimación original del plan fue 5-7h. Review la subió porque F1 escondía tests + tipos + legacy cleanup no contados.

## Riesgos / checks para no romper nada

- Tras F1: validar manualmente que home, /strategy, /strategy/guide y /plans renderizan idéntico pre/post cambio. Tomar screenshots antes.
- Tras F4: tests de `/api/strategy/schedule` que no dependan de que `/api/dashboard/summary` esté servido por HTTP.
- Tras F3: verificar que `revalidateTag` no invalida más de lo necesario (no tirar cache de F&G por un update de plan).
- Tests 282/282 deben seguir verdes en cada fase.

## Archivos tocados (previsible)

- `src/app/api/dashboard/summary/route.ts` (F4)
- `src/app/api/strategy/schedule/route.ts` (F1, F3, F4)
- `src/app/api/strategy/market/route.ts` (F4)
- `src/app/api/strategy/health/route.ts` (F4)
- `src/app/api/plans/route.ts` (F3)
- `src/app/api/strategy/route.ts` (F3)
- `src/lib/dashboard/summary.ts` (F4, nuevo)
- `src/lib/strategy/context.ts` (F4, nuevo)
- `src/lib/strategy/types.ts` (F1.5, nuevo)
- `src/lib/strategy/schedule.ts` + `.test.ts` (F1, nuevo)
- `src/lib/hooks/use-strategy.ts` (F2, nuevo)
- `src/components/strategy/weekly-shopping-list.tsx` (F1, simplificar)
- `src/app/strategy/page.tsx` (F1, F2)
- `src/app/strategy/guide/page.tsx` (F1, F2)
- `src/app/page.tsx` (F1, F2)

## Referencias

- Review completo del staff-reviewer: sesión 2026-04-24 (tras el plan inicial).
- Memoria sesión: `project_fintrack_ui_redesign.md` (F0-F8 cerradas 2026-04-22), `project_strategy_v2.md` (Strategy V2 R1/R2/R3 cerradas 2026-04-22).

---

## F5 — TR data pipeline (nuevo bloque, iniciado 2026-04-24)

Problema destapado al migrar TR de PDF a CSV: las compras TR alimentaban `bank_transactions` pero **no** `dca_executions`, y el WeeklyShoppingList lee de `dca_executions`. Resultado: las compras TR no contaban como ejecutadas en la lista semanal/mensual.

### F5.1 — Import CSV canónico (HECHO)

- Parser `src/lib/parsers/trade-republic-csv.ts` reconstruye posiciones, cash y transacciones desde el CSV oficial TR.
- Endpoint `POST /api/import/trade-republic-csv` (preview+dry-run) y `/confirm`.
- Columna `bank_transactions.external_id` con UNIQUE parcial sobre `(source, external_id)`: dedup por UUID del CSV.
- Confirm limpia idempotentemente `bank_transactions` TR sin external_id en su rango (reemplaza PDF legacy duplicados).
- UI botón "Import CSV" en `/exchanges/<tr-id>` con panel dry-run (duplicados vs a insertar).

### F5.2 — TR → dca_executions (HECHO)

- `matchTrTradesToDCA(trades)` en `src/lib/dca-matcher.ts`: recibe trades del parser con `principalEur` separado de `feeEur`, agrupa por (plan, date), inserta dca_execution con **principal** (los targets del plan son sin fees).
- `matchTrBankTxToDCA()` (fallback para flujo PDF) resta 1€ fee/grupo (tarifa TR estándar).
- Cableado en ambos confirms (PDF y CSV).

### F5.3 — Pendientes del pipeline TR (seguir en otra sesión)

- **Rebalance orders matcher**: las pending en `intel_rebalance_orders` no se auto-marcan porque `AMOUNT_TOLERANCE=0.2` y las compras DCA mensuales son ~10-15% del plan de rebalance. Opciones: (a) acumulador de parciales hasta 80%; (b) relajar tolerancia para venue=trade-republic; (c) añadir un estado `partial-dca` distinto de `partial`. Decidir tras ver cómo queda F1 del plan.
- **Tests del parser CSV**: validar reconstrucción de posiciones, dedup por UUID, agrupación de trades fraccionales+enteros.
- **Info fee en dca_executions**: ahora se descarta. Evaluar añadir columna `fee_eur` en dca_executions para cuadrar con tax-harvest y reporte fiscal.
- **Matcher DCA unificado**: hoy hay 3 variantes (exchanges API → `matchTradesToDCA`, TR CSV → `matchTrTradesToDCA`, TR legacy PDF → `matchTrBankTxToDCA`). Cuando todo TR esté solo en CSV, jubilar el PDF fallback y unificar API-exchanges + TR con la misma forma (`TradeForDca`).

### F5.4 — Checklist de verificación tras cada sesión

Después de importar TR (CSV o PDF), confirmar que:

1. `/strategy` muestra las compras del mes en WeeklyShoppingList (mensual) con amount = principal sin fees.
2. Posiciones en `/dashboard` cuadran con el PDF "Patrimonio neto" al céntimo en cantidades.
3. Dedup idempotente: reimportar el mismo archivo no duplica nada.
4. `intel_rebalance_orders` pending (si las hay) reflejan la ejecución (cuando esté F5.3.a).
