import type { ComponentKey, Components, Position } from "../../types";
import { ladderProgress } from "../../lib/derive";
import { money } from "../../lib/format";
import { scoreColor } from "../ui/primitives";

export const COMPONENTS: { key: ComponentKey; short: string; label: string }[] = [
  { key: "conviction", short: "conv", label: "Conviction" },
  { key: "scenario", short: "scen", label: "Scenario" },
  { key: "riskReward", short: "r/r", label: "Risk / reward" },
  { key: "trend", short: "trend", label: "Trend" },
  { key: "volRegime", short: "vol", label: "Vol regime" },
  { key: "catalyst", short: "cat", label: "Catalyst" },
  { key: "memory", short: "mem", label: "Memory" }
];

export const DEFAULT_WEIGHTS: Components = {
  conviction: 0.18,
  scenario: 0.14,
  riskReward: 0.16,
  trend: 0.14,
  volRegime: 0.08,
  catalyst: 0.1,
  memory: 0.2
};

/** Seven factor columns: compact vertical bars (watchlist) or labelled rows (drawer). */
export function FactorBars({ components, layout = "columns" }: { components?: Partial<Components>; layout?: "columns" | "rows" }) {
  if (layout === "rows") {
    return (
      <ul className="flex flex-col gap-2">
        {COMPONENTS.map((c) => {
          const v = components?.[c.key] ?? 0;
          return (
            <li key={c.key} className="grid grid-cols-[96px_1fr_34px] items-center gap-3 text-[12px]">
              <span className="text-dim">{c.label}</span>
              <span className="h-[6px] overflow-hidden rounded-full bg-[rgb(148_163_184/.1)]">
                <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: scoreColor(v) }} />
              </span>
              <span className="num text-right text-dim">{v.toFixed(0)}</span>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <div className="grid grid-cols-7 gap-1.5" role="list" aria-label="Factor scores">
      {COMPONENTS.map((c) => {
        const v = components?.[c.key] ?? 0;
        return (
          <div key={c.key} role="listitem" className="flex flex-col items-center gap-1" title={`${c.label}: ${v.toFixed(0)}`}>
            <div className="relative h-9 w-full overflow-hidden rounded-[4px] bg-[rgb(148_163_184/.08)]">
              <div className="absolute inset-x-0 bottom-0 rounded-[4px] transition-[height] duration-700" style={{ height: `${Math.max(3, Math.min(100, v))}%`, background: scoreColor(v), opacity: 0.85 }} />
            </div>
            <span className="num text-[9px] tracking-[0.06em] text-muted">{c.short}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Stop ... entry ... mark ... target, direction-aware, with the move since entry filled. */
export function Ladder({ p, big = false }: { p: Pick<Position, "direction" | "stopPrice" | "targetPrice" | "entryPrice" | "currentPrice">; big?: boolean }) {
  const { entry, mark } = ladderProgress(p);
  const good = mark != null && entry != null && (p.direction === "LONG" ? mark >= entry : mark <= entry);
  const leftLabel = p.direction === "LONG" ? "stop" : "target";
  const rightLabel = p.direction === "LONG" ? "target" : "stop";
  const leftVal = p.direction === "LONG" ? p.stopPrice : p.targetPrice;
  const rightVal = p.direction === "LONG" ? p.targetPrice : p.stopPrice;
  const col = good ? "var(--color-long)" : "var(--color-short)";
  return (
    <div className={big ? "w-full" : "w-[150px]"} title={`Stop ${money(p.stopPrice)} · entry ${money(p.entryPrice)} · mark ${money(p.currentPrice)} · target ${money(p.targetPrice)}`}>
      <div className={`relative ${big ? "h-2.5" : "h-1.5"} rounded-full`} style={{ background: "linear-gradient(90deg, rgb(248 113 113 / .22), rgb(148 163 184 / .1) 50%, rgb(52 211 153 / .22))" }}>
        {p.direction === "SHORT" && <span className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(90deg, rgb(52 211 153 / .22), rgb(148 163 184 / .1) 50%, rgb(248 113 113 / .22))" }} />}
        {entry != null && mark != null && (
          <span className="absolute inset-y-0 rounded-full" style={{ left: `${Math.min(entry, mark) * 100}%`, width: `${Math.abs(mark - entry) * 100}%`, background: col, opacity: 0.75 }} />
        )}
        {entry != null && <span className="absolute -top-1 bottom-[-4px] w-px bg-dim" style={{ left: `${entry * 100}%` }} />}
        {mark != null && (
          <span
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg ${big ? "h-3.5 w-3.5" : "h-2.5 w-2.5"}`}
            style={{ left: `${mark * 100}%`, background: col }}
          />
        )}
      </div>
      {big && (
        <div className="num mt-2 flex justify-between text-[10.5px] text-muted">
          <span>
            {leftLabel} {money(leftVal)}
          </span>
          <span>
            entry {money(p.entryPrice)} · mark {money(p.currentPrice)}
          </span>
          <span>
            {rightLabel} {money(rightVal)}
          </span>
        </div>
      )}
    </div>
  );
}

/** "scenario:taiwan|sector:Semiconductor onshoring|direction:LONG" -> readable chips. */
export function EdgeKey({ k }: { k: string }) {
  const parts = k.split("|").map((p) => {
    const i = p.indexOf(":");
    return { dim: p.slice(0, i), val: p.slice(i + 1) };
  });
  return (
    <span className="flex flex-wrap items-center gap-1">
      {parts.map((p, i) => (
        <span key={i} className="chip h-5 px-1.5 text-[10.5px]" title={p.dim}>
          {p.dim === "direction" ? p.val : p.dim === "ticker" ? `$${p.val}` : p.dim === "conviction" ? `conv ${p.val}` : p.val}
        </span>
      ))}
    </span>
  );
}
