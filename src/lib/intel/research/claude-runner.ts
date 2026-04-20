/**
 * Runner Claude para Research Drawer.
 * Lee fila intel_assets_tracked → arma contexto → llama Claude CLI →
 * parsea JSON dossier → persiste. Fire-and-forget desde el endpoint POST.
 *
 * Circuit breaker local (distinto del de claude-spawn.ts; research puede
 * fallar sin frenar signals y viceversa).
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { buildResearchContext, formatMarketData } from "./context-builder";

const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const TIMEOUT_MS = 180_000; // research dossier es pesado (backtest + análisis).
const MAX_CONCURRENT = 1; // no saturar con research parallel; signals siguen su camino.

let activeSpawns = 0;
const waiters: Array<() => void> = [];
let consecutiveFailures = 0;
let circuitOpenUntil = 0;

async function acquire(): Promise<void> {
  if (activeSpawns < MAX_CONCURRENT) {
    activeSpawns++;
    return;
  }
  await new Promise<void>((r) => waiters.push(r));
  activeSpawns++;
}

function release(): void {
  activeSpawns--;
  const next = waiters.shift();
  if (next) next();
}

let cachedSystemPrompt: string | null = null;
function loadSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  const p = path.join(process.cwd(), "src/lib/intel/research/prompts/research-system.txt");
  cachedSystemPrompt = fs.readFileSync(p, "utf8");
  return cachedSystemPrompt;
}

function extractJson(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]+?)```/);
  const candidate = fenced?.[1] ?? raw;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) return null;
  try {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
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
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (c) => out.push(c));
    child.stderr.on("data", (c) => err.push(c));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`claude research timeout ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(err).toString("utf8");
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

export async function spawnClaudeForResearch(researchId: number): Promise<void> {
  if (Date.now() < circuitOpenUntil) {
    console.warn(`[research] circuit open, skip id=${researchId}`);
    await db
      .update(schema.intelAssetsTracked)
      .set({ status: "failed", failureReason: "circuit_open", updatedAt: new Date().toISOString() })
      .where(eq(schema.intelAssetsTracked.id, researchId));
    return;
  }

  const [row] = await db
    .select()
    .from(schema.intelAssetsTracked)
    .where(eq(schema.intelAssetsTracked.id, researchId))
    .limit(1);
  if (!row) return;
  if (row.status !== "researching") return;

  await acquire();
  try {
    const ctx = await buildResearchContext(row.ticker);
    if (!ctx.priceHistory || (ctx.priceHistory.points.length < 30)) {
      await db
        .update(schema.intelAssetsTracked)
        .set({
          status: "failed",
          failureReason: `insufficient_price_data: ${ctx.fetchErrors.join("; ") || "unknown"}`,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.intelAssetsTracked.id, researchId));
      return;
    }

    const systemPrompt = loadSystemPrompt();
    const marketData = formatMarketData(ctx);
    const fullPrompt = `${systemPrompt}\n\n---\n\n${marketData}\n\nDevuelve SOLO el JSON del dossier, nada más.`;

    const rawOutput = await runClaude(fullPrompt);
    const parsed = extractJson(rawOutput);
    if (!parsed) {
      throw new Error(`unparseable dossier json (first 200 chars): ${rawOutput.slice(0, 200)}`);
    }

    const verdictRaw = String(parsed.verdict ?? "");
    const verdict = (["candidate", "wait", "pass"] as const).includes(
      verdictRaw as "candidate" | "wait" | "pass",
    )
      ? (verdictRaw as "candidate" | "wait" | "pass")
      : null;
    const subClassRaw = String(parsed.sub_class_proposed ?? "");
    const validSub = [
      "cash_yield", "etf_core", "etf_factor", "bonds_infl", "gold",
      "crypto_core", "crypto_alt", "thematic_plays", "legacy_hold",
    ] as const;
    const subClass = (validSub as readonly string[]).includes(subClassRaw)
      ? (subClassRaw as typeof validSub[number])
      : row.subClass;
    const name = typeof parsed.what_is_it === "string"
      ? String(parsed.what_is_it).split(/[.!?]/)[0].slice(0, 120)
      : row.name;

    await db
      .update(schema.intelAssetsTracked)
      .set({
        dossierJson: JSON.stringify(parsed),
        technicalSnapshotJson: ctx.technical ? JSON.stringify(ctx.technical) : null,
        verdict,
        subClass,
        name,
        researchedAt: new Date().toISOString(),
        status: "researched", // dossier listo, pendiente de decisión del usuario
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.intelAssetsTracked.id, researchId));

    consecutiveFailures = 0;
  } catch (err) {
    consecutiveFailures++;
    if (consecutiveFailures >= 3) {
      circuitOpenUntil = Date.now() + 30 * 60_000;
      console.error(`[research] circuit OPEN (30m) after ${consecutiveFailures} fails`);
    }
    const reason = (err as Error).message.slice(0, 500);
    await db
      .update(schema.intelAssetsTracked)
      .set({ status: "failed", failureReason: reason, updatedAt: new Date().toISOString() })
      .where(eq(schema.intelAssetsTracked.id, researchId));
    console.error(`[research] spawn failed for id=${researchId}:`, err);
  } finally {
    release();
  }
}
