# Currency base fix — auditoría y plan

> Estado: 2026-05-03. Auditoría arquitectónica. Sin código todavía.
> Origen: Isma reporta tres net worth distintos en pantallas distintas
> (€17.903 home, €14.386 strategy, "desplegar €7.100 cash" en Intel/828).
> El sistema dice estar "todo en USD internamente" (`docs/CURRENCY-NORMALIZATION.md`)
> pero la realidad es híbrida: parte de las APIs devuelve USD-equiv etiquetado
> como EUR, parte devuelve EUR real, y el frontend mezcla ambos con `format()`
> que sólo sabe convertir desde USD.

---

## 1. Mapa actual: dónde se guarda cada precio y qué espera cada módulo

### Esquema (`src/lib/db/schema.ts`)

| Tabla.columna | Moneda *esperada por el código* | Cómo se llena | Verdad sobre el terreno |
|---|---|---|---|
| `assets.currentPrice` | USD por unidad | `/api/prices`:51 (CoinGecko USD), :87-89 (Yahoo→USD), :99 (`EUR` cash = `eurToUsd`) | Coincide. Bien. |
| `assets.avgBuyPrice` | USD por unidad | `csv-parsers.ts`, `tryRecomputeAvgBuyPrice`, TR import (`s.priceEur * eurToUsd`) | Coincide. Bien. |
| `assets.amount` | unidades del activo | adapter / TR import / ING import | Bien. |
| `transactions.price` / `.total` | quote currency (`quote_currency` lo dice) | parsers + sync; default `USD` | Bien tras fix abril 2026. |
| `dca_executions.amount` | EUR (principal sin fees) | `dca-matcher` convierte; `/api/strategy/execute` recibe EUR del cliente | Bien. |
| `dca_executions.fee_eur` | EUR | parsers TR | Bien. |
| `bank_transactions.{credit,debit,balance}` | `bank_transactions.currency` (EUR para TR/ING) | TR/ING importers | Bien. |
| `portfolio_snapshots.total_value` | sin etiqueta — *de hecho USD-equiv* | `/api/portfolio/snapshot`:18 y `/api/sync-all`:58 hacen `sum(amount × currentPrice)` | **MAL** etiquetado. Histórico contaminado. Datos reales hoy: ~19000 (es USD-equiv del net worth real ~17900€). |
| `intel_allocation_snapshots.net_worth_eur` | nombre dice EUR | `recordAllocationSnapshot` (`src/lib/intel/allocation/snapshot.ts:56`) usa `computeAllocation().netWorth` que es USD-equiv | **MAL** etiquetado. Datos reales en SQLite: 17903.04 todos los días (probable que el tick no esté actualizando). |
| `intel_rebalance_orders.amount_eur` | EUR | `planner.buildRebalancePlan` produce amounts EUR (positions ya convertidos) PERO los gaps por clase usan `allocation.netWorth` (USD-equiv) | **AMBIGUO**. Las orders fiables sólo cuando el planner cae en "deploy cash"; los amounts derivados de `gapEur` están escalados ~9% mal. |
| `strategy_profiles.monthly_fixed_expenses` | EUR | `/api/strategy` PUT | Bien. |
| `strategy_goals.target_value` | `target_unit` (mayoría EUR) | UI | Bien. |

### Modelo declarado (`docs/CURRENCY-NORMALIZATION.md`)

> "Every monetary value in FinTrack is **stored in USD** and converted to the user's selected currency at display time."

Esa premisa **sólo aplica de forma consistente a `assets.{currentPrice, avgBuyPrice}`** y a las series fetched on-the-fly (correlation, opportunity). Todo lo agregado o derivado se ha ido desviando: a veces se queda en USD-equiv, a veces se pasa a EUR, según quien escriba el código. Hay módulos correctos y módulos rotos conviviendo.

### Módulos que aplican `eurPerUsd` (ESPERAN USD-base, devuelven EUR — correctos en su tarea pero rompen el contrato si el caller pasa EUR)

- `src/lib/intel/allocation/compute.ts:34` — `value = asset.amount * (asset.currentPrice || 0)` → USD-equiv. Sí, este es el origen.
- `src/lib/intel/research/correlation-holdings.ts:43` → `valueEur = amount × currentPrice × eurPerUsd` ✓
- `src/lib/intel/detectors/concentration-risk.ts:44` → idem ✓
- `src/lib/intel/detectors/correlation-risk.ts:72` → idem ✓
- `src/lib/intel/detectors/rebalance-drift.ts:140-165` → llama a `buildPositionDetails` con `eurPerUsd` ✓
- `src/lib/intel/rebalance/planner.ts:141-143` → `valueEur = e.valueUsd * eurPerUsd` ✓
- `src/lib/intel/tax/positions.ts:60-61, 92` → ✓
- `src/lib/strategy/context.ts:91-92` → `cashUsd × eurPerUsd → currentEur` ✓
- `src/lib/exchanges/index.ts:86-110` → `toEurAmount(trade.cost, quoteCurrency, eurPerUsd)` ✓
- `src/app/api/strategy/health/route.ts:75, 83, 102, 142-148, 177-180` → multiplica por `eurRate` antes de mostrar ✓
- `src/app/api/strategy/market/route.ts:54` → `dashboard.netWorth × eurRate` ✓
- `src/app/api/strategy/execute/route.ts:63` → `priceEur = currentPrice × eurRate` ✓
- `src/lib/dca-matcher.ts` → ✓ (post-fix abril 2026)
- `src/lib/intel/rebalance/order-matcher.ts:29-39` (`toEurAmount`) → ✓

