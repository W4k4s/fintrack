# Research Drawer — módulo `intel/research`

Motor que recibe un ticker arbitrario, reúne datos de mercado + portfolio y
produce un dossier estructurado vía Claude. Strategy V2 Fase 0.

## Flujo

```
POST /api/intel/research  {ticker, note?}
        │
        ▼
  intel_assets_tracked (status=researching)
        │
        ▼                          fire-and-forget
 spawnClaudeForResearch(id)  ◄──────────────────
        │
        ├─ buildResearchContext(ticker)
        │    ├─ fetchPriceHistory()         Yahoo/CoinGecko
        │    ├─ computeTechnicalSnapshot()  RSI, SMA, MACD, Boll, vol 90d
        │    ├─ computeCorrelationVsTopHoldings()  top-5 EUR, pearson log-returns
        │    ├─ fetchRecentNewsForTicker()  intel_news_items últimos 7d
        │    └─ latest intel_allocation_snapshots
        │
        ├─ loadSystemPrompt()        prompts/research-system.txt (versionado)
        ├─ formatMarketData(ctx)     bloque pegado tras el system prompt
        ├─ runClaude(prompt)         spawn CLI, timeout 180s
        └─ extractJson + persist     dossier_json, verdict, sub_class, status=researched
```

## Ficheros

| Fichero | Responsabilidad |
|---------|----------------|
| `fetcher.ts` | Yahoo + CoinGecko → `PriceHistory` normalizado |
| `indicators.ts` | SMA, RSI Wilder, EMA, MACD, Bollinger %B, vol anualizada |
| `correlation-holdings.ts` | Top-5 holdings EUR + pearson vs ticker |
| `news-lookup.ts` | Query `intel_news_items` con match triple (JSON/title/body) + boundary |
| `context-builder.ts` | Monta `ResearchContext` + `formatMarketData` |
| `claude-runner.ts` | Circuit breaker + mutex + spawn + parse + persist |
| `prompts/research-system.txt` | System prompt — single source of truth |

## Estados (máquina de transición)

```
researching ─┬─▶ researched ─┬─▶ shortlisted ─▶ watching ─▶ open_position ─▶ closed
             │               ├─▶ watching (skip shortlist)
             │               └─▶ archived
             ├─▶ failed (retry → researching)
             └─▶ archived
```

- `researching`: worker Claude corriendo.
- `researched`: dossier listo, pendiente decisión usuario.
- `shortlisted`: interés manual, news aliases activas.
- `watching`: tesis escrita, sin posición aún.
- `open_position`: tiene entry_price y entry_date.
- `closed`: tesis cerrada (target/stop/time hit).
- `archived`: descartada.
- `failed`: error fetch/Claude; `retry` acción disponible.

Unique partial index `uq_intel_tracked_researching_per_ticker` impide
duplicados simultáneos del mismo ticker en estado `researching`.

## Cómo extender

**Nueva fuente de datos para el contexto**:
1. Crear módulo con función pura `fetchXYZ(ticker)` en este directorio.
2. Añadir campo a `ResearchContext` en `context-builder.ts`.
3. Llamar en `buildResearchContext`, propagar errores a `fetchErrors`.
4. Formatear en `formatMarketData`.
5. Si requiere Claude evaluar cosa nueva → actualizar
   `prompts/research-system.txt` y sincronizar design doc.

**Nuevo disqualifier**:
1. Añadir ID al bloque "Guardrails" del system prompt.
2. Actualizar few-shot si el ejemplo aporta calibración nueva.
3. Añadir al dataset de eval en `docs/planning/research-prompt-design.md §3`.
4. Correr `scripts/research-eval-validate.mjs` para verificar no-regresión.

**Nueva acción usuario**:
1. Añadir caso al switch de `POST /api/intel/research/[id]`.
2. Añadir botón en `src/app/intel/research/[id]/actions.tsx`.
3. Documentar el trigger aquí y en el estado correspondiente.

## Limitaciones conocidas

- **Fundamentales**: Yahoo quoteSummary pide cookie+crumb desde 2024 →
  marcado `unavailable`. Claude usa `unknown` en disqualifiers
  dilution_recent y valuation_extreme cuando no tiene datos.
- **CoinGecko rate limit free tier**: 30 req/min. Research con target
  crypto + top holdings crypto puede rozarlo en ráfaga de evals.
- **Yahoo tickers europeos**: requiere sufijo (.MC, .AS, .L). Sin sufijo
  puede resolver a instrumento US distinto.
- **News corpus**: `intel_news_items` es crypto + macro. Tickers de equity
  individuales suelen no tener hits → Claude marca news vacío.

## Eval

```bash
# Lanzar los 10 tickers del dataset (tarda ~20 min, secuencial por mutex).
node scripts/research-eval-run.mjs

# Validar los 9 bloqueantes del criterio de aprobación.
node scripts/research-eval-validate.mjs
```

Los outputs quedan en `docs/planning/research-prompt-evals/YYYY-MM-DD/`.
