"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Target, AlertTriangle, Clock, Edit3, Info, TrendingUp, BookOpen,
} from "lucide-react";
import {
  useStrategyFull,
  useStrategyHealth,
  useSchedule,
  useStrategyMarket,
  useInvalidateStrategyViews,
} from "@/lib/hooks/use-strategy-data";
import { usePrivacy } from "@/components/privacy-provider";
import { AllocationRing } from "@/components/strategy/allocation-ring";
import { GoalsStack } from "@/components/strategy/goals-stack";
import { MarketStrip } from "@/components/strategy/market-strip";
import { WeeklyShoppingList } from "@/components/strategy/weekly-shopping-list";
import { WeeklySchedule } from "@/components/strategy/weekly-schedule";
import { MonthProgress } from "@/components/strategy/month-progress";
import { EmergencyCard } from "@/components/strategy/emergency-card";
import { Collapsible } from "@/components/strategy/collapsible";
import { DcaPlansList } from "@/components/strategy/dca-plans-list";
import { HistoryTable } from "@/components/strategy/history-table";
import { DcaExecuteDrawer } from "@/components/strategy/dca-execute-drawer";
import { AutoPlanModal } from "@/components/strategy/auto-plan-modal";
import { EditProfileModal } from "@/components/strategy/edit-profile-modal";
import { AddGoalModal } from "@/components/strategy/add-goal-modal";
import { StrategySkeleton } from "@/components/strategy/strategy-skeleton";
import { WatchlistCard } from "@/components/strategy/watchlist-card";
import type {
  DcaPlan, HealthData, MarketData, ScheduleData, StrategyData, StrategyProfile, SubTargetForm,
} from "@/components/strategy/types";

export default function StrategyPage() {
  const { mask } = usePrivacy();
  const { data: strategy, isLoading: strategyLoading } = useStrategyFull<StrategyData>();
  const { data: health, isLoading: healthLoading } = useStrategyHealth<HealthData>();
  const { data: schedule } = useSchedule();
  const { data: market } = useStrategyMarket<MarketData>();
  const invalidate = useInvalidateStrategyViews();
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [executingPlan, setExecutingPlan] = useState<DcaPlan | null>(null);
  const [configAutoPlan, setConfigAutoPlan] = useState<DcaPlan | null>(null);
  const loading = strategyLoading || healthLoading;

  const handleSaveProfile = async (payload: {
    profileUpdate: Partial<StrategyProfile>;
    subTargets: SubTargetForm[];
  }) => {
    const subRes = await fetch("/api/strategy/sub-targets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: payload.profileUpdate.id,
        subTargets: payload.subTargets,
      }),
    });
    if (!subRes.ok) {
      const err = await subRes.json().catch(() => ({}));
      console.error("[save-profile] sub-targets failed:", err);
      alert(`Error al guardar allocation: ${err.error ?? "ver consola"}`);
      return;
    }
    await fetch("/api/strategy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload.profileUpdate),
    });
    setShowEditProfile(false);
    invalidate();
  };

  const handleAddGoal = async (data: Record<string, unknown>) => {
    await fetch("/api/strategy/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setShowAddGoal(false);
    invalidate();
  };

  const handleToggleGoal = async (id: number, completed: boolean) => {
    await fetch("/api/strategy/goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, completed }),
    });
    invalidate();
  };

  const handleExecuteDCA = async (data: { planId: number; amount: number; price?: number; units?: number; notes?: string }) => {
    const res = await fetch("/api/strategy/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setExecutingPlan(null);
      invalidate();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(`Error: ${err.error ?? "no se pudo registrar la compra"}`);
    }
  };

  const handleSaveAutoPlan = async (data: { autoExecute: boolean; autoDayOfWeek: number | null; autoStartDate: string | null; broker: string | null }) => {
    if (!configAutoPlan) return;
    await fetch("/api/plans", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: configAutoPlan.id, ...data }),
    });
    setConfigAutoPlan(null);
    invalidate();
  };

  if (loading) return <StrategySkeleton />;
  if (!strategy || !health) return <div className="text-danger">Error cargando estrategia</div>;

  const { profile, plans, executions } = strategy;
  const { allocation, warnings, dcaSummary, emergency } = health;
  const goalsWithProgress = health.goalsProgress;

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Target className="w-7 h-7 text-success" />
            {profile.name}
          </h1>
          {warnings.length > 0 && (
            <div className="flex items-center gap-1 mt-1 text-xs text-warn">
              <AlertTriangle className="w-3 h-3" /> {warnings[0]}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/strategy/guide"
            className="flex items-center gap-2 px-4 py-2 bg-success-soft hover:opacity-90 text-success rounded-lg text-sm font-medium border border-success/30">
            <BookOpen className="w-4 h-4" /> Aprender mi estrategia
          </Link>
          <button onClick={() => setShowEditProfile(true)}
            className="flex items-center gap-2 px-4 py-2 bg-elevated hover:bg-elevated rounded-lg text-sm font-medium border border-border-strong">
            <Edit3 className="w-4 h-4" /> Editar objetivos
          </button>
        </div>
      </div>

      <MarketStrip market={market ?? null} netWorth={market?.finances.netWorth || 0} />

      <WeeklyShoppingList schedule={schedule ?? null} plans={plans} onExecute={setExecutingPlan} />

      <WeeklySchedule schedule={schedule ?? null} plans={plans} onExecute={setExecutingPlan} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MonthProgress schedule={schedule ?? null} totalMonthly={dcaSummary.totalMonthly} />
        <EmergencyCard emergency={emergency} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <GoalsStack goals={goalsWithProgress} onToggle={handleToggleGoal} onAdd={() => setShowAddGoal(true)} />
        <AllocationRing allocation={allocation} />
      </div>

      <WatchlistCard />

      <Collapsible
        title="Planes DCA"
        icon={<TrendingUp className="w-4 h-4 text-info" />}
        badge={`${dcaSummary.activePlans} activos · ${mask(`€${dcaSummary.totalMonthly}`)}/mes`}>
        <DcaPlansList plans={plans} executions={executions}
          onExecute={setExecutingPlan}
          onConfigAuto={setConfigAutoPlan}
          monthlyInvest={profile.monthlyInvest} />
      </Collapsible>

      <Collapsible
        title="Historial de compras"
        icon={<Clock className="w-4 h-4 text-muted-foreground" />}
        badge={`${executions.length} ejecuciones`}>
        <HistoryTable executions={executions} plans={plans} />
      </Collapsible>

      {profile.notes && (
        <div className="bg-card border border-border rounded-xl p-4 text-xs text-muted-foreground leading-relaxed">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <Info className="w-3 h-3" /> Notas del plan
          </div>
          {profile.notes}
        </div>
      )}

      {showEditProfile && <EditProfileModal profile={profile} onClose={() => setShowEditProfile(false)} onSave={handleSaveProfile} />}
      {showAddGoal && <AddGoalModal profileId={profile.id} onClose={() => setShowAddGoal(false)} onSave={handleAddGoal} />}
      <DcaExecuteDrawer plan={executingPlan} onClose={() => setExecutingPlan(null)} onSubmit={handleExecuteDCA} onSync={invalidate} />
      {configAutoPlan && <AutoPlanModal plan={configAutoPlan} onClose={() => setConfigAutoPlan(null)} onSave={handleSaveAutoPlan} />}
    </div>
  );
}