### Módulos que NO aplican `eurPerUsd` (devuelven USD-equiv pero el caller lo trata como EUR)

| Archivo:línea | Qué hace | Quién lo consume |
|---|---|---|
| `src/lib/dashboard/summary.ts:35` | `value = asset.amount * (asset.currentPrice || 0)` | Home `/`, `/strategy/health` (vía import), `/api/dashboard/summary`, hook `useDashboardSummary` |
| `src/app/api/assets/route.ts:24` | mismo cálculo | `/assets` page, `/` (dashboard "Top Holdings"), pie chart |
| `src/app/api/assets/[symbol]/route.ts:35` | mismo cálculo | `/assets/[symbol]` page (campos `totalValue`, exchange breakdown `value`) |
| `src/app/api/net-worth/route.ts:31` | mismo cálculo | `/net-worth` page |
| `src/app/api/net-worth/route.ts:88` | `balanceUsd = ba.balance × eurUsdRate` (banco EUR → USD) | `/net-worth` page (`fmt(ba.balanceUsd)`) — sí, esto está pensado para que `format()` lo convierta de vuelta. |
| `src/app/api/portfolio/snapshot/route.ts:18` | `sum(amount × currentPrice)` → `portfolio_snapshots.total_value` | Home sparkline + delta 7D/30D, intel digest weekly |
| `src/app/api/sync-all/route.ts:58` | mismo cálculo, escribe snapshot | igual que arriba |
| `src/lib/intel/allocation/compute.ts:34` | `value = amount × currentPrice` | TODOS los detectores que arrancan de `computeAllocation()` (rebalance-drift, opportunity, digest-weekly, planner) — pero todos los downstream que producen EUR-named outputs deberían convertir y NO lo hacen para `netWorth` (sí para positions). |
| `src/lib/intel/allocation/snapshot.ts:56` | `netWorthEur: alloc.netWorth × 100/100` | `intel_allocation_snapshots.net_worth_eur` (mal etiquetado) |
| `src/lib/intel/digest-weekly.ts:127` | `netWorthEur = alloc.netWorth` | weekly digest payload + telegram (`eurFmt(ctx.netWorthEur)` línea 276-277) |
| `src/lib/intel/rebalance/planner.ts:217` | `gapEur[c] = (driftPp / 100) × allocation.netWorth` (USD-equiv) | Todos los buys/sells del plan + `cashDeployEur` ← **es la causa raíz del "desplegar 7.100€" desalineado** |
| `src/lib/intel/rebalance/planner.ts:450` | `netWorthEur: Math.round(allocation.netWorth)` | Card de detalle del plan en `/intel/[id]` ("Net 19.500€" cuando el net real es 17.900€) |
| `src/app/api/import/ing/route.ts:132` | `currentPrice: 1` para EUR cash | Inconsistente con `/api/prices`:99 que escribe `eurToUsd`. Si el usuario importa ING y NO refresca prices, el EUR cash queda con `currentPrice=1` → `value = amount × 1 = amount` (numéricamente igual a EUR), pero downstream (concentration, planner, tax) multiplica por `eurPerUsd ≈ 0.92` tratándolo como USD → resultado ~92% del real. |

### Frontend: cómo se pinta cada número

- `src/components/currency-provider.tsx:70` — `format(usd) = (usd × rate)` con rate desde `/api/currency` (USD-base, `rates.EUR ≈ 0.918`). Funciona BIEN para inputs en USD-equiv.
- `format()` se usa en:
  - `src/app/page.tsx:216, 302, 318, 364-365, 480, 485, 540, 542` — recibe `summary.netWorth/portfolio/banking/portfolioAssets[].value` (USD-equiv del summary) → resultado correcto en EUR display.
  - `src/app/net-worth/page.tsx:71, 80, 90, 110, 125, 141, 156` — recibe `summary.netWorth`, `acc.totalValue`, `ba.balanceUsd` (USD-equiv) → correcto.
  - `src/app/assets/page.tsx:56, 94, 95` — recibe `a.value` y `a.price` (USD-equiv) → correcto.
  - `src/app/assets/[symbol]/page.tsx:91, 93, 148, 153, 162, 219` — `data.totalValue`, `data.currentPrice`, `ex.value` (USD-equiv) → correcto.
- `src/components/strategy/market-strip.tsx:33` — `€${netWorth.toLocaleString}` literal, sin `format()`. El `netWorth` que recibe ya viene en EUR desde `/api/strategy/market` (línea 54 multiplica por eurRate). Resultado: BIEN.
- `src/components/strategy/allocation-ring.tsx:108, 116, 125, 184, 197` — `€${Math.round(convert(value)).toLocaleString}` con `convert()` que aplica `× rate`. Recibe `currentValue` desde `/api/strategy/health`:67 que es USD-equiv (`classTotals[cls]`). Resultado correcto si display = EUR.
- `src/components/strategy/emergency-card.tsx` y `emergency-pause-banner.tsx` — reciben `emergency.target/current/surplus` desde `/api/strategy/health`:177-180 ya convertido a EUR. Pintan literal `€`. BIEN.
- `src/components/intel/rebalance-plan-card.tsx:39, 119, 127, 178` — pinta `plan.netWorthEur`, `plan.moves.sells[].amountEur`, etc., literal `€`. **El plan los etiqueta como EUR pero internamente los gaps están escalados sobre USD-equiv** → ahí aparece "19.500€" en lugar del net worth real 17.900€.

