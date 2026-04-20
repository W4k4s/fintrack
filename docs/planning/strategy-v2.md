# Strategy V2 — "Core + Satellite 2026"

**Status**: DRAFT v2 — ajustado con staff-reviewer. Pendiente aprobación del usuario en los puntos bloqueantes (sección 7).
**Author**: Claude, session 2026-04-20 con Isma.
**Why now**: auditoría del Intel actual mostró que (a) el detector de news solo boostea scoring de holdings existentes → sistema "cuida lo que tienes" pero no descubre, (b) la exposición 25% crypto está concentrada en activos con correlación 0.85, (c) el usuario es un thesis-investor de nombre concreto (NVDA, Santander, TTWO/GTA6) sin reglas y eso le cuesta dinero (Santander vendido temprano, SOL entrado en mal momento). Revisar estrategia + añadir capacidades de descubrimiento ANTES de seguir ejecutando DCA.

**Disclaimer**: Este plan es diseño de sistema + marco de decisión. No es asesoramiento financiero regulado. Toda cifra concreta la valida el usuario.

---

## 1. Objetivos de la V2

1. **Descubrir, no solo mantener**. Permitir que el usuario añada activos que le interesan aunque no los tenga, y que el sistema los analice.
2. **Thesis investing con reglas**. Permitir bets individuales (TTWO, NVDA, SAN…) con tesis escrita, entry/target/stop y time-horizon. El sistema vigila y avisa cuando toca actuar.
3. **Romper la concentración crypto**. Separar crypto_core (BTC) de crypto_alt (ETH). No aportar a SOL/PEPE (hold legacy).
4. **Diversificar ETFs**. Añadir un factor descorrelacionado (Value o EM) para romper la duplicación MSCI World / Momentum.
5. **Educar al usuario**. Cada dossier / análisis explica en llano qué se mira y por qué.
6. **Survival first**. Position sizing, correlación guardrail, backtest antes de ejecutar cambios.

## 2. Nueva estructura de asset classes (sub-clases)

Hoy `strategy_profiles` tiene 6 targets planos: cash/etfs/crypto/gold/bonds/stocks. V2 lo sustituye por sub-clases jerárquicas:

| Parent class | Sub-class           | % objetivo (a acordar) | Notas                                              |
|--------------|---------------------|-------------------------|----------------------------------------------------|
| Cash         | cash_yield          | 20                      | Stablecoin con yield o MMF. Dry powder + rent.     |
| Equity core  | etf_core            | 28                      | MSCI World (IWDA u homólogo).                      |
| Equity factor| etf_factor          | 10                      | Momentum + 1 descorrelacionado (Value / EM / Div). |
| Bonds        | bonds_infl          | 10                      | EU Infl Bond. Posible aggregate short duration.    |
| Gold         | gold                | 7                       | Gold ETC.                                          |
| Crypto core  | crypto_core         | 10                      | BTC. Ancla monetaria.                              |
| Crypto alt   | crypto_alt          | 5                       | ETH. No PEPE / SOL como política.                  |
| Thematic     | thematic_plays      | 7                       | Stocks / ETFs concretos con tesis y exit rules.    |
| Legacy       | legacy_hold         | 3                       | SOL, PEPE, ventanas fiscales. No aportar.          |

Totales = 100. Las cifras son sugeridas, ajustables por el usuario.

## 3. Reglas duras (guardrails)

- **Max por thematic play**: 3% del portfolio base **escalado por volatilidad**. 3% para activo con vol 90d similar a MSCI World (~15%); si vol doble, 1.5%. Implementación: usar `position_sizer.py` (Fixed Fractional + ATR). Esto cumple "position sizing > timing" del CLAUDE.md.
- **Max posiciones thematic simultáneas**: 3-4.
- **Política transición crypto actual → target** (resuelve contradicción con BTC weekly):
  - Hoy crypto ≈ 25% del portfolio. Target final 15% (core 10 + alt 5).
  - Mientras crypto > 17%: pausar todo DCA crypto. Dejar que los nuevos DCA a ETFs/bonds/cash diluyan el peso.
  - Crypto 15-17%: solo DCA BTC semanal (no ETH). Band de normalización.
  - Crypto < 15%: reactivar BTC weekly + ETH mensual.
  - No se vende SOL/PEPE para "acelerar" el drift — la dilución se hace por inflow, no por ventas.
