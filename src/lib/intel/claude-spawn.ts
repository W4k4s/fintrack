import { spawn } from "child_process";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { sendIntelNotification } from "./telegram";

/**
 * Spawnea un agente Claude efímero para analizar una signal.
 *
 * - Claude CLI corre en modo `-p` (print/headless) con permisos por defecto.
 * - Le pasa un prompt estructurado que lista los campos de la signal y pide
 *   respuesta en JSON con `analysis`, `severity_adj`, `tg_text`.
 * - Tras recibir el JSON, actualiza la signal (analysis_text, analysis_status)
 *   y, si corresponde por severidad, dispara notificación Telegram.
 *
 * Circuit breaker en memoria: 3 fallos seguidos → abre 30 min.
 */

const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const TIMEOUT_MS = 90_000;
const MAX_CONCURRENT_SPAWNS = 2;

const VALID_SEVERITY = ["low", "med", "high", "critical"] as const;
const VALID_ACTIONS = [
  "buy_accelerate",
  "hold",
  "pause_dca",
  "rebalance",
  "sell_partial",
  "review",
  "ignore",
] as const;

let consecutiveFailures = 0;
let circuitOpenUntil = 0;

let activeSpawns = 0;
const spawnWaiters: Array<() => void> = [];

async function acquireSpawnSlot(): Promise<void> {
  if (activeSpawns < MAX_CONCURRENT_SPAWNS) {
    activeSpawns++;
    return;
  }
  await new Promise<void>((resolve) => spawnWaiters.push(resolve));
  activeSpawns++;
}

function releaseSpawnSlot(): void {
  activeSpawns--;
  const next = spawnWaiters.shift();
  if (next) next();
}

function severityRank(s: string): number {
  return { low: 0, med: 1, high: 2, critical: 3 }[s] ?? 0;
}