### Resumen del mapa

Hay **dos universos** conviviendo:

- **Universo A (USD-base)**: `assets.currentPrice`, `assets.avgBuyPrice`, `transactions.price/total` en quote currency (incluye stablecoins USD). El frontend con `format()` lo convierte a EUR correctamente. Ese es el flujo "/home y /net-worth ven 17.903€".
- **Universo B (EUR-real intentado pero a medias)**: detectores intel que multiplican por `eurPerUsd` y producen EUR genuinos para positions, pero arrastran un `netWorth` en USD-equiv que ya está mal mezclado en el planner. La UI de strategy y de Intel pinta el `€` literal, así que NO hay re-conversión por display rate → el usuario ve diferencias.

El "tres números distintos" del usuario es la coexistencia de:

1. **17.903€** = net worth USD-equiv (~19500) × rate display (~0.918) en `format()` (universo A bien aplicado).
2. **14.386€** = net worth USD-equiv × rate del servidor en `/api/strategy/market` (~0.738 ese momento) — más bajo si hay desfase entre `rates.EUR` cliente y `getEurPerUsd()` servidor, o si el endpoint usa un rate distinto / timestamp viejo.
3. **"7.100 cash"** del rebalance plan = `cashDeployEur` calculado sobre `allocation.netWorth` (USD-equiv ~19500) y `targets[cash].driftPp` aplicado, sin convertir → el "EUR" del campo es nominal, en realidad es USD-equiv.

---

## 2. Inventario completo de fugas (file:line)

Ordenado por prioridad de impacto.

### CRÍTICO — devuelven valor numérico USD-equiv etiquetado/pintado como EUR

1. `src/lib/dashboard/summary.ts:35,46` — `value`/`existing.value`/`existing.price` en USD-equiv. Tipo `DashboardPortfolioAsset.value: number` sin etiqueta. **Consumers**: home page (top holdings, pie, total banking/portfolio), `useDashboardSummary` SWR hook, `getStrategyContext` line 78 (`dashboard.portfolio`, `dashboard.netWorth`, `dashboard.portfolioAssets`).
2. `src/app/api/assets/route.ts:24,32,39` — `value`/`price` en USD-equiv en respuesta JSON. Frontend `/assets` aplica `format()` → display correcto. Pero cualquier consumer que asuma EUR (no hay hoy) se rompería.
3. `src/app/api/assets/[symbol]/route.ts:35,38,49,53` — mismo problema.
4. `src/app/api/net-worth/route.ts:31,54,56,88` — `value`/`totalValue`/`balanceUsd` en USD-equiv.
5. `src/app/api/portfolio/snapshot/route.ts:18,28-33` — escribe `portfolio_snapshots.total_value` en USD-equiv. **Datos históricos contaminados** (ver §6).
6. `src/app/api/sync-all/route.ts:58-69` — idem.
7. `src/lib/intel/allocation/compute.ts:34` — `byClass[cls].value` y `netWorth` en USD-equiv. Único cliente "limpio" (todos sus consumers conocen el contrato implícito), pero ese contrato no está documentado y los consumers downstream lo confunden.
8. `src/lib/intel/allocation/snapshot.ts:56` — `intel_allocation_snapshots.net_worth_eur` etiquetado EUR pero contiene USD-equiv. **Datos históricos contaminados.**
9. `src/lib/intel/digest-weekly.ts:127,237,276-277` — `netWorthEur` en payload + Telegram dice "Net worth: X€" con valor USD-equiv.
10. `src/lib/intel/rebalance/planner.ts:217-238,440-450` — `gapEur`, `cashDeployEur`, `capitalAvailable`, `netWorthEur` derivados de `allocation.netWorth` (USD-equiv). Todos los amounts del plan están escalados ~9% por encima del valor EUR real. **Es la fuga que el usuario nota como "7.100€ cash" cuando el real serían ~6.520€.**

### MEDIO — inconsistencias entre fuentes

11. `src/app/api/import/ing/route.ts:132` — `currentPrice: 1` para EUR cash recién creado. Resto del sistema espera `eurToUsd` (`/api/prices`:99 lo arregla en el siguiente refresh). Bug de "primer arranque" tras conectar ING.
12. `src/components/currency-provider.tsx` y `/api/currency` cachean rates 1h. `src/lib/currency-rates.ts` también cachea 1h. **Dos caches descoordinadas** → desfases de hasta 1h entre rate cliente y rate servidor cuando uno expira antes del otro. Eso, combinado con que `/api/strategy/market` retorna ya-en-EUR y home retorna USD-equiv, explica la divergencia 17.903 vs 14.386 si los rates están desincronizados.
13. `src/app/api/prices/route.ts:62-71` — fallback EUR/USD = 0.85 si la API falla. `currency-rates.ts:8` también 0.85. `currency-provider.tsx` usa lo que devuelva `/api/currency`. Triple punto de fallback no testeado.

### BAJO — UI con riesgo cosmético

14. `src/components/strategy/market-strip.tsx:33` — pinta `€${netWorth}` literal sin `format()`. Si Isma cambia display a USD, sigue mostrando `€`. No es el bug actual pero es inconsistente.
15. `src/components/strategy/allocation-ring.tsx:108,116,125,184,197` — idem, `€` literal con `convert()` aplicado. Si display=USD, la cifra está convertida pero el símbolo dice `€` → confuso.
16. `src/components/intel/rebalance-plan-card.tsx:15` — `eur(v) = ${Math.round(v).toLocaleString("es-ES")}€` — etiqueta hardcoded.