- **Correlación intra-thematic**: sizing combinado si correlación > 0.7 entre 2 theses abiertas. Ej. si NVDA (posición 3%) + AMD se abre → AMD capped a 1%, total combinado ≤ 4%.
- **Correlación pre-compra**: > 0.8 con holding pesando > 10% → bloqueo por defecto (no solo warning). Override explícito con confirmación.
- **Tesis obligatoria escrita** antes de abrir posición thematic.
- **Exit rules predefinidas** (target / stop / time horizon) antes de ejecutar la compra.
- **Stops son SOFT** por defecto (signal + recomendación, no orden automática en broker). Default consistente con "manual + tracking" del CLAUDE.md.
- **DCA ETFs**: semanal Trade Republic (0€ comisión, fractional).
- **DCA crypto**: sujeto a política transición (ver arriba).
- **Rebalance trigger**: drift > 5% del target sub-clase.
- **Tax harvest**: pérdida unrealized > -15% + > 30 días holding, dispara scope tax_harvest.
- **Fondo emergencia**: objetivo 4-5 meses de gastos (antes 3).
- **Regla F&G**: F&G ≤ 24 → multiplicador ×2 solo en BTC (cuando la política de transición permita aportar a BTC). ETH al 1×. Esto no es timing discrecional sino una regla DCA variable documentada; alineada con "DCA disciplinado" y con estudios de contrarian behavior.

## 4. Sistema a construir

### 4.1 Fase 0 — Research Drawer (valor inmediato, independiente)

**Goal**: el usuario puede añadir cualquier activo por ticker y recibir un dossier automático. Decisión "me interesa" queda guardada sin depender de Fase 2.

**Schema unificado (resuelve fusión research/watchlist/theses)**

Una sola tabla `intel_assets_tracked` con ciclo de vida, en lugar de tres con duplicación:

```sql
CREATE TABLE intel_assets_tracked (
  id INTEGER PK AUTOINCREMENT,
  ticker TEXT NOT NULL,                -- TTWO, SAN, XLE…
  name TEXT,
  asset_class TEXT,                    -- equity, etf, crypto, bond, commodity
  sub_class TEXT,                      -- etf_core, thematic_plays, crypto_core…

  -- Lifecycle state machine:
  -- researching → {shortlisted | archived | pass_verdict}
  -- shortlisted → {watching | open_position | archived}
  -- watching → {open_position | archived}
  -- open_position → {closed}
  status TEXT NOT NULL DEFAULT 'researching',

  -- Research stage
  note TEXT,                            -- nota al añadir
  dossier_json TEXT,                    -- Claude output + datos collected
  verdict TEXT,                         -- candidate | wait | pass
  technical_snapshot_json TEXT,
  fundamentals_json TEXT,
  correlation_json TEXT,
  news_preview_json TEXT,
  dossier_ttl_at TEXT,                  -- cuando expira el dossier (default +30d)
  researched_at TEXT,
  requested_at TEXT NOT NULL,

  -- Watchlist / shortlist stage (si status ≥ shortlisted)
  interest_reason TEXT,

  -- Thesis stage (si status ≥ open_position o watching con tesis definida)
  thesis TEXT,
  entry_plan TEXT,
  entry_price REAL,
  entry_date TEXT,
  target_price REAL,
  stop_price REAL,
  time_horizon_months INTEGER,
  closed_at TEXT,
  closed_reason TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Idempotencia: un solo research activo por ticker al mismo tiempo.
CREATE UNIQUE INDEX uq_tracked_researching_per_ticker
  ON intel_assets_tracked(ticker) WHERE status = 'researching';
```

Esto sustituye los tres schemas separados que había en la versión anterior (research + watchlist + theses). Ahorra joins, evita sync de duplicados, UI unificada con filtros por status.

