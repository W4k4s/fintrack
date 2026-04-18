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

let consecutiveFailures = 0;
let circuitOpenUntil = 0;

function severityRank(s: string): number {
  return { low: 0, med: 1, high: 2, critical: 3 }[s] ?? 0;
}

function buildPrompt(sig: typeof schema.intelSignals.$inferSelect): string {
  const payload = safeJson(sig.payload);
  return [
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
    "",
    "Tu trabajo: convertir esta señal en un análisis accionable, que Isma lea y sepa qué hacer en 30 segundos.",
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
  ].join("\n");
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

  try {
    const prompt = buildPrompt(row);
    const raw = await runClaude(prompt);
    const parsed = extractJson(raw);
    if (!parsed) throw new Error(`unparseable claude output: ${raw.slice(0, 200)}`);

    // Guardamos el JSON completo como analysisText. El UI lo parsea por secciones.
    // Mantener compatibilidad con analyses viejos: si no hay whats_happening, el UI cae a plain text.
    const analysisJson = JSON.stringify(parsed);
    const severityAdj =
      (["low", "med", "high", "critical"].includes(String(parsed.severity_adj))
        ? String(parsed.severity_adj)
        : row.severity) as typeof row.severity;
    const tgText = String(parsed.tg_text ?? "").trim();
    const suggestedAction = String(parsed.suggested_action ?? row.suggestedAction ?? "review");

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
  }
}