### Tests faltantes

- **No hay tests** para `src/lib/dashboard/summary.ts`.
- **No hay tests** para `src/app/api/assets/route.ts`, `assets/[symbol]/route.ts`, `net-worth/route.ts`, `portfolio/snapshot/route.ts`, `sync-all/route.ts`.
- `src/lib/intel/rebalance/planner.test.ts` (308 tests passing) **asume que `allocation.netWorth` está en EUR**. Los fixtures usan `netWorth: 50000`, `valueEur: 25000` etc. y el código actual produce los amounts esperados porque dentro del planner las unidades se cancelan algebraicamente cuando todo es la misma moneda. **Esto es una falsa seguridad**: el test no detectaría el bug en producción donde `allocation.netWorth` es USD-equiv y `positions[].valueEur` es EUR genuino.

---

## 3. Decisión de arquitectura — opciones a comparar

### Opción A — Mantener USD-base, convertir SOLO en boundaries

**Idea**: dejar `assets.currentPrice` en USD (es lo que viene de las APIs externas), pero **toda función pública que devuelva monetary** convierte a EUR antes de salir. Internamente el sistema sigue siendo USD-base, pero ningún consumer ve USD-equiv. El frontend deja de usar `format(usd)` y pasa a tratar todos los inputs como EUR (el toggle USD/EUR del header se queda como cosmética: `format(eur, displayCurrency)` que internamente convertiría EUR→USD si pidieran USD).

**Cambios concretos por archivo**:

| Archivo | Cambio |
|---|---|
| `src/lib/dashboard/summary.ts` | recibir `eurPerUsd` (param o fetch dentro), multiplicar al final. Devolver `DashboardSummary` con todos los números en EUR. Renombrar campos a `netWorthEur`/`portfolioEur`/etc. |
| `src/app/api/assets/route.ts` | idem — fetch rate, multiplicar. Renombrar response keys. |
| `src/app/api/assets/[symbol]/route.ts` | idem. |
| `src/app/api/net-worth/route.ts` | idem. Borrar el campo `balanceUsd` (ya está en EUR de raíz). |
| `src/app/api/portfolio/snapshot/route.ts` | escribir `total_value` en EUR. Migrar histórico. Renombrar columna a `total_value_eur`. |
| `src/app/api/sync-all/route.ts` | idem. |
| `src/lib/intel/allocation/compute.ts` | recibir `eurPerUsd`, devolver `byClass[].value` y `netWorth` en EUR. Renombrar a `netWorthEur` para que el contrato esté en el tipo. |
| `src/lib/intel/allocation/snapshot.ts` | `netWorthEur` ahora ES EUR. Migrar histórico. |
| `src/lib/intel/digest-weekly.ts:127` | leer `netWorthEur` ya correcto. Sin cambios si compute.ts ya devuelve EUR. |
| `src/lib/intel/rebalance/planner.ts:217` | `gapEur` ahora consistente con positions. Sin escalado. |
| `src/lib/intel/rebalance/planner.ts:73 (buildPositionDetails)` | el caller ya no necesita pasar `eurPerUsd`: lo pasamos a `compute.ts` y todo aguas arriba ya viene en EUR. Refactor para drop param. |
| `src/lib/intel/detectors/{rebalance-drift, concentration-risk, correlation-risk}.ts` | dejan de hacer `× eurPerUsd` manualmente — `computeAllocation()` ya devuelve EUR. |
| `src/lib/intel/research/correlation-holdings.ts:43` | idem. |
| `src/lib/intel/tax/positions.ts` | idem (lee `assets.currentPrice` USD directamente — sigue necesitando `eurPerUsd` aquí por bypass de `computeAllocation`). |
| `src/lib/strategy/context.ts:91-92` | `cashUsd` ya no existe; `dashboard.portfolioAssets[].value` viene en EUR. Drop conversión. |
| `src/app/api/strategy/health/route.ts:75,83,102,142-148,177-180` | drop `× eurRate` (ya viene en EUR). |
| `src/app/api/strategy/market/route.ts:54` | drop `× eurRate`. |
| `src/app/api/strategy/execute/route.ts:63` | `priceEur = anyWithPrice.currentPrice * eurRate` — sigue necesario porque `assets.currentPrice` se mantiene USD. **Único punto donde queda la conversión interna.** |
| `src/lib/exchanges/index.ts:86-110` | sin cambios (`toEurAmount` ya hace su trabajo). |
| `src/components/currency-provider.tsx` | renombrar `format(usd) → format(eur)`. Si user pide USD display, `format(eur) = eur / rateEur × 1 = USD`. Romper API: ahora todos los callers pasan EUR. |
| `src/components/strategy/{market-strip, allocation-ring}.tsx` | usar `format()` en vez de literal `€`. |

**Riesgos**:
- Cambio de contrato en `format()` del CurrencyProvider — afecta a TODA la UI. Hay que recorrer todos los `format()` existentes y validar que el input que les llega ahora sea EUR. Riesgo de "dobles conversiones" si nos olvidamos un sitio donde el backend ya convirtió pero el frontend asume USD.
- Migración de `portfolio_snapshots.total_value` y `intel_allocation_snapshots.net_worth_eur` (ver §6). Si se hace mal, el sparkline 30D y los digests muestran salto irreal.
- Tests del planner — los fixtures siguen siendo válidos (los números ya están en lo que ahora es EUR consistente). Pero hay que añadir un test E2E que pruebe que `computeAllocation` sobre un fixture USD devuelve EUR correcto.
- `getEurPerUsd()` se llama en muchos sitios — añadir más calls no es un problema (cache 1h). Pero hay que decidir: ¿pasar el rate como parámetro (más explícito, más testeable) o seguir fetcheando dentro?

