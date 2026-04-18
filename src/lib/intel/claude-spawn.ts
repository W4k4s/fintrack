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
    "Eres un analista de inversiones integrado en FinTrack. Recibes una señal intel detectada por reglas deterministas y debes producir un juicio breve.",
    "",
    `SIGNAL id=${sig.id} scope=${sig.scope} severity=${sig.severity}`,
    `ASSET: ${sig.asset ?? "-"}`,
    `TITLE: ${sig.title}`,
    `SUMMARY: ${sig.summary}`,
    `SUGGESTED ACTION (from detector): ${sig.suggestedAction ?? "-"}`,
    `ACTION AMOUNT EUR: ${sig.actionAmountEur ?? "-"}`,
    `PAYLOAD: ${JSON.stringify(payload)}`,
    "",
    "INSTRUCCIONES:",
    "1. Analiza el contexto en <=120 palabras: qué significa esta señal en la estrategia Reset 2026 del usuario (balanced, cash 67%→25% en 6m, mult F&G activo).",
    "2. Confirma o revisa la acción sugerida. Sé decisivo.",
    "3. Produce un texto Telegram compacto (<=500 chars, sin markdown complejo, emojis moderados).",
    "",
    "FORMATO DE SALIDA (OBLIGATORIO, solo este JSON, sin texto alrededor):",
    "{",
    '  "analysis": "...texto markdown <=120 palabras...",',
    '  "severity_adj": "low" | "med" | "high" | "critical",',
    '  "suggested_action": "buy_accelerate" | "hold" | "pause_dca" | "rebalance" | "sell_partial" | "review" | "ignore",',
    '  "tg_text": "...<=500 chars...",',
    '  "confidence": 0.0-1.0',
    "}",
    "",
    "Responde SOLO el JSON. Nada más.",
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

    const analysis = String(parsed.analysis ?? "").trim();
    const severityAdj =
      (["low", "med", "high", "critical"].includes(String(parsed.severity_adj))
        ? String(parsed.severity_adj)
        : row.severity) as typeof row.severity;
    const tgText = String(parsed.tg_text ?? "").trim();
    const suggestedAction = String(parsed.suggested_action ?? row.suggestedAction ?? "review");

    await db
      .update(schema.intelSignals)
      .set({
        analysisText: analysis,
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
