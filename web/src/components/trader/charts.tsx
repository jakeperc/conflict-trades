import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { arc, area, curveMonotoneX, line, pie } from "d3-shape";
import type { ClosedTrade, EquityPoint, Position, Scenario } from "../../types";
import { maxDrawdown } from "../../lib/derive";
import { money, pct, shortDate, signedPct } from "../../lib/format";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function EquityChart({
  curve,
  start,
  closed,
  open,
  height = 210
}: {
  curve: EquityPoint[];
  start: number;
  closed: ClosedTrade[];
  open: Position[];
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { t: 14, r: 12, b: 22, l: 12 };
  const W = Math.max(1, width);
  const H = height;

  const model = useMemo(() => {
    if (curve.length < 2) return null;
    const vals = curve.map((p) => p.totalEquity);
    let lo = Math.min(start, ...vals);
    let hi = Math.max(start, ...vals);
    const span = hi - lo || 1;
    lo -= span * 0.08;
    hi += span * 0.12;
    const x = (i: number) => pad.l + (i / (curve.length - 1)) * (W - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
    const idxByDate = new Map<string, number>();
    curve.forEach((p, i) => idxByDate.set(p.date, i));
    const nearest = (date: string) => {
      if (idxByDate.has(date)) return idxByDate.get(date)!;
      let best = -1;
      curve.forEach((p, i) => {
        if (p.date <= date) best = i;
      });
      return best;
    };
    const exits = closed
      .map((t) => ({ t, i: nearest(t.exitDate) }))
      .filter((e) => e.i >= 0);
    const entries = [...closed, ...open].map((p) => ({ p, i: nearest(p.entryDate) })).filter((e) => e.i >= 0);
    const dd = maxDrawdown(curve);
    const lineGen = line<EquityPoint>()
      .x((_, i) => x(i))
      .y((p) => y(p.totalEquity))
      .curve(curveMonotoneX);
    const areaGen = area<EquityPoint>()
      .x((_, i) => x(i))
      .y0(H - pad.b)
      .y1((p) => y(p.totalEquity))
      .curve(curveMonotoneX);
    return { x, y, exits, entries, dd, d: lineGen(curve) ?? "", a: areaGen(curve) ?? "" };
  }, [curve, closed, open, start, W, H, pad.b, pad.l, pad.r, pad.t]);

  if (!model) return <div ref={ref} className="grid h-[210px] place-items-center text-[12px] text-muted">Equity curve appears after two cycles.</div>;
  const last = curve[curve.length - 1];
  const up = last.totalEquity >= start;
  const col = up ? "var(--color-long)" : "var(--color-short)";
  const hp = hover != null ? curve[hover] : null;
  const exitsHere = hover != null ? model.exits.filter((e) => e.i === hover) : [];

  return (
    <div ref={ref} className="relative w-full" style={{ height: H }}>
      {width > 0 && (
        <svg
          width={W}
          height={H}
          className="block touch-pan-y"
          role="img"
          aria-label={`Equity curve over ${curve.length} cycles, from ${money(curve[0].totalEquity, true)} to ${money(last.totalEquity, true)}. Max drawdown ${pct(model.dd.maxDd, 1)}.`}
          onPointerMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = e.clientX - r.left;
            const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (curve.length - 1));
            setHover(Math.max(0, Math.min(curve.length - 1, i)));
          }}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="eq-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={up ? "#34d399" : "#f87171"} stopOpacity="0.28" />
              <stop offset="1" stopColor={up ? "#34d399" : "#f87171"} stopOpacity="0" />
            </linearGradient>
          </defs>
          {model.dd.maxDd < 0 && (
            <g>
              <rect
                x={model.x(model.dd.peakIdx)}
                y={pad.t}
                width={Math.max(2, model.x(model.dd.troughIdx) - model.x(model.dd.peakIdx))}
                height={H - pad.t - pad.b}
                fill="rgb(248 113 113 / .07)"
              />
              <text x={model.x(model.dd.peakIdx) + 4} y={pad.t + 10} className="num" fontSize="9.5" fill="rgb(248 113 113 / .8)" letterSpacing="1">
                MAX DD {pct(model.dd.maxDd, 1)}
              </text>
            </g>
          )}
          <line x1={pad.l} x2={W - pad.r} y1={model.y(start)} y2={model.y(start)} stroke="rgb(148 163 184 / .3)" strokeDasharray="3 4" />
          <text x={W - pad.r} y={H - 6} textAnchor="end" className="num" fontSize="9.5" fill="var(--color-muted)" dx={-64}>
            ┄ start {money(start, true)}
          </text>
          <path d={model.a} fill="url(#eq-fill)" />
          <path d={model.d} fill="none" stroke={col} strokeWidth="1.8" strokeLinejoin="round" />
          {model.entries.map(({ p, i }) => (
            <line key={`en-${p.id}`} x1={model.x(i)} x2={model.x(i)} y1={H - pad.b} y2={H - pad.b - 5} stroke="var(--color-accent)" strokeWidth="1.2" opacity="0.7" />
          ))}
          {model.exits.map(({ t, i }) => (
            <circle
              key={`ex-${t.id}-${t.exitDate}`}
              cx={model.x(i)}
              cy={model.y(curve[i].totalEquity)}
              r="3.2"
              fill={t.outcome === "win" ? "var(--color-long)" : "var(--color-short)"}
              stroke="#05070d"
              strokeWidth="1.2"
            />
          ))}
          <text x={pad.l} y={H - 6} className="num" fontSize="9.5" fill="var(--color-muted)">
            {shortDate(curve[0].date)}
          </text>
          <text x={W - pad.r} y={H - 6} textAnchor="end" className="num" fontSize="9.5" fill="var(--color-muted)">
            {shortDate(last.date)}
          </text>
          {hp && hover != null && (
            <g pointerEvents="none">
              <line x1={model.x(hover)} x2={model.x(hover)} y1={pad.t} y2={H - pad.b} stroke="rgb(230 234 241 / .35)" />
              <circle cx={model.x(hover)} cy={model.y(hp.totalEquity)} r="4" fill={col} stroke="#05070d" strokeWidth="1.5" />
            </g>
          )}
        </svg>
      )}
      {hp && hover != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line-2 bg-panel-solid px-2.5 py-2 text-[11.5px] shadow-xl"
          style={{ left: `clamp(70px, ${model.x(hover)}px, calc(100% - 70px))`, transform: "translateX(-50%)" }}
        >
          <div className="num text-muted">
            {shortDate(hp.date)} · cycle {hp.cycle}
          </div>
          <div className="num text-[13px] text-text">{money(hp.totalEquity)}</div>
          <div className="num" style={{ color: hp.pctVsStart >= 0 ? "var(--color-long)" : "var(--color-short)" }}>
            {signedPct(hp.pctVsStart, 2)} vs start
          </div>
          {exitsHere.map(({ t }) => (
            <div key={t.id} className="num mt-1 text-dim">
              exit {t.ticker} <span style={{ color: t.outcome === "win" ? "var(--color-long)" : "var(--color-short)" }}>{signedPct(t.realizedPct, 1)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function allocationSlices(open: Position[], cash: number, scenarios: Record<string, Scenario> | undefined): Slice[] {
  const by = new Map<string, number>();
  for (const p of open) {
    const v = (p.currentPrice ?? p.entryPrice) * p.shares;
    by.set(p.scenario, (by.get(p.scenario) ?? 0) + v);
  }
  const slices: Slice[] = [...by.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => {
      const s = scenarios?.[k];
      return { key: k, label: s ? s.title.split("/")[0].trim() : k, value: v, color: s?.color ?? "#8b93ff" };
    });
  if (cash > 0) slices.push({ key: "cash", label: "Cash", value: cash, color: "#3f475a" });
  return slices;
}

export function AllocationDonut({ slices, size = 150 }: { slices: Slice[]; size?: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const arcs = pie<Slice>()
    .value((s) => s.value)
    .sort(null)
    .padAngle(0.025)(slices);
  const r = size / 2;
  const gen = arc<(typeof arcs)[number]>()
    .innerRadius(r * 0.68)
    .outerRadius(r - 2)
    .cornerRadius(3);
  const genHover = arc<(typeof arcs)[number]>()
    .innerRadius(r * 0.66)
    .outerRadius(r)
    .cornerRadius(3);
  const h = slices.find((s) => s.key === hover);
  const invested = slices.filter((s) => s.key !== "cash").reduce((a, s) => a + s.value, 0);
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`${-r} ${-r} ${size} ${size}`} role="img" aria-label={`Allocation: ${slices.map((s) => `${s.label} ${pct(s.value / total, 0)}`).join(", ")}`}>
        {arcs.map((a) => (
          <path
            key={a.data.key}
            d={(hover === a.data.key ? genHover(a) : gen(a)) ?? ""}
            fill={a.data.color}
            opacity={hover && hover !== a.data.key ? 0.35 : 0.92}
            onPointerEnter={() => setHover(a.data.key)}
            onPointerLeave={() => setHover(null)}
            style={{ transition: "opacity .15s" }}
          />
        ))}
        <text y="-4" textAnchor="middle" className="display" fontSize="17" fill="var(--color-text)">
          {h ? pct(h.value / total, 0) : pct(invested / total, 0)}
        </text>
        <text y="12" textAnchor="middle" className="num" fontSize="8.5" letterSpacing="1.4" fill="var(--color-muted)">
          {h ? h.label.toUpperCase() : "INVESTED"}
        </text>
      </svg>
      <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
        {slices.map((s) => (
          <li
            key={s.key}
            className="flex items-center gap-2 text-[12px]"
            onPointerEnter={() => setHover(s.key)}
            onPointerLeave={() => setHover(null)}
          >
            <i className="block h-2 w-2 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="truncate text-dim">{s.label}</span>
            <span className="num ml-auto text-text">{money(s.value, true)}</span>
            <span className="num w-9 text-right text-muted">{pct(s.value / total, 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