**Esfuerzo**: ALTO — toca ~25 archivos, requiere migración SQL + script backfill + invalidación de caches frontend. Estimación 2-3 sesiones de trabajo si se trocea bien.

**Tests a añadir**:
- `summary.test.ts` — fixtures de assets en USD, verifica output en EUR.
- `assets/route.test.ts`, `net-worth/route.test.ts`, `portfolio-snapshot.test.ts`.
- `planner.test.ts` — mantener pero añadir test de "consistencia entre positions y netWorth": fixture donde `allocation.netWorth = sum(positions.valueEur) + cashFromBank` para asegurar misma moneda.
- Test de invariante: `eurFromAssets({…}) ≈ assets.reduce((s,a) => s + a.amount × a.currentPrice × eurPerUsd)` (smoke).
- `currency-provider.test.tsx` — `format(eur)` con display=EUR y display=USD.

---

### Opción B — Migrar a EUR-base (toda la DB en EUR)

**Idea**: convertir `assets.currentPrice` y `assets.avgBuyPrice` a EUR en el momento del fetch. EUR cash → `currentPrice = 1`. Stocks/crypto → precio nativo × eurPerUsd. Borrar todas las conversiones `× eurPerUsd` de detectores. El frontend tiene que cambiar `format(usd)` por `format(eur)`. Si el usuario pide display en USD/GBP/etc., conversión EUR → display en `format()`.

**Cambios concretos por archivo**:

| Archivo | Cambio |
|---|---|
| `src/app/api/prices/route.ts` | `cryptoSymbols`: pedir `vs_currencies=eur` directamente (CoinGecko soporta). `stockSymbols`: convertir `priceUsd → priceEur` con `1/eurToUsd`. EUR cash: `price = 1`. |
| `src/app/api/import/ing/route.ts:132` | ya está bien (`currentPrice: 1`). |
| `src/app/api/import/trade-republic/confirm/route.ts:74,88,100` | dejar precio EUR directo, no multiplicar por `eurToUsd`. |
| `src/app/api/import/trade-republic-csv/confirm/route.ts:123,136,147` | idem. |
| `src/lib/csv-parsers.ts` y derivados | `avgBuyPrice` en EUR (convertir desde quote currency en el momento del parse). |
| `src/lib/dashboard/summary.ts:35` | sin cambios — `amount × currentPrice` ya es EUR. Renombrar campos a `*Eur`. |
| `src/app/api/assets/route.ts`, `assets/[symbol]/route.ts`, `net-worth/route.ts`, `portfolio/snapshot/route.ts`, `sync-all/route.ts` | sin cambios excepto rename. |
| `src/lib/intel/allocation/compute.ts` | sin cambios; renombrar. |
| `src/lib/intel/allocation/snapshot.ts` | sin cambios. |
| `src/lib/intel/rebalance/planner.ts:73-156` (`buildPositionDetails`) | drop param `eurPerUsd`. `valueEur = amount × currentPrice` directo. |
| `src/lib/intel/detectors/{concentration-risk, correlation-risk, rebalance-drift}.ts` | drop `getEurPerUsd()` y `× eurPerUsd`. |
| `src/lib/intel/research/correlation-holdings.ts:43` | drop. |
| `src/lib/intel/tax/positions.ts` | drop. cost-basis y current-price ambos EUR. |
| `src/lib/strategy/context.ts:91-92` | drop conversión. |
| `src/app/api/strategy/health/route.ts` | drop todos los `× eurRate`. |
| `src/app/api/strategy/market/route.ts:54` | drop. |
| `src/app/api/strategy/execute/route.ts:52,63` | drop conversión USD→EUR (currentPrice ya EUR). |
| `src/lib/exchanges/index.ts:86-110` | `toEurAmount(trade.cost, quoteCurrency, eurPerUsd)` se mantiene (trade cost viene en quoteCurrency, no en EUR aún). |
| `src/lib/dca-matcher.ts` | mantener (cobra de transactions en quote currency). |
| `src/lib/intel/rebalance/order-matcher.ts` | mantener. |
| `src/components/currency-provider.tsx` | redefinir `format(eur)`, `convert(eur)`. `rates` debería ser EUR-base (`{EUR: 1, USD: 1.085, GBP: 0.86}`). Endpoint `/api/currency` cambiar a `latest/EUR`. |
| `src/components/strategy/*` | sin cambios estructurales (los `€` literales pasan a ser correctos). |

**Migración de datos**:
- `assets`: para cada row, `currentPrice = currentPrice × eurPerUsdActual` (one-shot script). Idem `avgBuyPrice`.
- `transactions`: NO se tocan (siguen en quote currency). El campo `quoteCurrency` ya cubre.
- `portfolio_snapshots`: convertir todos los rows con un `eurPerUsd` razonable (¿histórico día a día? Usar `data.rates` cacheado). Renombrar columna a `total_value_eur`.
- `intel_allocation_snapshots`: idem, ya tiene nombre EUR.