**Endpoint**
- `POST /api/intel/research` body `{ ticker, note? }` → crea fila, spawn Claude async, responde `{ id }`.
- `GET /api/intel/research` lista con filtros.
- `GET /api/intel/research/[id]` dossier completo.
- `POST /api/intel/research/[id]/archive` | `/promote` (promocionar a watchlist o thematic).

**Claude prompt** (anti-sesgo optimista)

Distinto del de signals. Prompt estructurado para evitar el sesgo conocido de LLMs a "rellenar el candidate".

Orden de decisión forzado:
1. Evaluar checklist de **disqualifiers**: si algún guardrail de la sección 3 falla, `verdict=pass` inmediatamente, sin generar tesis sugerida.
2. Solo si pasa disqualifiers → análisis narrativo.
3. Confidence calibrado: `high` exige 3 datos concretos citados; si no, baja a `med`.
4. Incluir mini-backtest del `suggested_rules` (target/stop/time_horizon) sobre 2-3 años de precio histórico usando `evaluate_backtest.py`. Si el backtest de ese plan de exit no tiene expectancy positiva, `verdict=wait` auto.

```
{
  "disqualifiers_checked": ["corr_vs_holdings_gt_0_8", "concentration_cap", "crypto_cap"],
  "checklist_failed": ["corr_vs_holdings_gt_0_8"] | [],
  "verdict": "candidate" | "wait" | "pass",  // decisión primero
  "verdict_reason_short": "why this verdict in 1 sentence",

  "what_is_it": "...",
  "base_rate_note": "reminder: ~5% de stocks individuales beaten index long-term",
  "pros": ["..."],
  "cons": ["..."],     // obligatorio ≥2 cons aunque verdict=candidate
  "red_flags": ["..."], // lista dedicada de red flags (vs mero "cons")

  "correlation_notes": "corr 90d vs top 5 holdings: BTC 0.12, IWDA 0.68…",
  "technical_state_now": "...",
  "upcoming_catalysts": [{"event": "...", "date_estimate": "..."}],

  "mini_backtest": {
    "period_years": 2,
    "trades_simulated": N,
    "hit_rate": 0.xx,
    "expectancy_R": 0.xx,    // positive R means plan is viable
    "max_drawdown_pct": -xx
  },

  "suggested_rules": {           // solo si verdict=candidate Y mini_backtest ok
    "entry_plan": "...",
    "target": "...",
    "stop": "...",
    "time_horizon": "3-6 months",
    "position_size_pct": 2.5,    // ya escalado por volatilidad
    "vol_adjustment_reason": "vol 90d 28% vs 15% benchmark → sizing 3% × 15/28 = 1.6%"
  },

  "confidence": "low" | "med" | "high",
  "confidence_evidence": ["dato 1", "dato 2", "dato 3"]  // obligatorio si confidence=high
}
```

**Few-shot examples**: incluir en el prompt al menos 3 ejemplos con `verdict=pass` (uno por disqualifier: corr alta, small-cap ilíquida, overvaluación extrema) para anclar que "pass" es un resultado legítimo y frecuente.

**Eval pre-prod**: antes de exponer al usuario, correr el prompt sobre 10 tickers con casos conocidos:
- 3 obviamente malos (PEPE equivalent, GME con P/E 500, un stock post-split sin catalizador)
- 3 razonables (NVDA, MSCI World, BTC)
- 4 grises (SAN, TTWO, XLE, REP.MC)
Si algún obvio-malo devuelve `candidate`, iterar prompt.

**Data fetchers**
Reutilizar pipelines existentes + hardening:
- Precio/history stocks y ETFs: Yahoo Finance (endpoint `query2.finance.yahoo.com/v8/finance/chart/`).
  - **Antes de arrancar Fase 0**: test manual de los 5 tickers seed (TTWO, SAN.MC, NVDA, XLE, REP.MC). Documentar sufijos reales que devuelven 200.
  - **Fallback 1**: stooq.com (endpoint CSV libre, sin rate limit agresivo).
  - **Fallback 2**: entrada manual de precio en UI si ambas APIs fallan. Dossier marca `price_source=manual` en ese caso.
  - **Cache**: precios 15 min para no machacar la API.
