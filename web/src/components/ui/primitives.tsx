import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Direction } from "../../types";
import { heatBand } from "../../lib/heat";
import { useReducedMotion } from "../../lib/env";

export function Panel({
  label,
  title,
  right,
  children,
  className = "",
  bodyClass = "p-4 sm:p-5",
  id,
  solid = false
}: {
  label?: string;
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
  id?: string;
  solid?: boolean;
}) {
  const headingId = id ? `${id}-h` : undefined;
  return (
    <section id={id} aria-labelledby={title ? headingId : undefined} className={`panel ${solid ? "panel-solid" : ""} ${className}`}>
      {(label || title || right) && (
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-4 pt-4 sm:px-5 sm:pt-5">
          <div className="min-w-0">
            {label && <div className="label mb-1">{label}</div>}
            {title && (
              <h2 id={headingId} className="text-[15px] font-semibold tracking-[-0.01em] text-text">
                {title}
              </h2>
            )}
          </div>
          {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function DirBadge({ dir, size = "sm" }: { dir: Direction; size?: "sm" | "md" }) {
  const long = dir === "LONG";
  return (
    <span
      className={`num inline-flex items-center rounded-[5px] font-semibold tracking-[0.06em] ${size === "md" ? "h-6 px-2 text-[11px]" : "h-[19px] px-1.5 text-[10px]"}`}
      style={{
        color: long ? "var(--color-long)" : "var(--color-short)",
        background: long ? "var(--color-long-soft)" : "var(--color-short-soft)",
        boxShadow: `inset 0 0 0 1px ${long ? "rgb(52 211 153 / .28)" : "rgb(248 113 113 / .28)"}`
      }}
    >
      {dir}
    </span>
  );
}

export function Pips({ n, max = 5, title }: { n: number; max?: number; title?: string }) {
  const filled = Math.max(0, Math.min(max, Math.round(n || 0)));
  return (
    <span className="inline-flex gap-[3px]" title={title ?? `${filled}/${max}`} aria-label={title ?? `${filled} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className="block h-[5px] w-[5px] rounded-full" style={{ background: i < filled ? "var(--color-dim)" : "var(--color-faint)" }} />
      ))}
    </span>
  );
}

export function Sparkline({ series, width = 72, height = 22, className = "" }: { series?: number[]; width?: number; height?: number; className?: string }) {
  if (!series || series.length < 2) return <span className="text-faint">—</span>;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const rng = max - min || 1;
  const n = series.length;
  const pts = series.map((v, i) => [(i / (n - 1)) * width, height - 2 - ((v - min) / rng) * (height - 4)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const up = series[n - 1] >= series[0];
  const col = up ? "var(--color-long)" : "var(--color-short)";
  const area = `${d}L${width},${height}L0,${height}Z`;
  const gid = `sg${Math.round(series[0] * 1000)}${n}${up ? 1 : 0}`;
  return (
    <svg className={className} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={col} stopOpacity="0.22" />
          <stop offset="1" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={col} strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[n - 1][0]} cy={pts[n - 1][1]} r="1.8" fill={col} />
    </svg>
  );
}

/** Tweens to new values; instant under reduced motion. */
export function NumberTicker({ value, format, duration = 700 }: { value: number; format: (v: number) => string; duration?: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduced) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, duration, reduced]);
  return <>{format(shown)}</>;
}

export function HeatDot({ heat, size = 8 }: { heat: number; size?: number }) {
  const b = heatBand(heat);
  return <i className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: b.color, boxShadow: `0 0 10px ${b.color}88` }} />;
}

/** 270-degree arc gauge with band ticks. */
export function HeatGauge({ heat, size = 132 }: { heat: number; size?: number }) {
  const band = heatBand(heat);
  const r = size / 2 - 9;
  const c = size / 2;
  const start = 135;
  const sweep = 270;
  const polar = (deg: number, rad = r) => {
    const a = (deg * Math.PI) / 180;
    return [c + rad * Math.cos(a), c + rad * Math.sin(a)];
  };
  const arc = (from: number, to: number) => {
    const [x0, y0] = polar(from);
    const [x1, y1] = polar(to);
    const large = to - from > 180 ? 1 : 0;
    return `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1}`;
  };
  const clamped = Math.max(0, Math.min(100, heat));
  const end = start + (sweep * clamped) / 100;
  const ticks = [50, 75, 95].map((v) => {
    const deg = start + (sweep * v) / 100;
    const [x0, y0] = polar(deg, r - 9);
    const [x1, y1] = polar(deg, r + 7);
    return <line key={v} x1={x0} y1={y0} x2={x1} y2={y1} stroke="rgb(148 163 184 / .35)" strokeWidth="1" />;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Heat ${heat}, ${band.label}`}>
      <defs>
        <filter id="gauge-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>
      <path d={arc(start, start + sweep)} fill="none" stroke="rgb(148 163 184 / .12)" strokeWidth="7" strokeLinecap="round" />
      <path d={arc(start, end)} fill="none" stroke={band.color} strokeWidth="7" strokeLinecap="round" filter="url(#gauge-glow)" opacity="0.55" />
      <path d={arc(start, end)} fill="none" stroke={band.color} strokeWidth="7" strokeLinecap="round" />
      {ticks}
      <text x={c} y={c + 4} textAnchor="middle" className="display" fontSize={size * 0.3} fill={band.color}>
        {heat}
      </text>
      <text x={c} y={c + size * 0.2} textAnchor="middle" className="num" fontSize="9.5" letterSpacing="1.6" fill="var(--color-muted)">
        {band.label.toUpperCase()}
      </text>
    </svg>
  );
}

export function Meter({ value, max = 100, color = "var(--color-dim)", height = 4, track = "rgb(148 163 184 / .12)" }: { value: number; max?: number; color?: string; height?: number; track?: string }) {
  const w = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span className="block w-full overflow-hidden rounded-full" style={{ height, background: track }}>
      <span className="block h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${w}%`, background: color }} />
    </span>
  );
}

/** Score color: elite / high / mid / low, mono green to grey (never heat colors). */
export function scoreColor(score: number): string {
  if (score >= 75) return "#34d399";
  if (score >= 60) return "#7dd3b0";
  if (score >= 45) return "#a6aec0";
  return "#6f7890";
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function Delta({ value, format, invert = false, zero = "flat" }: { value: number | null | undefined; format: (v: number) => string; invert?: boolean; zero?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-muted">—</span>;
  if (value === 0) return <span className="text-muted">{zero}</span>;
  const good = invert ? value < 0 : value > 0;
  return <span style={{ color: good ? "var(--color-long)" : "var(--color-short)" }}>{format(value)}</span>;
}

export function ExternalMark() {
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 text-muted">
        ↗
      </span>
      <span className="sr-only"> (opens in a new tab)</span>
    </>
  );
}