**Riesgos**:
- **Migración masiva**: tocar `assets.currentPrice` requiere coordinación con `/api/prices` que sobreescribe. Si el script corre y luego el cron de prices arranca con la lógica vieja, se sobreescribe a USD. Requiere deployment atómico (código nuevo + script + restart).
- **Histórico portfolio_snapshots**: la conversión "rate de hoy" introduce ruido en sparklines 90D/1Y porque hace 6 meses el EUR/USD era distinto. Idealmente fetch históricos de exchangerate-api (no es gratis).
- **transactions queue currency**: trades USDC siguen en USD-equivalent (stablecoin) — `dca-matcher` y `order-matcher` siguen necesitando `getEurPerUsd()`. La migración EUR-base no elimina la dependencia, sólo la mueve a la frontera.
- **format() rompe contrato**: igual que opción A, hay que recorrer toda la UI.
- Las APIs externas (CoinGecko, Yahoo, exchangerate-api) son USD-céntricas. Tener EUR-base internamente significa convertir en cada fetch — tres puntos de conversión vs uno (display).

**Esfuerzo**: ALTO — toca ~30 archivos + script de migración + el riesgo de race con cron. Estimación 3-4 sesiones.

**Tests a añadir**: similar a opción A, pero con fixtures donde currentPrice ya está en EUR.

---

## 4. Recomendación

**Opción A** ("USD-base interno, conversión en boundaries").

Razones:

1. **Encaja con la realidad de las APIs externas**. CoinGecko, Yahoo, exchangerate-api son todas USD-base. Mantener USD interno significa una sola conversión en el output (boundary), no tres en el input (cada API).
2. **Menos cambios a `assets.currentPrice` (la columna más caliente del sistema)**. No hay riesgo de race condition con el cron de `/api/prices` que sobreescribe esta columna constantemente. Sólo cambian las funciones de agregación.
3. **El histórico es menos doloroso**. `portfolio_snapshots` y `intel_allocation_snapshots` se migran multiplicando por `eurPerUsd` actual (mismo problema en B), pero NO hay que tocar `assets` ni `transactions` en backfill — y esas son las tablas con más rows.
4. **El bug de "tres números distintos" se resuelve igual de bien**. Lo que cura el síntoma es que TODAS las APIs públicas devuelvan EUR consistente; da igual si interno es USD o EUR.
5. **Ya hay infraestructura para esto**: `getEurPerUsd()`, `currency-rates.ts`, `toEurAmount()`. La opción A reusa lo que existe; la B obliga a replantear el contrato de `/api/prices`.
6. **El frontend ya hace lo correcto en `/home` y `/net-worth`** (con `format()`). Sólo hay que asegurarse de que `format()` recibe el mismo tipo en TODAS las pantallas. En opción A el contrato sigue siendo "todo USD-equiv hasta que `format()`/boundary lo pase a EUR". En B hay que cambiar el contrato del provider.

Trade-off que hay que aceptar: **`assets.currentPrice` para EUR cash sigue siendo el truco `eurToUsd ≈ 1.17`**. No es bonito conceptualmente. Mitigación: documentarlo como "el USD-base trick" y poner un assert en `/api/prices` que verifique `EUR.currentPrice ≈ eurToUsd ± 1%` para detectar drift.

Si en el futuro Isma quiere multi-currency real (mostrar todo en USD para un viaje, en EUR cotidiano), la opción A se beneficia: el frontend ya tiene la infra de `convert(usd, displayCurrency)` y sólo hace falta exponer la base USD en las APIs además del EUR derivado.

---

## 5. Plan de migración paso a paso (opción A)

> Cada fase deja el árbol verde (`pnpm test`) y la app navegable. Si una fase rompe algo no detectado, parar y volver a evaluar antes de la siguiente.

### Fase 0 — Preparación

- Añadir tipos branded en `src/lib/types/money.ts`:
  ```ts
  export type EurAmount = number & { readonly __brand: 'EUR' };
  export type UsdAmount = number & { readonly __brand: 'USD' };
  export const asEur = (n: number): EurAmount => n as EurAmount;
  export const asUsd = (n: number): UsdAmount => n as UsdAmount;
  ```
- Añadir helper `src/lib/money/convert.ts` con `usdToEur(usd: UsdAmount, rate: number): EurAmount`. Único helper de conversión. Reusa `currency-rates.ts` para el rate.
- Añadir test de invariante en `src/lib/money/convert.test.ts`: `usdToEur(asUsd(100), 0.92) === asEur(92)` y similar.
- **Verificación**: `pnpm test` → 308 tests siguen verde + 3 nuevos.

### Fase 1 — Tests de caracterización (red)

Antes de cambiar nada, escribir los tests que **deberían** pasar tras el fix:

- `src/lib/dashboard/summary.test.ts`: fixture con `EUR cash = 7466 amount × 1.17 currentPrice`, `BTC = 0.015 × 77000`, etc. Asserts: `summary.netWorth ≈ €17900` (EUR real, no 19500).
- `src/app/api/net-worth/route.test.ts`: idem.
- `src/lib/intel/rebalance/planner.test.ts`: añadir caso "fixture realista" — `allocation.netWorth: asEur(17900)`, positions consistentes en EUR. Verificar que `gapEur` es coherente con netWorth (ratio drift × netWorth).

Estos tests **fallarán** ahora con la lógica actual (devuelven USD-equiv ≈ 19500). Esa es la baseline a corregir.

- **Verificación**: `pnpm test` → 308 OK + N nuevos en rojo. Documentar los rojos esperados en el PR.

### Fase 2 — `dashboard/summary.ts` y consumers directos