- Precio/history crypto: CoinGecko free tier. Rate limit compartido (30 req/min) con price-dip / correlation-risk / digest-daily. Añadir rate-limiter global si no existe.
- News: escanear `intel_news_items` últimos 7 días buscando menciones del ticker y sinónimos.
- Correlación: calcular pairwise vs holdings actuales sobre 90 días.
- Mini-backtest: `evaluate_backtest.py` con windowing sobre 2-3 años del precio histórico para validar el plan target/stop/horizon antes de verdict=candidate.

**Timeout y estado**: research en `researching` durante > 10 min → marca `status=failed` con `failure_reason`. Usuario puede reintentar.

**Seed secuencial**: al sembrar la watchlist inicial (5 tickers), encolar secuencialmente, no en paralelo, para no saturar Yahoo + CoinGecko + Claude.

**UI**
- Drawer desde topbar: botón "+ Estudiar activo" → abre modal con form (ticker, note).
- Página lista `/intel/research` con status badges + veredicto + click-through.
- Página dossier `/intel/research/[id]` con bloques fijos. Botones "Archivar" / "Promover a thematic".
- Pestaña nueva "Research" en `/intel` para coherencia con los otros buzones.

**Validación**
- Arrancar la feature con 5 tickers seed (TTWO, SAN, NVDA, XLE, REP.MC) y verificar que los dossiers llegan completos.
- Manual smoke test del prompt (revisión de outputs).

**Estimación**: 5-6 sesiones (schema + fetchers + 4 endpoints + prompt iterado + evals + UI drawer + lista + dossier page + mini-backtest integrado).

**Riesgos**
- Yahoo Finance API es inconsistente con algunos tickers europeos (REP.MC). Fallback: CoinGecko para crypto, manual para stock exchange suffixes.
- Claude puede devolver veredictos optimistas si el prompt no prioriza riesgos. Mitigación: prompt explícito sobre "ser escéptico por defecto".
- Dossier puede ser largo y costoso. Mitigación: cache por 24h; refrescar manual.

### 4.2 Fase 1 — Schema V2 (sub-clases)

**Goal**: persistir el nuevo modelo de allocation con sub-clases sin romper los 11 ficheros que leen targets flat.

**Mapping explícito sub-clase → parent legacy (CRÍTICO, decidir antes de tocar)**

| Sub-clase V2      | Parent legacy (fallback flat) | Peso V2 propuesto |
|-------------------|-------------------------------|-------------------|
| cash_yield        | cash                          | 20                |
| etf_core          | etfs                          | 28                |
| etf_factor        | etfs                          | 10                |
| bonds_infl        | bonds                         | 10                |
| gold              | gold                          | 7                 |
| crypto_core       | crypto                        | 10                |
| crypto_alt        | crypto                        | 5                 |
| thematic_plays    | **stocks**                    | 7                 |
| legacy_hold       | **crypto** (SOL/PEPE son crypto) | 3               |

Con este mapping los flat targets resultantes son: cash=20, etfs=38, crypto=18, gold=7, bonds=10, stocks=7 = 100. Los detectores existentes siguen funcionando usando los flat targets hasta que se migren.

**Schema**: Opción B — nueva tabla `strategy_sub_targets(profile_id, sub_class, target_pct, parent_class)`. Los 6 campos de `strategy_profiles` quedan como **cache computado** (trigger o recalc on write) sumando sub-targets con el mismo parent. Evita lectura rota; los 11 ficheros legacy siguen vivos.

**Invariante y test**: `sum(sub_targets WHERE parent=X) == strategy_profiles.target_X_flat ± 0.001`. Test unit que falla CI si se rompe.

**Detectores que migran en esta fase (no dejarlo para después)**: drift-detector, rebalance-planner, concentration-risk, correlation-risk leen direct `strategy_sub_targets` si existe, si no, caen al flat. Evita que "drift" dispare comprar NVDA para cuadrar bucket "stocks" cuando en realidad `thematic_plays=7%` está vacío.

