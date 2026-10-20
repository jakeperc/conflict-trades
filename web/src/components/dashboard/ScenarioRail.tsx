import type { RefreshPayload, Scenario } from "../../types";
import { heatBand } from "../../lib/heat";
import { signedInt, shortScenarioLabel } from "../../lib/format";
import { thesisConfirmation } from "../../lib/derive";
import { useUi } from "../../lib/store";

export function ScenarioRail({
  scenarios,
  activeKey,
  onSelect,
  baseline
}: {
  scenarios: Scenario[];
  activeKey: string;
  onSelect: (key: string) => void;
  baseline: RefreshPayload | null;
}) {
  const setHoverScenario = useUi((s) => s.setHoverScenario);
  const hoverScenario = useUi((s) => s.hoverScenario);
  const mapped = scenarios.filter((s) => s.geo);
  const unmapped = scenarios.filter((s) => !s.geo);

  const card = (s: Scenario, i: number) => {
    const band = heatBand(s.heat);
    const prev = baseline?.scenarios?.[s.key];
    const d = prev ? s.heat - prev.heat : null;
    const active = s.key === activeKey;
    const strongest = [...s.subScores].sort((a, b) => b.value - a.value)[0];
    const conf = thesisConfirmation(s);
    return (
      <button
        key={s.key}
        type="button"
        role="tab"
        aria-selected={active}
        aria-controls="theater-title"
        onClick={() => onSelect(s.key)}
        onPointerEnter={() => setHoverScenario(s.key)}
        onPointerLeave={() => setHoverScenario(null)}
        className="group relative flex min-w-[200px] flex-1 snap-start flex-col gap-2 overflow-hidden rounded-xl border px-3.5 py-3 text-left transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5"
        style={{
          borderColor: active ? `${band.color}66` : hoverScenario === s.key ? "rgb(148 163 184 / .28)" : "var(--color-line)",
          background: active ? `linear-gradient(180deg, ${band.color}14, rgb(12 16 26 / .7))` : "rgb(12 16 26 / .55)"
        }}
      >
        <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: s.color }} aria-hidden="true" />
        <span className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <kbd className="num hidden h-4 min-w-4 place-items-center rounded border border-line-2 px-1 text-[9.5px] text-muted sm:grid">{i + 1}</kbd>
            <span className="text-[14px] font-semibold">{shortScenarioLabel(s.title, s.key)}</span>
          </span>
          <span className="flex items-baseline gap-1.5">
            {d != null && d !== 0 && (
              <span className="num text-[10.5px]" style={{ color: band.color }}>
                {d > 0 ? "▲" : "▼"}
                {signedInt(Math.abs(d)).replace("+", "")}
              </span>
            )}
            <span className="display text-[22px] leading-none" style={{ color: band.color }}>
              {s.heat}
            </span>
          </span>
        </span>
        <span className="h-[3px] w-full overflow-hidden rounded-full bg-[rgb(148_163_184/.12)]">
          <span className="block h-full rounded-full" style={{ width: `${s.heat}%`, background: band.color }} />
        </span>
        <span className="num flex items-center justify-between text-[10.5px] text-muted">
          <span className="truncate pr-2">{strongest ? `${strongest.label} ${strongest.value}` : band.label}</span>
          <span style={{ color: conf == null ? undefined : conf >= 0 ? "var(--color-long)" : "var(--color-short)" }} title="Market confirmation (22d)">
            {conf == null ? "" : `${conf >= 0 ? "+" : "−"}${Math.abs(conf * 100).toFixed(1)}pp`}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div>
      <div role="tablist" aria-label="Theaters" className="scroll-thin -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {mapped.map((s) => card(s, scenarios.indexOf(s)))}
        {unmapped.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="label px-1">Unmapped</span>
            <div className="flex gap-2.5">{unmapped.map((s) => card(s, scenarios.indexOf(s)))}</div>
          </div>
        )}
      </div>
      <label className="sr-only" htmlFor="scenario-select">
        Theater
      </label>
      <select id="scenario-select" className="sr-only" value={activeKey} onChange={(e) => onSelect(e.target.value)}>
        {scenarios.map((s) => (
          <option key={s.key} value={s.key}>
            {s.title}
          </option>
        ))}
      </select>
    </div>
  );
}