- `getDashboardSummary()` recibe `eurPerUsd` como param (o lo fetch internamente — preferible param para testabilidad). Multiplica `value` por `eurPerUsd` antes de meter en el map.
- Renombrar campos: `portfolio → portfolioEur`, `banking → bankingEur`, `netWorth → netWorthEur`, `portfolioAssets[].value → valueEur`. Actualizar tipo `DashboardSummary`.
- `/api/dashboard/summary/route.ts`: pasar rate.
- `src/app/page.tsx`: `summary.netWorthEur` en lugar de `netWorth`. Quitar `format()` y pintar literal `€` (ya viene en EUR). **O bien** dejar `format()` pero que el provider sepa que el input es EUR (ver fase 5).
- `src/lib/strategy/context.ts:91-92`: drop conversión cash (ya viene en EUR desde dashboard).
- **Verificación**: `summary.test.ts` pasa. Smoke en `/`: net worth = €17.900 (no €19.500). Top holdings cifras razonables.

### Fase 3 — `/api/assets`, `/api/assets/[symbol]`, `/api/net-worth`, `portfolio/snapshot`, `sync-all`

Mismo patrón: aplicar `× eurPerUsd` en el cálculo, renombrar response keys con sufijo `Eur` cuando corresponda, actualizar UI.

- `src/app/assets/page.tsx`: pintar `format(a.valueEur)` (asumiendo provider actualizado en fase 5).
- `src/app/assets/[symbol]/page.tsx`: idem.
- `src/app/net-worth/page.tsx`: drop el campo `balanceUsd` y usar `balanceEur`.

**Snapshots**: aquí entra la migración SQL (ver fase 6).

- **Verificación**: home sparkline igual de continuo, /assets totales coherentes, /net-worth banking matches con `bank_transactions.balance` literal.

### Fase 4 — Detectores intel y planner

- `src/lib/intel/allocation/compute.ts`: recibir `eurPerUsd`, devolver EUR. Renombrar `netWorth → netWorthEur`, `byClass[].value → valueEur`.
- Todos los detectores que llamaban `× eurPerUsd` lo dejan de hacer. Sólo `tax/positions.ts` (que va directo a `assets.currentPrice`) sigue.
- `planner.ts:217`: `gapEur` ahora coherente. `cashDeployEur` real.
- **Verificación**: `planner.test.ts` (fixtures actuales) pasa sin tocar (los números ya estaban en lo que ahora es EUR consistente). Smoke en `/intel/828` o equivalente: amounts del plan suman con netWorth coherente.

### Fase 5 — Frontend boundary

Decisión a tomar (cuestión abierta — ver §7):

- **5a**: cambiar contrato del `CurrencyProvider`: `format(eur, displayCurrency)`. Recorrer TODOS los callers (~50 sitios) y verificar que pasan EUR. Riesgo: dejar uno sin cambiar y mostrar valor 8% mal.
- **5b**: dejar `format(usd)` y al final del backend convertir EUR→USD para que home siga funcionando. Conceptualmente sucio.

Recomendado **5a**. Add lint rule (eslint custom plugin o regex en CI) que detecte `format(...usd...)` en variables nombradas con sufijo `Usd`, advirtiendo.

- **Verificación**: toggle USD/EUR en home muestra la cifra convertida correctamente en ambos modos. /strategy = /home en net worth.

### Fase 6 — Migración de datos históricos

- Script `scripts/backfill-snapshots-eur.mjs`:
  - `portfolio_snapshots`: `UPDATE portfolio_snapshots SET total_value = total_value * ? WHERE total_value > 100` con `?` = rate al momento del backfill (single-shot).
  - `intel_allocation_snapshots.net_worth_eur`: idem.
- Renombrar columna a `total_value_eur` en una migración drizzle posterior (o dejar nombre y sólo documentar).
- **Limitación conocida**: usamos rate actual para todos los snapshots históricos → introduce ruido del orden del 5% en deltas largos. Aceptable porque las series son de meses, no años. Si Isma quiere fidelidad, paid plan de exchangerate-api con históricos.

- **Verificación**: home sparkline 30D no tiene salto en la fecha del backfill (porque escribimos sobre TODAS las rows). Delta 7D razonable (~0-2%).

### Fase 7 — Eliminar pintado literal `€` en componentes

- `market-strip.tsx`, `allocation-ring.tsx`, `rebalance-plan-card.tsx`: usar `format()`. Cuando user cambia display USD, los símbolos siguen al valor.

### Fase 8 — Documentar y blindar

- Actualizar `docs/CURRENCY-NORMALIZATION.md` con la nueva regla: "todas las APIs públicas devuelven EUR; sólo `assets.currentPrice` y `assets.avgBuyPrice` son USD interno".
- Añadir test de invariante en CI: smoke contra cada endpoint que valide `summary.netWorthEur ≈ summary.portfolioEur + summary.bankingEur` (sanity dentro de la respuesta).

### Verificación cross-fase

Tras cada fase:
- `pnpm test` verde.
- `pnpm build` verde (tsc).
- Smoke manual: `curl localhost:3000/api/dashboard/summary | jq .` y comparar con `curl localhost:3000/api/strategy/market | jq .finances.netWorth` — DEBEN ser el mismo número (en EUR).

---

## 6. Cómo prevenir que vuelva a pasar

1. **Tipos branded `EurAmount` / `UsdAmount`** (fase 0). Al pasar un `UsdAmount` a una función que espera `EurAmount` el TypeScript lo rechaza. Coste: hay que cast explícito en boundaries (`asEur(x)`), pero es exactamente donde queremos atención manual.