**Migración datos existentes**: derivar de los targets actuales. La app del usuario ya tiene `target_crypto=25 (hoy)` → crear crypto_core=15 + crypto_alt=10 como default; se ajusta en UI.

**UI**
- Editar `/strategy` > "Editar estrategia" con tabs por parent class. Cada sub-clase con slider + %.
- Validación: suma 100 ±0.5.

**Ventana de ejecución**: migración en fin de semana, con `systemctl --user stop claude-finanzas` + `systemctl --user stop fintrack-dev` + backup DB SQLite (copiar fichero) antes. Si algo peta, restore del fichero.

**Estimación**: 3-4 sesiones.

**Riesgos**
- 11 ficheros legacy leen flat. Mitigación: cache computado + invariante testeado + migración de detectores en misma fase.
- JSON shape de `intel_allocation_snapshots.allocation` hay que actualizarlo en la misma migración para que profile-review y digest-weekly sigan leyendo bien.

### 4.3 Fase 2 — Integración news + correlation guardrail (absorbe Fase 5)

**Goal**: news detector boostea score para activos en `intel_assets_tracked` con status ≥ shortlisted. Correlation guardrail se implementa aquí porque la infra (correlation.ts + correlation-risk.ts) ya existe.

**Sin tabla nueva**: la watchlist ya vive en `intel_assets_tracked` (Fase 0). Aquí solo integramos con news + guardrail.

**Integración news**
- En `news-filter.ts`, `buildAliases` ahora lee:
  - `investment_plans` enabled (holdings actuales) — ya lo hace.
  - `intel_assets_tracked` donde `status IN ('shortlisted', 'watching', 'open_position')` — NUEVO.
- Además, research en estado `researching` añade el ticker a aliases durante 7 días (TTL corto) para surface news relevantes mientras se investiga.
- Score resultante igual (assetMention +20). Permite que news sobre TTWO active signals aunque no tengas TTWO todavía.

**Correlation guardrail (absorbido de Fase 5)**
- Endpoint `POST /api/strategy/plans` y `PATCH /api/intel/assets-tracked/[id]/promote` hacen pre-check.
- Input: ticker nuevo. Output: correlación 90d vs top 5 holdings por peso.
- Si correlación > 0.8 con holding pesando > 10% → bloqueo, no solo warning. Override explícito: body `{ overrideCorrelationWarning: true }` + flag se guarda en el record para auditoría.

**UI**
- Página `/intel/tracked` con filtros por status: researching / shortlisted / watching / open / closed / archived. Unifica la vista (antes research + watchlist separados).
- Acción "Añadir" abre el mismo form que Fase 0.

**Estimación**: 2 sesiones.

**Riesgos**
- Spam news por watchlist crecida. Mitigación: para activos en watchlist (no holdings), exigir score ≥ 65 en lugar de 60. 
- TTL de research expirado: si research tiene 30 días y el usuario no decidió, desaparece de aliases. Mitigación: email/signal de recordatorio "tu research X expira en 3 días".

### 4.4 Fase 3 — Opportunity detector

**Goal**: nuevo scope `opportunity` que surface candidatos de watchlist que cumplen criterios.

**Detector rules v1**
- Activo en watchlist + precio actual dentro de -10% de entry_plan definido en su thesis → opportunity.
- Activo en watchlist + RSI diario < 30 → opportunity.
- Sub-clase infraponderada > 3% del target AND hay activo en watchlist de esa sub-clase → opportunity.
- Catalizador en fecha (research dossier had upcoming_catalysts) próxima en < 30d → opportunity.

**Severity**: médium por defecto, high si múltiples criterios coinciden.

**Integración Claude**: signals opportunity severity >= med pasan por claude-spawn con prompt dedicado (análisis oportunity + recomendación de tesis final).

**Estimación**: 2 sesiones.

### 4.5 Fase 4 — Exit-rule watcher

**Goal**: detector que vigila target/stop/time-horizon de posiciones con tesis abierta.

**Sin tabla nueva**: las tesis viven en `intel_assets_tracked` (Fase 0) con status `open_position`.

