import { Component, lazy, Suspense, useMemo, useRef, useState, type ReactNode } from "react";
import type { Scenario, TraderState } from "../../types";
import { decideGl, hasWebGL2, useFinePointer, useOnScreen, usePageVisible, useReducedMotion } from "../../lib/env";
import { BANDS } from "../../lib/heat";
import { pp, signedPct } from "../../lib/format";
import { theaterPositions, thesisConfirmation } from "../../lib/derive";
import { useUi } from "../../lib/store";
import FlatMap from "./FlatMap";
import { buildMapModel } from "./mapModel";

const Globe = lazy(() => import("./globe/Globe"));

export interface TipTarget {
  kind: "scenario" | "lane";
  id: string;
  scenario: string;
  x: number;
  y: number;
}

class GlBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function TheaterMap({
  scenarios,
  activeKey,
  onSelect,
  trader
}: {
  scenarios: Scenario[];
  activeKey: string;
  onSelect: (key: string) => void;
  trader: TraderState | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const fine = useFinePointer();
  const onScreen = useOnScreen(ref, "80px");
  const visible = usePageVisible();
  const glPref = useUi((s) => s.glPref);
  const setGlPref = useUi((s) => s.setGlPref);
  const [tip, setTip] = useState<TipTarget | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const model = useMemo(() => buildMapModel(scenarios), [scenarios]);
  const useGl = decideGl(glPref, reduced, fine);
  const running = useGl && onScreen && visible && !reduced;

  const flat = <FlatMap model={model} activeKey={activeKey} onSelect={onSelect} reducedMotion={reduced} onTip={setTip} />;

  return (
    <div ref={ref} className="relative h-full min-h-[260px] w-full overflow-hidden rounded-[inherit]" data-map={useGl ? "globe" : "flat"}>
      {useGl ? (
        <GlBoundary fallback={flat}>
          <Suspense fallback={<div className="absolute inset-0 grid place-items-center"><span className="label">Loading globe…</span></div>}>
            <Globe model={model} activeKey={activeKey} onSelect={onSelect} running={running} reducedMotion={reduced} onTip={setTip} resetSignal={resetSignal} />
          </Suspense>
        </GlBoundary>
      ) : (
        flat
      )}

      {/* Legend + controls: solid panels, never backdrop blur over the live canvas. */}
      <div className="pointer-events-none absolute bottom-3 left-3 max-w-[calc(100%-24px)]">
        <div className="pointer-events-auto rounded-lg border border-line bg-panel-solid px-2.5 py-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {BANDS.map((b) => (
              <span key={b.key} className="num inline-flex items-center gap-1.5 text-[10px] tracking-[0.1em] text-dim">
                <i className="block h-[7px] w-[7px] rounded-full" style={{ background: b.color }} />
                {b.label.toUpperCase()}
              </span>
            ))}
          </div>
          <div className="mt-1 text-[10.5px] text-muted">Routes are illustrative transmission paths, not vessel tracks.</div>
          {model.unmapped.length > 0 && <div className="mt-1 text-[10.5px] text-muted">Unmapped: {model.unmapped.map((s) => s.title).join(", ")}</div>}
        </div>
      </div>
      <div className="pointer-events-none absolute right-3 top-3">
        <div className="pointer-events-auto flex gap-1.5">
          {useGl && (
            <button type="button" className="btn h-7 bg-panel-solid px-2 text-[11px]" onClick={() => setResetSignal((n) => n + 1)} title="Frame all theaters">
              All theaters
            </button>
          )}
          {hasWebGL2() && (
            <button
              type="button"
              className="btn h-7 bg-panel-solid px-2 text-[11px]"
              onClick={() => setGlPref(useGl ? "off" : "on")}
              aria-pressed={useGl}
              title={useGl ? "Switch to the flat map" : "Switch to the 3D globe"}
            >
              {useGl ? "2D" : "3D"}
            </button>
          )}
        </div>
      </div>

      {tip && <MapTip tip={tip} scenarios={scenarios} trader={trader} model={model} />}
    </div>
  );
}

function MapTip({ tip, scenarios, trader, model }: { tip: TipTarget; scenarios: Scenario[]; trader: TraderState | null; model: ReturnType<typeof buildMapModel> }) {
  const s = scenarios.find((x) => x.key === tip.scenario);
  if (!s) return null;
  const style = { left: `clamp(136px, ${tip.x}px, calc(100% - 136px))`, top: `min(${tip.y}px, calc(100% - 150px))` } as const;
  if (tip.kind === "lane") {
    const lane = model.lanes.find((l) => l.id === tip.id && l.scenario === tip.scenario);
    if (!lane) return null;
    return (
      <div className="pointer-events-none absolute z-10 w-64 -translate-x-1/2 translate-y-3 rounded-lg border border-line-2 bg-panel-solid p-3 shadow-2xl" style={style} role="tooltip">
        <div className="label mb-1">{s.title}</div>
        <div className="text-[13px] font-semibold">{lane.label}</div>
        {lane.subScore && (
          <div className="num mt-1 text-[11px] text-dim">
            {lane.subScore}: <span style={{ color: lane.band.color }}>{s.subScores.find((x) => x.label === lane.subScore)?.value ?? "—"}</span>
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1">
          {lane.sectors.map((x) => (
            <span key={x} className="chip h-5 text-[10.5px]">
              {x}
            </span>
          ))}
        </div>
        <div className="mt-2 text-[10.5px] text-muted">Matching trades are highlighted in the table.</div>
      </div>
    );
  }
  const conf = thesisConfirmation(s);
  const held = theaterPositions(trader, s.key);
  const hot = model.hotspots.find((h) => h.key === s.key);
  return (
    <div className="pointer-events-none absolute z-10 w-64 -translate-x-1/2 translate-y-4 rounded-lg border border-line-2 bg-panel-solid p-3 shadow-2xl" style={style} role="tooltip">
      <div className="label mb-1">{s.geo?.label}</div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold">{s.title}</span>
        <span className="display text-[20px] leading-none" style={{ color: hot?.band.color }}>
          {s.heat}
        </span>
      </div>
      <dl className="num mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-muted">Band</dt>
        <dd className="text-right" style={{ color: hot?.band.color }}>
          {hot?.band.label}
        </dd>
        <dt className="text-muted">Market confirms</dt>
        <dd className="text-right" style={{ color: conf == null ? undefined : conf >= 0 ? "var(--color-long)" : "var(--color-short)" }}>
          {pp(conf)}
        </dd>
        <dt className="text-muted">AI book</dt>
        <dd className="text-right text-dim">
          {held.length ? held.map((p) => `${p.ticker} ${signedPct(p.unrealizedPct, 1)}`).join(" · ") : "no positions"}
        </dd>
      </dl>
    </div>
  );
}
