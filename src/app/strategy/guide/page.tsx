"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Calendar, PiggyBank, BookOpen,
  Shield, Zap, AlertTriangle, XCircle, Info,
  Thermometer, Layers, ListChecks, Compass, Bot,
  Eye, Target,
} from "lucide-react";

interface StrategyResp {
  profile: {
    id: number; name: string; riskProfile: string;
    targetCash: number; targetEtfs: number; targetCrypto: number;
    targetGold: number; targetBonds: number; targetStocks: number;
    monthlyInvest: number; emergencyMonths: number; notes: string | null;
    tagline: string | null; philosophy: string | null;
    policiesJson: string | null; monthlyFixedExpenses: number;
  };
  goals: Array<{ id: number; name: string; type: string; targetValue: number; targetAsset: string | null; targetUnit: string; priority: number; completed: boolean; notes: string | null }>;
  plans: Array<{ id: number; name: string; asset: string; amount: number; frequency: string; enabled: boolean; rationale: string | null }>;
}
interface GuidePolicies {
  crypto: { pauseAbovePct: number; btcOnlyBetween: [number, number]; fullBelowPct: number };
  multiplier: { fgThreshold: number; appliesTo: string[]; requiresCryptoUnderPct: number };
  thematic: { maxPositionPct: number; maxOpen: number; requireThesisFields: string[] };
}
function parseGuidePolicies(raw: string | null): GuidePolicies | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as GuidePolicies; } catch { return null; }
}
interface Market {
  fearGreed: { value: number; label: string };
  dcaMultiplier: { value: number; label: string };
  finances: { savingsRate: number; monthlyInvestable: number; monthlyIncome: number; monthlyExpenses: number; netWorth: number };
}
interface Health {
  allocation: Array<{ class: string; current: number; target: number; drift: number; currentValue: number; targetValue: number }>;
  emergency: { target: number; current: number; ok: boolean; surplus: number };
  goalsProgress: Array<{ id: number; currentValue: number; progress: number }>;
}

const CLASS_LABELS: Record<string, string> = {
  cash: "Cash (efectivo)", etfs: "ETFs (fondos)", crypto: "Crypto",
  gold: "Oro", bonds: "Bonos", stocks: "Acciones individuales",
};
const CLASS_COLORS: Record<string, string> = {
  cash: "#71717a", etfs: "#10b981", crypto: "#f59e0b",
  gold: "#eab308", bonds: "#3b82f6", stocks: "#a855f7",
};
const CLASS_DESCRIPTIONS: Record<string, { what: string; why: string; risk: string }> = {
  cash: {
    what: "Dinero líquido: euros, dólares o stablecoins.",
    why: "Cubrir gastos de emergencia y tener munición para oportunidades. Pero demasiado cash pierde contra la inflación.",
    risk: "Bajo riesgo nominal, pero pierde poder adquisitivo ~2-3%/año.",
  },
  etfs: {
    what: "Fondos cotizados que replican índices (MSCI World, Momentum…).",
    why: "Exposición diversificada a mercados globales. Núcleo de cualquier cartera balanceada.",
    risk: "Medio. Cae -20% a -35% en recesión, se recupera en 1-3 años.",
  },
  crypto: {
    what: "Monedas digitales: BTC, ETH, SOL, etc.",
    why: "Alto potencial de crecimiento, descorrelacionado a ratos con bolsa tradicional.",
    risk: "Muy alto. Caídas -70%/-80% normales en ciclos. Position sizing crítico.",
  },
  gold: {
    what: "Oro físico via ETC (Exchange Traded Commodity).",
    why: "Refugio clásico contra inflación y crisis geopolíticas.",
    risk: "Bajo-medio. Volátil, pero descorrelacionado con bolsa.",
  },
  bonds: {
    what: "Bonos gubernamentales ligados a inflación.",
    why: "Ingresos estables, amortiguador cuando crypto/ETFs caen.",
    risk: "Bajo. Perdida moderada si suben tipos de interés.",
  },
  stocks: {
    what: "Plays temáticas: acciones con tesis (TTWO, NVDA, XLE, SAN, REP, AAPL…).",
    why: "Posiciones intencionales con entry/target/stop escritos antes de abrir. Cap por posición y máximo de posiciones simultáneas marcados por la policy.",
    risk: "Medio-alto. Más volátil que un ETF diversificado; cerrar si la tesis rompe el stop.",
  },
};