2. **Naming convention obligatoria**: cualquier campo monetario en respuesta JSON o tabla DB **DEBE** terminar en `Eur` o `Usd`. Code review rechaza `value`, `amount`, `total` desnudos. Eslint rule custom (`*-money-suffix.ts`) que falla en `interface X { value: number }` para campos detectados como monetarios (heurística por nombre o tipo).

3. **Helper único de conversión** (`src/lib/money/convert.ts`). Prohibir `× eurPerUsd` o `× rate` raw fuera de ese módulo. Eslint rule: detectar literales `* eurPerUsd` y `* eurRate` fuera del módulo y advertir.

4. **Test de invariante post-cada-PR**: smoke test que arranca el servidor en CI, llama `/api/dashboard/summary` y `/api/strategy/market`, y verifica que `netWorthEur` coincide ±1€. Si rompe, falla el merge.

5. **No-cli helper en planner.ts y compute.ts**: ambos reciben `eurPerUsd` como param obligatorio (no fetch interno). Esto fuerza al caller a pensar dónde viene el rate y a un único punto de fetch (`route.ts` o `tick`) por request.

6. **Documentar el "USD-base trick" para EUR cash** (`assets.currentPrice = eurToUsd`). Añadir a `CURRENCY-NORMALIZATION.md` y un comment en `/api/prices/route.ts:97-100` explicando que es deliberado para que `amount × currentPrice × eurPerUsd ≈ amount`. Sin ese comment, el siguiente refactor lo "limpia" y rompe todo otra vez.

7. **Quitar el "fallback 0.85" hardcoded** en `/api/currency` y `currency-rates.ts`. Si no hay rate, devolver error y que el caller decida. Hoy un fallo silencioso de exchangerate-api da net worth 8% mal sin warning.

---

## 7. Cuestiones abiertas — necesitan decisión de Isma

1. **Migración del histórico `portfolio_snapshots.total_value`**: ¿usamos rate de hoy para todos los snapshots (rápido, ruidoso en deltas largos), rate del día (lento, requiere histórico de exchangerate-api de pago, fiel), o aceptamos un "salto" en la fecha del backfill (no migrar, escribir EUR de aquí en adelante, dejar el pasado en USD-equiv)? Recomendado: rate de hoy + nota visible en UI "datos históricos < 2026-05-XX en USD-equiv".

2. **Renombrado de columnas**: `portfolio_snapshots.total_value → total_value_eur`. Implica migración drizzle + actualización de hooks. ¿Se hace o dejamos el nombre y sólo documentamos? Recomendado: renombrar para que el schema sea autoexplicativo.

3. **Contrato de `format()` del CurrencyProvider**: cambiar de `format(usd)` a `format(eur)`. Toca ~50 sitios. ¿Lo hacemos en una sola PR (atómico, riesgo) o introducimos `formatEur(eur)` paralelo y vamos migrando call site a call site (más PRs, riesgo de regresión durante el periodo de coexistencia)? Recomendado: PR atómica con rama dedicada y testing exhaustivo.

4. **`currentPrice = 1` para EUR cash en ING import (línea 132)**: ¿Lo arreglamos en este plan o lo tratamos como bug aparte? Es realmente un bug existente que se manifiesta en el primer refresh tras conectar ING. Recomendado: arreglarlo en fase 3 cambiando a `eurToUsd` para que sea consistente con `/api/prices`.

5. **`getEurPerUsd()` como param vs fetch interno**: ¿dejamos que cada función fetchee (cómodo, con cache 1h) o forzamos param (testable, explícito)? Recomendado: param en funciones puras (planner, compute, summary), fetch en route handlers.

6. **Tests E2E reales contra SQLite**: ¿añadimos un fixture de DB con datos conocidos para los tests de summary/route/planner? Hoy los tests de `intel/*` son unitarios sin DB. Implica setup de test DB (mejor sintaxis con `better-sqlite3` in-memory). Recomendado: sí, al menos un E2E por endpoint público crítico.

7. **¿Tocar `transactions.price/total` también?** Hoy están en quote currency con `quoteCurrency` que lo dice (modelo correcto post-fix abril 2026). NO recomiendo tocarlo. Confirmar con Isma que está OK seguir así.

8. **Cooldown del cron de prices**: si la migración A se despliega y el cron `sync-all` corre durante el deploy, podría haber un instante de estado inconsistente (snapshots viejos en USD, nuevos en EUR mezclados). ¿Pausamos el cron durante la migración? Recomendado: sí, parar `claude-finanzas`, parar `fintrack-dev`, ejecutar backfill, redeploy, restart.

---

## TL;DR

- El sistema dice ser USD-base pero **9 de los 13 sitios que producen monetary agregado lo etiquetan como EUR sin convertir**. Por eso 17.903 ≠ 14.386 ≠ 7.100.
- La causa es que `computeAllocation()` y `getDashboardSummary()` devuelven USD-equiv pero los downstream lo asumen EUR cuando van a UI/DB/digest.
- Recomendación: **opción A** (USD-base interno, EUR en boundaries). Toca ~25 archivos, requiere migración SQL para `portfolio_snapshots` y `intel_allocation_snapshots`, pero no toca `assets` ni `transactions`.
- Plan en 8 fases, cada una con verificación. Empezar con tests rojos (caracterización), terminar con eslint rules para que no vuelva a pasar.
- 8 cuestiones abiertas que necesitan decisión antes de empezar fase 2.
