import { useCallback, useEffect, useMemo } from "react";
import { useData } from "../../lib/data";
import { navigate, useRoute } from "../../lib/router";
import { useUi } from "../../lib/store";
import { TheaterMap } from "../map/TheaterMap";
import { Skeleton } from "../ui/primitives";
import { Drivers, Effects, Headlines, Indicators, Methodology } from "./DeskPanels";
import { ScenarioRail } from "./ScenarioRail";
import { SinceLastStrip } from "./SinceLastStrip";
import { TheaterCard } from "./TheaterCard";
import { TradesTable } from "./TradesTable";

export function DashboardPage() {
  const { refresh, trader, baseline, traderBaseline, reload } = useData();
  const route = useRoute();
  const lastScenario = useUi((s) => s.lastScenario);
  const setLastScenario = useUi((s) => s.setLastScenario);
  const payload = refresh.data;
  const scenarios = useMemo(() => (payload ? Object.values(payload.scenarios) : []), [payload]);

  const activeKey =
    (route.scenario && payload?.scenarios[route.scenario] && route.scenario) ||
    (lastScenario && payload?.scenarios[lastScenario] && lastScenario) ||
    scenarios[0]?.key ||
    "";

  useEffect(() => {
    if (activeKey) setLastScenario(activeKey);
  }, [activeKey, setLastScenario]);

  const select = useCallback((key: string) => navigate({ page: "dashboard", scenario: key }, { replace: true }), []);

  // 1-9 jump to a theater, j/k step through them.
  useEffect(() => {
    if (!scenarios.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      const idx = scenarios.findIndex((s) => s.key === activeKey);
      if (/^[1-9]$/.test(e.key)) {
        const s = scenarios[Number(e.key) - 1];
        if (s) select(s.key);
      } else if (e.key === "j" || e.key === "k") {
        const next = scenarios[(idx + (e.key === "j" ? 1 : -1) + scenarios.length) % scenarios.length];
        select(next.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scenarios, activeKey, select]);

  if (!payload) {
    if (refresh.status === "error") {
      return (
        <div className="panel mx-auto mt-10 max-w-lg p-6 text-center">
          <div className="label mb-2">Could not load the desk</div>
          <p className="text-[14px] text-dim">{refresh.error}</p>
          <button type="button" className="btn btn-accent mt-4" onClick={reload}>
            Try again
          </button>
        </div>
      );
    }
    return <DashboardSkeleton />;
  }

  const scenario = payload.scenarios[activeKey];
  if (!scenario) return null;
  const traderState = trader.data?.state ?? null;

  return (
    <div className="flex flex-col gap-4">
      <SinceLastStrip current={payload} baseline={baseline} trader={trader.data} traderBaseline={traderBaseline} onSelect={select} />

      <section aria-label="Theater map" className="grid grid-cols-1 gap-4 lg:h-[min(600px,calc(100dvh-150px))] lg:min-h-[520px] lg:grid-cols-[minmax(0,1.6fr)_minmax(360px,1fr)]">
        <div className="panel panel-solid relative h-[300px] overflow-hidden sm:h-[380px] lg:h-auto">
          <TheaterMap scenarios={scenarios} activeKey={activeKey} onSelect={select} trader={traderState} />
        </div>
        <div className="lg:hidden">
          <ScenarioRail scenarios={scenarios} activeKey={activeKey} onSelect={select} baseline={baseline} />
        </div>
        <TheaterCard scenario={scenario} index={scenarios.indexOf(scenario)} total={scenarios.length} baseline={baseline} trader={traderState} />
      </section>

      <div className="hidden lg:block">
        <ScenarioRail scenarios={scenarios} activeKey={activeKey} onSelect={select} baseline={baseline} />
      </div>

      <TradesTable scenario={scenario} payload={payload} trader={traderState} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Drivers scenario={scenario} />
        <Indicators scenario={scenario} />
        <Effects scenario={scenario} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Headlines scenario={scenario} baseline={baseline} />
        <Methodology payload={payload} />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading desk">
      <Skeleton className="h-6 w-2/3" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(360px,1fr)]">
        <Skeleton className="h-[300px] rounded-[14px] lg:h-[520px]" />
        <Skeleton className="h-[420px] rounded-[14px] lg:h-[520px]" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[84px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[420px] rounded-[14px]" />
    </div>
  );
}