// ========== PIE CHART ==========
function AllocationPie({ targets }: { targets: Record<string, number> }) {
  const entries = Object.entries(targets).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let acc = 0;
  const radius = 80;
  const cx = 100;
  const cy = 100;

  const slices = entries.map(([cls, pct]) => {
    const startAngle = (acc / total) * 2 * Math.PI - Math.PI / 2;
    acc += pct;
    const endAngle = (acc / total) * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);
    const largeArc = pct / total > 0.5 ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return { cls, pct, d, color: CLASS_COLORS[cls] };
  });

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 200 200" className="w-44 h-44 shrink-0">
        {slices.map(s => (
          <path key={s.cls} d={s.d} fill={s.color} stroke="#0a0a0a" strokeWidth="1.5" />
        ))}
        <circle cx={cx} cy={cy} r={40} fill="#0a0a0a" />
        <text x={cx} y={cy - 2} textAnchor="middle" fill="#e4e4e7" fontSize="14" fontWeight="bold">Mi plan</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="#71717a" fontSize="10">100%</text>
      </svg>
      <div className="space-y-1.5">
        {slices.sort((a, b) => b.pct - a.pct).map(s => (
          <div key={s.cls} className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-zinc-300 w-28">{CLASS_LABELS[s.cls]}</span>
            <span className="font-semibold text-zinc-100 tabular-nums">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ========== F&G GAUGE ==========
function FearGreedGauge({ value }: { value: number }) {
  const angle = (value / 100) * 180 - 90;
  const needleLen = 75;
  const cx = 100, cy = 90;
  const x = cx + needleLen * Math.cos((angle - 90) * Math.PI / 180);
  const y = cy + needleLen * Math.sin((angle - 90) * Math.PI / 180);
  const bands = [
    { start: 0, end: 25, color: "#ef4444", label: "Miedo extremo" },
    { start: 25, end: 45, color: "#f97316", label: "Miedo" },
    { start: 45, end: 55, color: "#a3a3a3", label: "Neutral" },
    { start: 55, end: 75, color: "#10b981", label: "Codicia" },
    { start: 75, end: 100, color: "#ef4444", label: "Codicia extrema" },
  ];
  const arc = (start: number, end: number) => {
    const a1 = (start / 100) * 180 - 90;
    const a2 = (end / 100) * 180 - 90;
    const r = 85;
    const x1 = cx + r * Math.cos((a1 - 90) * Math.PI / 180);
    const y1 = cy + r * Math.sin((a1 - 90) * Math.PI / 180);
    const x2 = cx + r * Math.cos((a2 - 90) * Math.PI / 180);
    const y2 = cy + r * Math.sin((a2 - 90) * Math.PI / 180);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 120" className="w-full max-w-[240px]">
        {bands.map(b => (
          <path key={b.label} d={arc(b.start, b.end)} stroke={b.color} strokeWidth="14" fill="none" strokeLinecap="butt" />
        ))}
        <line x1={cx} y1={cy} x2={x} y2={y} stroke="#e4e4e7" strokeWidth="3" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill="#e4e4e7" />
        <text x={cx} y={cy + 25} textAnchor="middle" fill="#e4e4e7" fontSize="22" fontWeight="bold">{value}</text>
      </svg>
      <div className="flex justify-between w-full text-[10px] text-zinc-500 px-4 -mt-2">
        <span>0</span><span>50</span><span>100</span>
      </div>
    </div>
  );
}

// ========== CALENDAR VISUAL ==========
function DcaCalendar({ plans }: { plans: StrategyResp["plans"] }) {
  const active = plans.filter(p => p.enabled);
  return (
    <div className="space-y-2">
      {active.map(p => {
        const weeklyAmount = (p.amount / 4).toFixed(2);
        return (
          <div key={p.id} className="flex items-center gap-3 p-3 bg-zinc-800/40 rounded-lg">
            <div className="w-28 shrink-0">
              <div className="text-sm font-semibold text-zinc-200">{p.asset}</div>
              <div className="text-[11px] text-zinc-500">€{p.amount}/mes</div>
            </div>
            <div className="flex-1 grid grid-cols-4 gap-1.5">
              {[1, 2, 3, 4].map(w => (
                <div key={w} className="bg-zinc-900 rounded px-2 py-1.5 text-center">
                  <div className="text-[9px] text-zinc-500">Semana {w}</div>
                  <div className="text-xs font-semibold text-emerald-400">€{weeklyAmount}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ========== SECTION WRAPPER ==========
function Section({
  icon, title, subtitle, children,
}: {
  icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 text-emerald-400">
          {icon}
        </div>
        <div>
          <h2 className="text-xl font-bold text-zinc-100">{title}</h2>
          {subtitle && <p className="text-sm text-zinc-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="text-zinc-300 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

interface SubTargetRow {
  subClass: string;
  parentClass: string;
  targetPct: number;
}

// R2-B: Agrupación Core / Satellite / Legacy sobre sub_targets.
const SUB_GROUP: Record<string, "core" | "satellite" | "legacy"> = {
  cash_yield: "core",
  etf_core: "core",
  etf_factor: "core",
  bonds_infl: "core",
  gold: "core",
  crypto_core: "satellite",
  crypto_alt: "satellite",
  thematic_plays: "satellite",
  legacy_hold: "legacy",
};

const SUB_LABEL_LONG: Record<string, string> = {
  cash_yield: "Cash con rendimiento (stablecoin / MMF)",
  etf_core: "ETF core (MSCI World)",
  etf_factor: "ETF factor (Momentum / Value / EM)",
  bonds_infl: "Bonos ligados a inflación",
  gold: "Oro (ETC)",
  crypto_core: "Crypto core (BTC)",
  crypto_alt: "Crypto alt (ETH)",
  thematic_plays: "Thematic plays (acciones con tesis)",
  legacy_hold: "Legacy hold (SOL, PEPE — no aportar)",
};

const GROUP_META: Record<"core" | "satellite" | "legacy", { label: string; tagline: string; color: string }> = {
  core: {
    label: "Núcleo",
    tagline: "Diversificado, mecánico, absorbe la mayor parte del capital.",
    color: "#10b981",
  },
  satellite: {
    label: "Satélite",
    tagline: "Posiciones intencionales con tesis escrita y niveles de entrada/salida.",
    color: "#f59e0b",
  },
  legacy: {
    label: "Legacy",
    tagline: "Posiciones heredadas que no se aportan; se dejan diluir por inflow.",
    color: "#71717a",
  },
};

// ========== MAIN PAGE ==========
export default function GuidePage() {
  const [strategy, setStrategy] = useState<StrategyResp | null>(null);
  const [market, setMarket] = useState<Market | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [subs, setSubs] = useState<SubTargetRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, m, h, sub] = await Promise.all([
          fetch("/api/strategy").then(r => r.json()),
          fetch("/api/strategy/market").then(r => r.json()),
          fetch("/api/strategy/health").then(r => r.json()),
          fetch("/api/strategy/sub-targets").then(r => r.json()),
        ]);
        setStrategy(s); setMarket(m); setHealth(h);
        setSubs(sub.subTargets ?? []);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent" />
    </div>
  );
  if (!strategy || !market || !health) return <div className="text-red-400">Error cargando datos</div>;

  const { profile, plans, goals } = strategy;
  const targets = {
    cash: profile.targetCash, etfs: profile.targetEtfs, crypto: profile.targetCrypto,
    gold: profile.targetGold, bonds: profile.targetBonds, stocks: profile.targetStocks,
  };
  const activePlans = plans.filter(p => p.enabled);
  const totalMonthly = activePlans.reduce((s, p) => s + p.amount, 0);
  const fg = market.fearGreed.value;
  const sortedGoals = [...goals].sort((a, b) => a.priority - b.priority);
  const currentCash = health.allocation.find(a => a.class === "cash");
  const currentCrypto = health.allocation.find(a => a.class === "crypto");
  const policies = parseGuidePolicies(profile.policiesJson);
  const cryptoPctNow = currentCrypto?.current ?? 0;
  const cryptoPaused =
    policies != null && cryptoPctNow >= policies.multiplier.requiresCryptoUnderPct;
  // Suppress unused var lint.
  void profile.monthlyFixedExpenses;

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/strategy"
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded-lg hover:bg-zinc-800">
          <ArrowLeft className="w-4 h-4" /> Volver
        </Link>
      </div>

      <div className="bg-gradient-to-br from-emerald-900/30 via-zinc-900 to-zinc-900 border border-emerald-700/30 rounded-2xl p-6 md:p-8">
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 uppercase tracking-wider mb-2">
          <BookOpen className="w-4 h-4" /> Tu estrategia explicada
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-zinc-100 mb-3">
          {profile.tagline ?? "Aprende a invertir con tu propio plan"}
        </h1>
        <p className="text-zinc-400 text-base leading-relaxed">
          Esta guía te explica en cristiano cómo funciona tu estrategia <b>{profile.name}</b>, por qué cada decisión,
          y qué hacer ahora mismo. Ningún tecnicismo sin traducir, ninguna recomendación ciega.
        </p>
      </div>

      {profile.philosophy && (
        <Section
          icon={<Compass className="w-5 h-5" />}
          title="Filosofía de tu estrategia"
          subtitle="Por qué inviertes así">
          {profile.philosophy.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </Section>
      )}

      {/* 1. RESUMEN 60 SEGUNDOS */}
      <Section
        icon={<Zap className="w-5 h-5" />}
        title="Tu estrategia en 60 segundos"
        subtitle="Lo mínimo que necesitas saber">
        <div className="grid md:grid-cols-2 gap-3">
          <div className="bg-zinc-800/40 rounded-lg p-4">
            <div className="text-[10px] text-zinc-500 uppercase mb-1">Cómo inviertes</div>
            <div className="text-sm">
              <b>{totalMonthly}€/mes</b> repartidos en <b>{activePlans.length} activos</b>, comprando un poco cada semana (DCA).
            </div>
          </div>
          <div className="bg-zinc-800/40 rounded-lg p-4">
            <div className="text-[10px] text-zinc-500 uppercase mb-1">Mercado ahora</div>
            <div className="text-sm">
              Termómetro del miedo: <b>{fg}/100</b> — <span className="text-red-400 font-medium">{market.fearGreed.label}</span>.
              {cryptoPaused ? (
                <> Crypto <b>pausado</b> ({cryptoPctNow.toFixed(1)}% ≥ {policies?.multiplier.requiresCryptoUnderPct}% policy), DCA baseline ETFs/bonos/oro.</>
              ) : (
                <> Para ti esto es <b>buena ventana</b> — aplica el multiplicador del panel.</>
              )}
            </div>
          </div>
          <div className="bg-zinc-800/40 rounded-lg p-4">
            <div className="text-[10px] text-zinc-500 uppercase mb-1">Qué te toca hacer</div>
            <div className="text-sm">
              Ejecutar las <b>compras semanales</b> del panel principal. Si te saltas una, se acumula al mes.
            </div>
          </div>
          <div className="bg-zinc-800/40 rounded-lg p-4">
            <div className="text-[10px] text-zinc-500 uppercase mb-1">Gran objetivo</div>
            <div className="text-sm">
              Bajar tu cash de {currentCash?.current || "?"}% a {profile.targetCash}% y construir un portfolio diversificado.
            </div>
          </div>
        </div>
      </Section>

      {/* 2. QUÉ ES DCA */}
      <Section
        icon={<Calendar className="w-5 h-5" />}
        title="¿Qué es DCA y por qué lo usas?"
        subtitle="Dollar Cost Averaging — el método más simple para invertir bien">
        <p>
          <b>DCA</b> significa comprar una cantidad fija cada semana/mes, pase lo que pase con el precio.
          En vez de meter 1.000€ de golpe y rezar por acertar el momento, metes 250€ cada semana durante un mes.
        </p>
        <p className="text-zinc-400">
          <b>¿Por qué funciona?</b> Nadie acierta el suelo del mercado. Comprando poquito cada semana, tu precio medio
          suaviza los altibajos. Cuando baja, compras más unidades por el mismo dinero. Cuando sube, compras menos, pero
          lo que ya tenías vale más. Resultado: menos estrés, menos errores.
        </p>
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 text-sm">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              <b>Tu regla de oro:</b> ejecuta la compra semanal sin importar el precio. Si el mercado está en
              <span className="text-red-400"> miedo extremo</span>, puedes doblar. Si está en
              <span className="text-emerald-400"> codicia extrema</span>, reduce.
            </span>
          </div>
        </div>
      </Section>

      {/* 2.5 — PLAN DE AHORRO AUTOMÁTICO */}
      <Section
        icon={<Bot className="w-5 h-5" />}
        title="Plan de Ahorro (Sparplan) — DCA en autopiloto"
        subtitle="El broker hace las compras solo y FinTrack lo refleja">
        <p>
          Un <b>Plan de Ahorro</b> (también llamado Sparplan o Auto-Invest) es una compra
          recurrente que tu broker ejecuta solo, sin que tengas que meterte en la app.
          Configuras una vez: &quot;cada martes comprame 67,50€ de MSCI World&quot; y ya está.
        </p>
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 space-y-2">
          <div className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Por qué usarlo
          </div>
          <ul className="text-sm space-y-1 text-zinc-300 list-disc list-inside">
            <li><b>Gratis</b> en Trade Republic (0€ por ejecución vs 1€ en compra manual)</li>
            <li><b>Permite decimales</b> — puedes comprar 0,49 acciones de un ETF</li>
            <li><b>Elimina la disciplina</b> como problema — no puedes &quot;olvidarte&quot; porque lo hace solo</li>
            <li><b>DCA perfecto</b> — cada semana compra el mismo importe pase lo que pase con el precio</li>
          </ul>
        </div>

        <div className="space-y-3 mt-4">
          <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-emerald-400" /> Cómo activarlo (Trade Republic)
          </h3>
          <div className="bg-zinc-800/30 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex gap-3"><span className="text-emerald-400 font-bold shrink-0">1.</span> Abre Trade Republic → pestaña <b>Invertir</b></div>
            <div className="flex gap-3"><span className="text-emerald-400 font-bold shrink-0">2.</span> Busca el ETF/acción (p.ej. MSCI World) → pulsa <b>Plan de Ahorro</b></div>
            <div className="flex gap-3"><span className="text-emerald-400 font-bold shrink-0">3.</span> Importe: el que indique FinTrack (p.ej. 67,50€). Frecuencia: semanal. Día: martes</div>
            <div className="flex gap-3"><span className="text-emerald-400 font-bold shrink-0">4.</span> Confirma. A partir del próximo martes se ejecuta solo, gratis</div>
            <div className="flex gap-3"><span className="text-emerald-400 font-bold shrink-0">5.</span> Vuelve a FinTrack → Estrategia → busca ese plan → pulsa el rayo ⚡ al lado → activa &quot;Tengo este plan automatizado&quot; y marca el mismo día</div>
          </div>
        </div>

        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 space-y-2">
          <div className="text-sm font-semibold text-blue-400 flex items-center gap-2">
            <Bot className="w-4 h-4" /> Qué pasa después
          </div>
          <ul className="text-sm space-y-1 text-zinc-300 list-disc list-inside">
            <li>Cada semana, cuando pase el día configurado, el plan se marca como <span className="text-blue-400 font-medium">🤖 Hecho auto</span> en la lista</li>
            <li>No tienes que confirmar nada en FinTrack — la compra se da por hecha</li>
            <li>Cuando quieras reflejar la compra real (con precio y unidades exactas), pulsa <b>Comprar → Sync exchange</b> y se vinculará la transacción</li>
            <li>Si un día quieres saltarte una semana, desactiva el plan en Trade Republic. En FinTrack quita el &quot;Plan automatizado&quot; y volverá a aparecer como pendiente manual</li>
          </ul>
        </div>

        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-200">
          <b>Nota:</b> el Plan de Ahorro de Trade Republic es <b>gratis</b>. La comisión de 1€ que ves
          solo aplica a compras puntuales manuales (fuera del plan). Binance también tiene su propio
          &quot;Plan de Compra Automática&quot; que funciona igual.
        </div>
      </Section>

      {/* 3. DISTRIBUCIÓN */}
      <Section
        icon={<Layers className="w-5 h-5" />}
        title="Tu distribución objetivo"
        subtitle="Por qué reparto así el dinero">
        <div className="bg-zinc-800/30 rounded-xl p-5">
          <AllocationPie targets={targets} />
        </div>

        {/* R2-B: breakdown Core / Satellite / Legacy desde sub-targets */}
        {subs.length > 0 && (
          <div className="space-y-3 mt-4">
            <div className="text-xs uppercase tracking-wider text-zinc-500">Desglose Core + Satellite</div>
            {(["core", "satellite", "legacy"] as const).map((grp) => {
              const rows = subs
                .filter((s) => SUB_GROUP[s.subClass] === grp)
                .sort((a, b) => b.targetPct - a.targetPct);
              if (rows.length === 0) return null;
              const total = rows.reduce((a, r) => a + r.targetPct, 0);
              const meta = GROUP_META[grp];
              return (
                <div key={grp} className="bg-zinc-800/30 rounded-xl p-4 border-l-4" style={{ borderColor: meta.color }}>
                  <div className="flex items-baseline justify-between mb-1">
                    <div>
                      <span className="text-base font-bold text-zinc-100">{meta.label}</span>
                      <span className="ml-2 text-sm font-semibold" style={{ color: meta.color }}>{total.toFixed(0)}%</span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 mb-3">{meta.tagline}</p>
                  <div className="space-y-1.5">
                    {rows.map((r) => (
                      <div key={r.subClass} className="flex items-center gap-2 text-sm">
                        <div className="flex-1 text-zinc-300">{SUB_LABEL_LONG[r.subClass] ?? r.subClass}</div>
                        <div className="w-32 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, (r.targetPct / Math.max(1, total)) * 100)}%`,
                              backgroundColor: meta.color,
                            }}
                          />
                        </div>
                        <div className="w-12 text-right font-mono tabular-nums text-zinc-200">{r.targetPct.toFixed(0)}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p>
          Cada clase de activo hace algo distinto. No metas todo en una — si se cae, te arruinas.
          Mezclar te da crecimiento, protección y liquidez a la vez.
        </p>
        <div className="space-y-3 mt-4">
          {Object.entries(targets).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([cls, pct]) => {
            const desc = CLASS_DESCRIPTIONS[cls];
            return (
              <div key={cls} className="bg-zinc-800/30 rounded-lg p-4 border-l-4" style={{ borderColor: CLASS_COLORS[cls] }}>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-lg font-bold text-zinc-100">{CLASS_LABELS[cls]}</span>
                  <span className="text-sm font-semibold" style={{ color: CLASS_COLORS[cls] }}>{pct}%</span>
                </div>
                <div className="text-sm space-y-1.5">
                  <div><span className="text-zinc-500">Qué es:</span> {desc.what}</div>
                  <div><span className="text-zinc-500">Por qué lo tienes:</span> {desc.why}</div>
                  <div><span className="text-zinc-500">Riesgo:</span> {desc.risk}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* 4. F&G EXPLICADO */}
      <Section
        icon={<Thermometer className="w-5 h-5" />}
        title="El termómetro del mercado"
        subtitle="Fear & Greed Index — cómo saber si el mercado tiene miedo o euforia">
        <p>
          El <b>Fear & Greed</b> es un índice de 0 a 100 que mide el humor de los inversores en crypto.
          Se construye con volatilidad, volumen, redes sociales, búsquedas en Google, etc.
        </p>
        <div className="bg-zinc-800/30 rounded-xl p-5 space-y-3">
          <FearGreedGauge value={fg} />
          <div className="text-center">
            <div className="text-2xl font-bold text-zinc-100">{fg} — {market.fearGreed.label}</div>
            <div className="text-sm text-emerald-400 mt-1">Tu acción: {market.dcaMultiplier.label}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          {(() => {
            const thr = policies?.multiplier.fgThreshold ?? 24;
            const assets = (policies?.multiplier.appliesTo ?? ["BTC"]).join(", ");
            return [
              {
                range: `0-${thr}`,
                label: "Miedo extremo",
                action: cryptoPaused
                  ? `Normalmente ×2 en ${assets}. Pausado ahora: crypto en ${cryptoPctNow.toFixed(1)}% ≥ ${policies?.multiplier.requiresCryptoUnderPct ?? 17}%.`
                  : `Doblar compras en ${assets} (histórico mejor suelo).`,
                color: "text-red-400",
              },
              { range: `${thr + 1}-44`, label: "Miedo", action: "Aumentar DCA a ×1,5.", color: "text-orange-400" },
              { range: "45-55", label: "Neutral", action: "Ritmo normal.", color: "text-zinc-300" },
              { range: "56-74", label: "Codicia", action: "Reducir a ×0,75. Cuidado.", color: "text-emerald-400" },
              { range: "75-100", label: "Codicia extrema", action: "Tomar beneficios, reducir compras.", color: "text-red-400" },
            ];
          })().map(b => (
            <div key={b.range} className="bg-zinc-800/30 rounded-lg p-3">
              <div className={`text-xs font-semibold ${b.color}`}>{b.range} — {b.label}</div>
              <div className="text-xs text-zinc-400 mt-0.5">{b.action}</div>
            </div>
          ))}
        </div>
        <p className="text-zinc-400 text-sm">
          <b>Warren Buffett:</b> &quot;Sé codicioso cuando los demás tengan miedo, y temeroso cuando los demás sean codiciosos&quot;.
          El F&G es la versión numérica de esa idea.
        </p>
      </Section>

      {/* 5. CALENDARIO DCA */}
      <Section
        icon={<Calendar className="w-5 h-5" />}
        title="Tu calendario de compras"
        subtitle="Qué se compra cada semana">
        <p>
          Cada plan mensual se divide en 4 tramos semanales. Así compras 4 veces al mes, suavizando el precio medio.
          La página principal te indica qué te toca esta semana.
        </p>
        <DcaCalendar plans={plans} />
        <p className="text-zinc-400 text-xs mt-3">
          Total semanal: €{(totalMonthly / 4).toFixed(2)} · Total mensual: €{totalMonthly}
        </p>
      </Section>

      {/* 6. OBJETIVOS EXPLICADOS */}
      <Section
        icon={<PiggyBank className="w-5 h-5" />}
        title="Tus objetivos"
        subtitle="Qué persigues y por qué">
        {sortedGoals.map(g => {
          const progress = health.goalsProgress.find(p => p.id === g.id);
          const priorityLabel = g.priority === 1 ? "Alta" : g.priority === 2 ? "Media" : "Baja";
          const priorityColor = g.priority === 1 ? "text-red-400" : g.priority === 2 ? "text-amber-400" : "text-zinc-500";
          const typeLabel: Record<string, string> = {
            emergency_fund: "Fondo de emergencia",
            asset_target: "Acumular asset concreto",
            net_worth: "Patrimonio total",
            savings_rate: "Tasa de ahorro",
            custom: "Personalizado",
          };
          return (
            <div key={g.id} className="bg-zinc-800/30 rounded-lg p-4">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <h3 className="font-semibold text-zinc-100">{g.name}</h3>
                <span className={`text-xs ${priorityColor}`}>Prioridad {priorityLabel}</span>
              </div>
              <div className="text-xs text-zinc-500 mb-2">{typeLabel[g.type] || g.type}</div>
              {progress && (
                <>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-1">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progress.progress}%` }} />
                  </div>
                  <div className="text-xs text-zinc-500">
                    Progreso: <span className="text-zinc-300 font-medium">{progress.progress}%</span>
                    {g.targetUnit === "EUR" && ` · €${Math.round(progress.currentValue).toLocaleString("es-ES")} de €${g.targetValue.toLocaleString("es-ES")}`}
                    {g.targetUnit === "units" && ` · ${progress.currentValue.toFixed(4)} de ${g.targetValue} ${g.targetAsset}`}
                    {g.targetUnit === "percent" && ` · ${progress.currentValue.toFixed(1)}% actual vs ${g.targetValue}% objetivo`}
                  </div>
                </>
              )}
              {g.notes && <div className="text-xs text-zinc-400 mt-2 italic">{g.notes}</div>}
            </div>
          );
        })}
      </Section>

      {/* 7. QUÉ HACER ESTA SEMANA */}
      <Section
        icon={<ListChecks className="w-5 h-5" />}
        title="Qué hacer esta semana"
        subtitle="Checklist paso a paso">
        <div className="space-y-2">
          {[
            "Primera vez — activa Planes de Ahorro (Sparplan) en Trade Republic para ETFs/acciones. Son gratis y lo hacen solo cada semana. Ver sección 'Plan de Ahorro' arriba.",
            "Después de activarlos en TR, vuelve a FinTrack, pulsa el rayo ⚡ de cada plan y marca 'Tengo este plan automatizado' con el día que configuraste.",
            cryptoPaused
              ? `Crypto pausado: la allocation actual (${cryptoPctNow.toFixed(1)}%) está por encima del umbral de policy (${policies?.multiplier.requiresCryptoUnderPct}%). No añadas a BTC/ETH/SOL hasta que baje el peso — DCA va a ETFs/bonos/oro.`
              : "Para crypto, sigue las reglas de la policy: si hay ventana BTC-only, Binance puede configurar un Plan de Compra Automática sólo sobre BTC; el resto queda en hold.",
            "Cada semana entra en Estrategia y mira la lista 'Esta semana'. Lo que esté en azul es automático (ya pasó el día = hecho). Lo que esté en gris aún tienes que comprar manualmente.",
            "Para pendientes manuales, pulsa 'Comprar' → Sync desde exchange (si ya la hiciste) o Manual (si quieres meterla a mano).",
            cryptoPaused
              ? "Multiplicador F&G: está desactivado mientras crypto supere el umbral. El panel muestra el importe base, no se dobla nada."
              : `Multiplicador F&G: el boost ×2 dispara cuando el índice ≤ ${policies?.multiplier.fgThreshold ?? 24} y sólo aplica a ${(policies?.multiplier.appliesTo ?? ["BTC"]).join(", ")}. La lista ya muestra el importe aplicado — no multipliques a mano.`,
            "Si te saltas una semana manual, no pasa nada. La siguiente dobla. Lo único que NO vale es olvidarse del mes entero.",
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-zinc-800/30 rounded-lg">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </div>
              <span className="text-sm">{step}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* 8. QUÉ NO HACER */}
      <Section
        icon={<AlertTriangle className="w-5 h-5" />}
        title="Qué NO hacer ahora"
        subtitle="Errores típicos en estas condiciones de mercado">
        <div className="space-y-2">
          {[
            { t: "Meter todo de golpe", why: "Si te equivocas con el momento, asumes toda la pérdida. DCA lo evita." },
            { t: "Vender crypto para 'tomar beneficios'", why: "Estamos en miedo extremo. Históricamente es la peor zona para vender. Además, cada venta tributa a Hacienda." },
            { t: "Comprar porque algo subió mucho", why: "Si un asset tiene el termómetro en rojo (sobrecomprado), espera a que corrija. Comprar caro = comprar poco." },
            { t: "Saltarse el fondo de emergencia", why: "Mantén 3-6 meses de gastos en líquido. Si no, una avería del coche te fuerza a vender en el peor momento." },
            { t: "Cambiar la estrategia cada semana", why: "El plan funciona con disciplina. Si cambias los objetivos cada vez que ves una noticia, nunca compondrás." },
            { t: "Olvidar el coste fiscal", why: "En España cada venta crypto tributa (FIFO). Vender para rebalancear sin calcular el IRPF puede costar cientos de €." },
          ].map((x, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
              <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-zinc-100 text-sm">{x.t}</div>
                <div className="text-xs text-zinc-400 mt-0.5">{x.why}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 9. GLOSARIO */}
      <Section
        icon={<BookOpen className="w-5 h-5" />}
        title="Glosario rápido"
        subtitle="Términos que vas a ver">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { t: "DCA (Dollar Cost Averaging)", d: "Comprar una cantidad fija cada semana/mes." },
            { t: "Allocation / distribución", d: "Cómo repartes tu dinero entre tipos de activo." },
            { t: "Drift", d: "Cuánto se ha desviado tu distribución real de la objetivo." },
            { t: "Rebalanceo", d: "Ajustar la distribución cuando se desvía mucho (comprando lo que falta, no vendiendo)." },
            { t: "Emergency fund", d: "Dinero líquido equivalente a 3-6 meses de gastos, intocable para inversión." },
            { t: "Fear & Greed", d: "Índice de 0 a 100 que mide pánico o euforia del mercado crypto." },
            { t: "Volatilidad", d: "Cuánto se mueve el precio. Alta = oscila mucho. Crypto tiene volatilidad alta." },
            { t: "Cost basis", d: "Precio medio al que compraste un asset. Se usa para calcular impuestos." },
            { t: "FIFO (First In First Out)", d: "Método fiscal: Hacienda asume que vendes las unidades que compraste primero." },
            { t: "IRPF plusvalías", d: "Impuesto sobre ganancias de inversión en España (19% a 28% según importe)." },
            { t: "Stablecoin", d: "Crypto anclada al dólar/euro (USDC, USDT). Se trata como cash pero en exchange." },
            { t: "Position sizing", d: "Decidir cuánto dinero meter en cada operación según el riesgo." },
          ].map(g => (
            <div key={g.t} className="bg-zinc-800/30 rounded-lg p-3">
              <div className="font-semibold text-sm text-zinc-200">{g.t}</div>
              <div className="text-xs text-zinc-400 mt-1">{g.d}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* 10. FISCALIDAD */}
      <Section
        icon={<Shield className="w-5 h-5" />}
        title="Fiscalidad en España"
        subtitle="Lo justo para no meterte en líos">
        <p>
          Cuando vendes un asset con beneficio, pagas IRPF por la ganancia (la plusvalía). En España los tramos de 2026 son:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left py-2 font-normal">Tramo de ganancia</th>
                <th className="text-right py-2 font-normal">Tipo IRPF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {[
                { r: "0 — 6.000 €", t: "19%" },
                { r: "6.001 — 50.000 €", t: "21%" },
                { r: "50.001 — 200.000 €", t: "23%" },
                { r: "200.001 — 300.000 €", t: "27%" },
                { r: "> 300.000 €", t: "28%" },
              ].map(r => (
                <tr key={r.r} className="text-zinc-300">
                  <td className="py-2">{r.r}</td>
                  <td className="py-2 text-right font-semibold">{r.t}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-2 mt-4 text-sm">
          <div className="flex items-start gap-2"><span className="text-amber-400">•</span><span><b>Crypto:</b> cada venta (o swap entre cryptos) es hecho imponible. No solo cuando pasas a euros.</span></div>
          <div className="flex items-start gap-2"><span className="text-amber-400">•</span><span><b>Método FIFO:</b> Hacienda asume que vendes primero lo que compraste primero.</span></div>
          <div className="flex items-start gap-2"><span className="text-amber-400">•</span><span><b>Pérdidas crypto</b> solo compensan ganancias crypto, y durante 4 años.</span></div>
          <div className="flex items-start gap-2"><span className="text-amber-400">•</span><span><b>Modelo 721:</b> si tienes más de 50.000 € en crypto en exchanges extranjeros, declaración obligatoria.</span></div>
          <div className="flex items-start gap-2"><span className="text-amber-400">•</span><span><b>ETFs UCITS</b> (europeos) tributan solo al vender, como el resto.</span></div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-300 mt-4">
          <b>Importante:</b> esta guía es informativa. Para casos complejos (herencia, mudanza fiscal, grandes ventas), consulta un asesor fiscal.
        </div>
      </Section>

      {/* R2-D: Sistema Intel */}
      <Section
        icon={<Eye className="w-5 h-5" />}
        title="Sistema Intel — el vigía automático"
        subtitle="Research, opportunity y thesis watch trabajan en background">
        <p>
          FinTrack incluye un sistema <b>Intel</b> que vigila tu cartera y el mercado
          sin que tengas que mirar gráficos cada día. Tres motores trabajan en paralelo:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <div className="bg-zinc-800/30 rounded-lg p-4 border-l-4 border-blue-500/60">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4 text-blue-400" />
              <h3 className="font-semibold text-zinc-100">Research Drawer</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Abres una ficha por ticker. Un agente Claude recoge datos (RSI, fundamentales, correlación con tu cartera, noticias) y emite un verdict: <span className="text-emerald-400">candidate</span>, <span className="text-amber-400">wait</span> o <span className="text-red-400">archive</span>. Lo usas para decidir si promover a watchlist.
            </p>
            <Link href="/intel/research" className="inline-block mt-3 text-xs text-blue-400 hover:underline">
              Ir a /intel/research →
            </Link>
          </div>

          <div className="bg-zinc-800/30 rounded-lg p-4 border-l-4 border-amber-500/60">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-amber-400" />
              <h3 className="font-semibold text-zinc-100">Opportunity detector</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Una vez que un ticker está en watchlist, el detector dispara señales cuando cumple reglas objetivas: precio dentro de la ventana de entrada, RSI sobrevendido, sub-clase infraponderada o catalizador próximo.
            </p>
            <p className="text-xs text-zinc-500 italic mt-2">
              Severity <b>med</b> = 1 regla, <b>high</b> = 2+ reglas alineadas.
            </p>
          </div>

          <div className="bg-zinc-800/30 rounded-lg p-4 border-l-4 border-red-500/60">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <h3 className="font-semibold text-zinc-100">Thesis watch</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Si tienes la posición abierta, Intel vigila los niveles escritos al abrirla:
              <span className="text-red-400"> 🛑 stop hit</span>,
              <span className="text-amber-400"> ⚠️ near stop</span>,
              <span className="text-emerald-400"> 🎯 target hit</span>,
              <span className="text-zinc-400"> ⏳ tesis caducada</span>.
              Todos los stops son SOFT — emite señal, nunca lanza orden sola al broker.
            </p>
          </div>
        </div>

        <div className="bg-zinc-800/30 rounded-xl p-4 mt-4 text-sm">
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Flujo típico</div>
          <ol className="space-y-1.5 text-zinc-300 list-decimal list-inside">
            <li>Se te ocurre un ticker → POST a <code className="text-xs bg-zinc-900 px-1 rounded">/intel/research</code>.</li>
            <li>Claude rellena dossier en 1-2 min → revisas y promueves a <b>watching</b> con entry/target/stop/horizon.</li>
            <li>Opportunity detector vigila precio y dispara señal cuando entre en la ventana.</li>
            <li>Si abres la posición → <b>open_position</b>, y thesis_watch empieza a vigilar stops/target.</li>
            <li>Cierre al hit, al stop, o al expirar → status <b>closed</b>, se archiva con el verdict final.</li>
          </ol>
        </div>
      </Section>

      {/* 11. NOTAS DEL PLAN */}
      {profile.notes && (
        <Section
          icon={<Compass className="w-5 h-5" />}
          title="Notas actuales del plan"
          subtitle="Contexto específico de tu estrategia ahora mismo">
          <div className="bg-zinc-800/30 rounded-lg p-4 text-sm leading-relaxed">
            {profile.notes}
          </div>
        </Section>
      )}

      {/* Disclaimer */}
      <div className="text-xs text-zinc-500 text-center leading-relaxed py-6 border-t border-zinc-800">
        Esta información es educativa y se basa en tu estrategia guardada en FinTrack.
        No constituye asesoramiento financiero regulado. Decisiones y riesgos, tuyos.
      </div>
    </div>
  );
}