**Detector `thesis_watch.ts`**
- Para cada record con status=`open_position`:
  - Si precio actual ≥ target_price → scope=`thesis_target_hit` severity=high.
  - Si precio actual ≤ stop_price → scope=`thesis_stop_hit` severity=critical (SOFT: signal, no orden broker).
  - Si now - entry_date > time_horizon_months → scope=`thesis_expired` severity=med.
  - Si precio en -5% del stop → scope=`thesis_near_stop` severity=med (early warning).

**Checklist al añadir cada scope nuevo (importante)**:
- [ ] Añadir al enum `intelSignals.scope` en `schema.ts`.
- [ ] Añadir a `IntelScope` en `types.ts`.
- [ ] Actualizar tests: `profile-review.test.ts`, `concentration.test.ts`, tests de filtros UI.
- [ ] Decidir política en `intel_scope_cooldowns` (dismiss threshold).
- [ ] Decidir multiplier en `digest-weekly` / `digest-daily`.
- [ ] Decidir en `claude-spawn`: ¿severity mínima que dispara análisis Claude?
- [ ] Añadir icono + label al mapping en `/intel/page.tsx` (SCOPE_ICONS).

**UI**
- Página `/intel/tracked/[id]` con detalle + form para crear/editar thesis fields.
- Integración con research: "promote to open position" copia valores iniciales de `suggested_rules` del dossier.

**Estimación**: 3 sesiones (schema + detector + 4 scopes nuevos con checklist + UI crear/editar + integración con research + tests).

### 4.6 Fase 5 — (ABSORBIDA en Fase 2)

El correlation guardrail se implementa en Fase 2 porque la infra (correlation.ts, correlation-risk.ts) ya existe y son ~½ día de trabajo. No merece fase propia.

### 4.7 Fase 6 — Backtest V2 vs actual

**Goal**: simular V2 allocation vs current sobre últimos 12-24 meses antes de ejecutar.

**Proceso**
- Usar `scripts/evaluate_backtest.py` + `portfolio-analysis.py`.
- Input: allocation V2 (sub-clases + %), historial de precios de cada activo.
- Output: CAGR, max drawdown, volatilidad, Sharpe, vs la cartera actual. Plus: sensibilidad a cambios en cada sub-clase.
- Entrega: informe en Telegram + screenshot gráficas.

**Bloqueante**: no ejecutar Fase 7 hasta que el usuario revise el backtest y apruebe.

**Estimación**: 1 sesión (los scripts existen).

### 4.8 Fase 7 — Ejecución rollout

**Goal**: aplicar cambios operativos al DCA + watchlist.

**Acciones**
- Pausar SOL DCA (€70/mes) en `investment_plans`.
- Mantener MSFT pausado (ya lo está).
- Crear DCA plan nuevo para factor ETF (a definir: Value, EM, Dividend).
- Aumentar DCA BTC si cap crypto da margen.
- Seed watchlist con TTWO, SAN, NVDA, XLE, REP.MC.
- Correr research en cada (usando Fase 0).
- Revisar dossiers, decidir si promocionar alguno a tesis.
- Ajustar fondo emergencia objetivo a 4-5 meses.

**Estimación**: 1-2 sesiones acompañadas.

## 5. Orden de ejecución

```
Fase 0 (Research Drawer + tabla unificada)  [5-6 sesiones]
  └→ Fase 1 (Sub-targets schema + migración detectores) [3-4 sesiones]
       └→ Fase 2 (News + correlation guardrail en Fase 0 tabla) [2 sesiones]
            └→ Fase 3 (Opportunity detector) [2 sesiones]
                 └→ Fase 4 (Exit-rule watcher) [3 sesiones]
                      └→ Fase 6 (Backtest V2 vs actual) [1-2 sesiones]
                           └→ Fase 7 (Execution rollout) [1-2 sesiones]
```

Total realista: **~18 sesiones** (antes estimaba 13, sub-estimado).