function buildPrompt(sig: typeof schema.intelSignals.$inferSelect): string {
  const payload = safeJson(sig.payload) as Record<string, unknown>;
  const lines = [
    "Eres el analista de inversiones de Isma. Él NO es trader profesional, es ingeniero. Explica en español llano, frases cortas, sin jerga.",
    "Si tienes que usar un término técnico (RSI, funding, volatilidad), añade una traducción breve en paréntesis la primera vez.",
    "Contexto del usuario: estrategia Reset 2026 (perfil balanced, cash del 67% bajando a 25% en 6 meses, multiplicador ×2 automático en crypto cuando F&G ≤ 24). EUR es la moneda base.",
    "",
    "SEÑAL DETECTADA:",
    `- id: ${sig.id}`,
    `- tipo (scope): ${sig.scope}`,
    `- severidad inicial (por regla): ${sig.severity}`,
    `- asset: ${sig.asset ?? "-"}`,
    `- título: ${sig.title}`,
    `- resumen regla: ${sig.summary}`,
    `- acción propuesta por la regla: ${sig.suggestedAction ?? "-"}`,
    `- cantidad sugerida EUR: ${sig.actionAmountEur ?? "-"}`,
    `- datos crudos: ${JSON.stringify(payload)}`,
  ];

  if (sig.scope === "news") {
    const excerpt = String(payload.bodyExcerpt ?? "").slice(0, 500);
    const keywords = Array.isArray(payload.keywordsMatched) ? payload.keywordsMatched : [];
    const assets = Array.isArray(payload.assetsMentioned) ? payload.assetsMentioned : [];
    lines.push(
      "",
      "CONTEXTO NOTICIA:",
      `- fuente: ${payload.source ?? "-"} (tier ${payload.publisherTier ?? "?"})`,
      `- url: ${payload.url ?? "-"}`,
      `- publicada: ${payload.publishedAt ?? "-"}`,
      `- keywords matched: ${keywords.join(", ") || "-"}`,
      `- assets del portfolio mencionados: ${assets.join(", ") || "ninguno"}`,
      `- score filtro: ${payload.rawScore ?? "-"}`,
      `- extracto: ${excerpt || "(sin cuerpo)"}`,
      "",
      "INSTRUCCIONES ESPECÍFICAS NEWS:",
      "- El filtro es tonto (keywords+tier). Tú decides si esta noticia es RELEVANTE de verdad para la tesis de Isma, o si es ruido (FOMO, AI hype, crypto twitter drama).",
      "- whats_happening: resumen EN 2 FRASES de lo que dice la noticia. NO copies el titular; extrae el hecho.",
      "- what_it_means: impacto concreto en la tesis Reset 2026. Menciona si cambia o refuerza cash %, multiplicador F&G, o alguna asignación. Si la noticia es ruido, dilo ('no cambia tesis') y pon severity_adj=low.",
      "- action.headline: decisivo. Ej: 'Pausar DCA USDC 48h', 'Acelerar compra BTC semanal', 'Mantener rumbo, ignorar'.",
      "- suggested_action OBLIGATORIO entre pause_dca | buy_accelerate | hold | review | ignore.",
      "- Si es FOMO (ATH/rally sin catalizador fundamental): severity_adj=low, suggested_action=hold.",
      "- Si detectas riesgo existencial en asset del portfolio (hack confirmado, depeg, insolvencia): severity_adj=critical, suggested_action=pause_dca.",
      "- No sobre-reacciones: macro de cada día NO es critical. Critical es cuando hay riesgo de pérdida permanente >5% en algún asset.",
    );
  }

  if (sig.scope === "opportunity") {
    const hits = Array.isArray(payload.hits)
      ? (payload.hits as Array<{ rule: string; detail: Record<string, unknown> }>)
      : [];
    const hitsPretty = hits.length > 0
      ? hits.map((h) => `${h.rule} → ${JSON.stringify(h.detail)}`).join("\n  · ")
      : "(ninguno)";
    const thesis = String(payload.thesis ?? "").trim() || "(sin tesis escrita)";
    const entryPlan = String(payload.entryPlan ?? "").trim() || "(sin entry plan)";
    lines.push(
      "",
      "CONTEXTO OPORTUNIDAD (Strategy V2):",
      `- ticker: ${payload.ticker ?? sig.asset ?? "-"}`,
      `- nombre: ${payload.name ?? "-"}`,
      `- sub-clase V2: ${payload.subClass ?? "?"} (status watching)`,
      `- precio actual: ${payload.currentPrice ?? "-"} ${payload.priceCurrency ?? ""} (fuente ${payload.priceSource ?? "-"})`,
      `- niveles tesis: entry ${payload.entryPrice ?? "-"} / target ${payload.targetPrice ?? "-"} / stop ${payload.stopPrice ?? "-"} (SOFT) / horizon ${payload.timeHorizonMonths ?? "-"}m`,
      `- entry plan: ${entryPlan}`,
      `- tesis original: ${thesis}`,
      `- reglas disparadas (${hits.length}):`,
      `  · ${hitsPretty}`,
      "",
      "INSTRUCCIONES ESPECÍFICAS OPPORTUNITY:",
      "- Esto NO es una recomendación genérica: es un activo que Isma YA decidió vigilar (status=watching) con tesis escrita. Tu trabajo es validar si la ventana de entrada sigue viva o la tesis se ha roto.",
      "- whats_happening: en 2 frases — qué ha cambiado en el mercado para que disparen estas reglas ahora (no repitas los datos crudos; resume la señal).",
      "- what_it_means: ¿la tesis sigue vigente o hay red flag? Si el catalizador se ha movido o el contexto macro invalida la tesis, dilo. Si no, confirma.",
      "- action.headline: decisivo y concreto. Ejemplos: 'Abrir 1er tramo DCA (25% del size)', 'Esperar confirmación cierre diario', 'Descartar: tesis rota, archivar'.",
      "- action.amount_eur: usa position_size_pct del dossier si está disponible; cap duro 3% del neto por posición thematic_plays. Primer tramo = size/4 en DCA de 4 tramos.",
      "- suggested_action OBLIGATORIO: buy_accelerate (abrir primer tramo), hold (esperar), review (confirmación adicional), ignore (tesis rota, archivar).",
      "- Si solo disparó 1 regla y es 'catalyst_near' sin confirmación técnica: severity_adj=med, suggested_action=review.",
      "- Si ≥2 reglas incluyendo RSI oversold + entry_window: severity_adj=high, suggested_action=buy_accelerate (1er tramo DCA).",
      "- Si el precio actual está FUERA del rango del entry_plan original pero RSI<30: marca como review con nota 'reevaluar plan, no entrar mecánico'.",
      "- Nunca recomendar 'all-in'. Siempre DCA en tramos.",
    );
  }

  lines.push(
    "",
    "Tu trabajo: convertir esta señal en un análisis accionable, que Isma lea y sepa qué hacer en 30 segundos.",
  );
  return lines.concat(formatOutputSection()).join("\n");
}

