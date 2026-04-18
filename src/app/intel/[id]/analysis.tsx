/**
 * Renderizador del análisis Claude para una signal.
 *
 * Acepta el campo `analysisText` (string). Si es JSON con las claves esperadas,
 * renderiza por secciones (qué pasa / qué significa / pros-cons / acción / evitar / confianza).
 * Si no parsea o es legacy plain text, cae a renderizar texto plano.
 */

interface StructuredAnalysis {
  whats_happening?: string;
  what_it_means?: string;
  pros?: string[];
  cons?: string[];
  action?: {
    headline?: string;
    steps?: string[];
    amount_eur?: number | null;
    where?: string;
  };
  avoid?: string[];
  confidence?: "alta" | "media" | "baja" | string;
  confidence_why?: string;
  headline_short?: string;
  tg_text?: string;
}

function tryParse(text: string | null | undefined): StructuredAnalysis | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && parsed.whats_happening) {
      return parsed as StructuredAnalysis;
    }
    return null;
  } catch {
    return null;
  }
}

const CONFIDENCE_COLOR: Record<string, string> = {
  alta: "text-green-400 bg-green-500/10 border-green-500/30",
  media: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  baja: "text-red-400 bg-red-500/10 border-red-500/30",
};

export function AnalysisRenderer({ analysisText }: { analysisText: string | null }) {
  const parsed = tryParse(analysisText);

  if (!parsed) {
    return (
      <div className="whitespace-pre-wrap text-sm leading-relaxed">
        {analysisText}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {parsed.whats_happening && (
        <Section icon="📊" title="Qué está pasando">
          <p className="text-sm leading-relaxed">{parsed.whats_happening}</p>
        </Section>
      )}

      {parsed.what_it_means && (
        <Section icon="🎯" title="Qué significa para tu cartera">
          <p className="text-sm leading-relaxed">{parsed.what_it_means}</p>
        </Section>
      )}

      {(parsed.pros?.length || parsed.cons?.length) ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {parsed.pros && parsed.pros.length > 0 && (
            <Section icon="✅" title="A favor">
              <ul className="text-sm space-y-1.5">
                {parsed.pros.map((p, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-green-400 shrink-0">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {parsed.cons && parsed.cons.length > 0 && (
            <Section icon="⚠️" title="En contra / riesgos">
              <ul className="text-sm space-y-1.5">
                {parsed.cons.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-yellow-400 shrink-0">•</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      ) : null}

      {parsed.action?.headline && (
        <Section icon="🚀" title="Qué hacer" accent>
          <div className="font-medium text-base mb-2">{parsed.action.headline}</div>
          {parsed.action.steps && parsed.action.steps.length > 0 && (
            <ol className="text-sm space-y-1.5 mb-3 list-decimal list-inside marker:text-muted-foreground">
              {parsed.action.steps.map((s, i) => (
                <li key={i} className="leading-relaxed">{s}</li>
              ))}
            </ol>
          )}
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
            {parsed.action.amount_eur != null && (
              <div>
                <span className="uppercase tracking-wide">Importe: </span>
                <span className="text-foreground font-semibold">
                  {parsed.action.amount_eur.toFixed(2)}€
                </span>
              </div>
            )}
            {parsed.action.where && (
              <div>
                <span className="uppercase tracking-wide">Dónde: </span>
                <span className="text-foreground font-semibold">{parsed.action.where}</span>
              </div>
            )}
          </div>
        </Section>
      )}

      {parsed.avoid && parsed.avoid.length > 0 && (
        <Section icon="🚫" title="Qué NO hacer">
          <ul className="text-sm space-y-1.5">
            {parsed.avoid.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-red-400 shrink-0">•</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {parsed.confidence && (
        <div
          className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${
            CONFIDENCE_COLOR[parsed.confidence] ?? "text-muted-foreground border-border"
          }`}
        >
          <span className="text-xl shrink-0">💡</span>
          <div>
            <div className="font-semibold">
              Confianza: {parsed.confidence}
            </div>
            {parsed.confidence_why && (
              <div className="mt-1 opacity-90">{parsed.confidence_why}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  children,
  accent,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent ? "bg-accent/5 border-accent/30" : "bg-card border-border"
      }`}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-2">
        <span className="text-base not-uppercase">{icon}</span>
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

export function parseHeadlineShort(analysisText: string | null): string | null {
  const parsed = tryParse(analysisText);
  return parsed?.headline_short ?? null;
}