- Fase 0 aislada aporta valor: el usuario puede investigar TTWO/SAN/etc. desde que se cierra. Decisión "me interesa" queda guardada en el mismo record con status=shortlisted.
- Fase 5 (correlation guardrail) absorbida en Fase 2.
- Fase 1 es la más delicada por los 11 ficheros legacy: agendar con backup DB.

## 6. No-goals de esta iteración

- No se toca el broker. No integramos Trade Republic API ni Binance auto-invest programático. La ejecución sigue siendo manual + tracking.
- No automatizamos tax harvest (solo detectamos y avisamos).
- No se hace paper-trading en tiempo real. El backtest es histórico.
- No se añade trading intradía ni leverage.

## 7. Decisiones pendientes (por criticidad)

### Bloqueantes (RESUELTAS 2026-04-20 por delegación del usuario "como tu veas mejor")

**a) Cap crypto final: 15% con transición por inflow (resuelto)**
- Target crypto total: 15% (crypto_core 10 + crypto_alt 5).
- Legacy crypto (SOL/PEPE): 3% extra como legacy_hold, no se vende pero no se aporta.
- Política transición: mientras crypto agregado > 17%, pausar todo DCA crypto. 15-17% solo BTC weekly. < 15% BTC weekly + ETH mensual.
- Goal "acumular 0.05 BTC" se reinterpreta como progressive (se cumple al crecer la cartera hacia ~€32k manteniendo 10% crypto_core en BTC). No se fuerza el cap para cumplir el goal.
- Nunca forzar ventas de SOL/PEPE para corregir drift. Dilución vía inflow a otras clases.

**b) Stops SOFT (resuelto)**
- SOFT default: detector thesis_watch genera signals severity=critical cuando precio ≤ stop, pero NO dispara orden en broker. El usuario ejecuta manualmente en Trade Republic / Binance.
- Rationale: CLAUDE.md explícitamente manda "manual + tracking"; integrar broker API expande scope y riesgo enormemente.
- HARD stops quedan fuera de V2 (posible V3 si hay demanda).

### No bloqueantes (decidir en Fase 7, ejecución)

1. Factor ETF descorrelacionado concreto: Value, EM, Dividend Aristocrats, otro. Se decide tras research.
2. Cash_yield instrument: stablecoin con yield (DAI/USDC en Aave), MMF EUR (XEON o equivalente), cuenta remunerada bancaria.
3. Tickers concretos que sembrar en watchlist. Arrancamos con TTWO, SAN.MC, NVDA, XLE, REP.MC; añades lo que te interese.
4. Target_price/stop_price iniciales de cada tesis: los sugiere el research + mini-backtest; los ajustas.

## 8. Rollback plan

- Fase 0-4 añaden tablas nuevas, no alteran datos existentes → rollback = drop tables + revert deploy.
- Fase 1 migra `strategy_profiles`: snapshot DB antes. Si algo peta, restore del snapshot.
- Fase 7 (ejecución) es reversible: pausar un DCA es 2 clicks, reactivar también. SOL/PEPE existing holdings no se venden en el plan; hold legacy.

## 9. Métricas de éxito

- **30 días tras Fase 0**: usuario ha pedido >= 5 dossiers, decidió promover / descartar / archivar al menos 3.
- **60 días tras Fase 4**: hay al menos 2 tesis abiertas con exit rules; el watcher ha disparado al menos 1 señal útil.
- **90 días tras Fase 7**: drift de sub-clases < 5% respecto a targets; nº señales "ruido" en /intel bajó respecto al baseline.
- **Cualitativo**: el usuario se siente en control y aprendiendo, no llenando un buzón.

## 10. Riesgos globales

- **Prompt quality**: análisis Claude puede ser superficial. Mitigación: prompt disciplinado + evals manuales los primeros N dossiers.
- **Datos externos caídos**: Yahoo/CoinGecko fallan. Mitigación: status "failed" con reintento + el usuario puede rellenar manualmente.
- **Over-engineering**: el usuario podría terminar con 50 theses abiertas y no actuar. Mitigación: cap duro 3-4 simultáneas impuesto en UI.
- **Correlation guardrail falsos positivos**: frena compras legítimas. Mitigación: umbral en 0.8 no 0.7, warning override permitido.