function formatOutputSection(): string[] {
  return [
    "",
    "FORMATO DE SALIDA (OBLIGATORIO — solo este JSON, sin fences ni texto alrededor):",
    "{",
    '  "whats_happening": "2-3 frases cortas explicando qué ha detectado el sistema, en lenguaje plano. Si usas un tecnicismo, tradúcelo en paréntesis.",',
    '  "what_it_means": "Qué implica para la cartera de Isma. Referencia cash alto, multiplicador, Reset 2026 cuando venga al caso.",',
    '  "pros": ["punto positivo 1 en <=15 palabras", "punto 2"],',
    '  "cons": ["riesgo 1 en <=15 palabras", "riesgo 2"],',
    '  "action": {',
    '    "headline": "Una sola frase con la acción recomendada (ej. \\"Doblar la compra semanal de BTC\\")",',
    '    "steps": ["paso concreto 1 (dónde, qué, cuánto)", "paso 2 si aplica"],',
    '    "amount_eur": number | null,',
    '    "where": "Binance / Trade Republic / Ninguno (solo informativo)"',
    "  },",
    '  "avoid": ["qué NO hacer específico para esta situación 1", "qué NO hacer 2"],',
    '  "confidence": "alta" | "media" | "baja",',
    '  "confidence_why": "Una frase explicando por qué esa confianza.",',
    '  "severity_adj": "low" | "med" | "high" | "critical",',
    '  "suggested_action": "buy_accelerate" | "hold" | "pause_dca" | "rebalance" | "sell_partial" | "review" | "ignore",',
    '  "tg_text": "Mensaje Telegram compacto <=400 chars, emojis moderados, con la decisión clara y el link /intel/<id>.",',
    '  "headline_short": "Título de 4-8 palabras para el panel, en lugar del título técnico de la regla."',
    "}",
    "",
    "Reglas adicionales:",
    "- Sé DECISIVO: una sola acción recomendada, no un menú.",
    "- pros y cons: máximo 3 items cada uno.",
    "- Si la acción es \"no hacer nada\", dilo claro: headline \"Observar, no actuar\" y steps vacío.",
    "- NO inventes datos que no estén en el payload.",
    "- Responde ÚNICAMENTE el JSON. Nada antes, nada después.",
  ];
}

function safeJson(s: string | null): unknown {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

function extractJson(raw: string): Record<string, unknown> | null {
  // Claude a veces envuelve en ```json ... ```
  const fenced = raw.match(/```(?:json)?\s*([\s\S]+?)```/);
  const candidate = fenced?.[1] ?? raw;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) return null;
  const body = candidate.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, ["-p", "--output-format", "text"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on("data", (c) => stdoutChunks.push(c));
    child.stderr.on("data", (c) => stderrChunks.push(c));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`claude spawn timeout ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code !== 0) {
        reject(new Error(`claude exited ${code}: ${stderr || stdout}`));
        return;
      }
      resolve(stdout);
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

export async function spawnClaudeForSignal(signalId: number): Promise<void> {
  if (Date.now() < circuitOpenUntil) {
    console.warn(`[intel] circuit open, skip signal=${signalId}`);
    await db
      .update(schema.intelSignals)
      .set({ analysisStatus: "pending_manual" })
      .where(eq(schema.intelSignals.id, signalId));
    return;
  }

  const [row] = await db
    .select()
    .from(schema.intelSignals)
    .where(eq(schema.intelSignals.id, signalId))
    .limit(1);
  if (!row) return;

  await db
    .update(schema.intelSignals)
    .set({ analysisStatus: "claude_requested" })
    .where(eq(schema.intelSignals.id, signalId));

  await acquireSpawnSlot();
  try {
    const prompt = buildPrompt(row);
    const raw = await runClaude(prompt);
    const parsed = extractJson(raw);
    if (!parsed) throw new Error(`unparseable claude output: ${raw.slice(0, 200)}`);

    // Guardamos el JSON completo como analysisText. El UI lo parsea por secciones.
    // Mantener compatibilidad con analyses viejos: si no hay whats_happening, el UI cae a plain text.
    const analysisJson = JSON.stringify(parsed);
    const rawSeverity = String(parsed.severity_adj ?? "");
    const severityAdj = (
      (VALID_SEVERITY as readonly string[]).includes(rawSeverity)
        ? rawSeverity
        : row.severity
    ) as typeof row.severity;
    const tgText = String(parsed.tg_text ?? "").trim();
    const rawAction = String(parsed.suggested_action ?? "");
    const suggestedAction = (VALID_ACTIONS as readonly string[]).includes(rawAction)
      ? rawAction
      : (row.suggestedAction ?? "review");

    await db
      .update(schema.intelSignals)
      .set({
        analysisText: analysisJson,
        analysisStatus: "claude_done",
        severity: severityAdj,
        suggestedAction,
        resolvedAt: new Date().toISOString(),
      })
      .where(eq(schema.intelSignals.id, signalId));

    consecutiveFailures = 0;

    // Telegram si severity final alta
    if (severityRank(severityAdj) >= severityRank("high")) {
      await sendIntelNotification(signalId, tgText || row.summary);
    }
  } catch (err) {
    consecutiveFailures++;
    if (consecutiveFailures >= 3) {
      circuitOpenUntil = Date.now() + 30 * 60_000;
      console.error(`[intel] circuit OPEN (30m) after ${consecutiveFailures} fails`);
    }
    await db
      .update(schema.intelSignals)
      .set({ analysisStatus: "claude_failed" })
      .where(eq(schema.intelSignals.id, signalId));
    console.error(`[intel] claude spawn failed for signal=${signalId}`, err);
  } finally {
    releaseSpawnSlot();
  }
}

export const __internal = { buildPrompt };
