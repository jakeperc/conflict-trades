import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flatLane, project, wrapInto, type FlatView } from "../../lib/geo";
import { loadLand } from "../../lib/land";
import { useUi } from "../../lib/store";
import { laneLit, type MapModel } from "./mapModel";
import type { TipTarget } from "./TheaterMap";

interface Props {
  model: MapModel;
  activeKey: string;
  onSelect: (key: string) => void;
  reducedMotion: boolean;
  onTip: (t: TipTarget | null) => void;
}

function computeView(model: MapModel, width: number, height: number): FlatView {
  const lngs = model.hotspots.map((h) => h.pos[0]);
  const lats = model.hotspots.map((h) => h.pos[1]);
  let lng0 = (lngs.length ? Math.min(...lngs) : -20) - 30;
  let lng1 = (lngs.length ? Math.max(...lngs) : 150) + 30;
  let lat0 = (lats.length ? Math.min(...lats) : 0) - 18;
  let lat1 = (lats.length ? Math.max(...lats) : 60) + 16;
  // Expand the short side so the equirectangular cells stay square.
  const want = width / Math.max(1, height);
  const have = (lng1 - lng0) / (lat1 - lat0);
  if (have < want) {
    const extra = (lat1 - lat0) * want - (lng1 - lng0);
    lng0 -= extra / 2;
    lng1 += extra / 2;
  } else {
    const extra = (lng1 - lng0) / want - (lat1 - lat0);
    lat0 -= extra / 2;
    lat1 += extra / 2;
  }
  lat1 = Math.min(lat1, 84);
  lat0 = Math.max(lat0, -60);
  return { lng0, lng1, lat0, lat1, width, height };
}

export default function FlatMap({ model, activeKey, onSelect, reducedMotion, onTip }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [land, setLand] = useState<Float32Array | null>(null);
  const hoverLane = useUi((s) => s.hoverLane);
  const hoverTrade = useUi((s) => s.hoverTrade);
  const setHoverLane = useUi((s) => s.setHoverLane);
  const setHoverScenario = useUi((s) => s.setHoverScenario);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    loadLand().then(setLand).catch(() => setLand(new Float32Array()));
  }, []);

  const view = useMemo(() => computeView(model, size.w || 1, size.h || 1), [model, size.w, size.h]);
  const active = model.hotspots.find((h) => h.key === activeKey);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !land || !size.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    if (active) {
      const [ax, ay] = project(view, wrapInto(view, active.pos[0]), active.pos[1]);
      const g = ctx.createRadialGradient(ax, ay, 0, ax, ay, Math.max(size.w, size.h) * 0.32);
      g.addColorStop(0, `${active.band.color}2e`);
      g.addColorStop(1, `${active.band.color}00`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size.w, size.h);
    }
    const cell = (size.w / (view.lng1 - view.lng0)) * 0.9;
    const r = Math.max(0.6, Math.min(1.5, cell * 0.36));
    ctx.fillStyle = "rgba(148, 163, 184, 0.30)";
    for (let i = 0; i < land.length; i += 2) {
      for (const k of [0, 360, -360]) {
        const lng = land[i] + k;
        if (lng < view.lng0 || lng > view.lng1) continue;
        const [x, y] = project(view, lng, land[i + 1]);
        if (y < -2 || y > size.h + 2) continue;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [land, size.w, size.h, view, active]);

  const lanes = useMemo(
    () =>
      model.lanes.map((l) => {
        const { a, b, c } = flatLane(view, l.from, l.to);
        return { lane: l, d: `M${a[0]},${a[1]} Q${c[0]},${c[1]} ${b[0]},${b[1]}`, mid: [(a[0] + 2 * c[0] + b[0]) / 4, (a[1] + 2 * c[1] + b[1]) / 4] as const };
      }),
    [model.lanes, view]
  );

  return (
    <div ref={wrapRef} className="absolute inset-0" onPointerLeave={() => onTip(null)}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      {size.w > 0 && (
        <svg className="absolute inset-0 h-full w-full" width={size.w} height={size.h} role="group" aria-label="Theater map">
          <defs>
            <filter id="flat-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </defs>
          {lanes.map(({ lane, d, mid }) => {
            const lit = laneLit(lane, hoverLane, hoverTrade);
            const mine = lane.scenario === activeKey;
            const opacity = lit ? 1 : mine ? 0.75 : 0.28;
            const speed = 2.6 - lane.intensity * 1.6;
            return (
              <g key={`${lane.scenario}:${lane.id}`}>
                <path d={d} fill="none" stroke={lane.band.color} strokeOpacity={opacity * 0.25} strokeWidth={lit ? 5 : 3} />
                <path
                  d={d}
                  fill="none"
                  stroke={lane.band.color}
                  strokeOpacity={opacity}
                  strokeWidth={lit ? 2 : 1.25}
                  strokeLinecap="round"
                  strokeDasharray="5 7"
                  style={reducedMotion ? undefined : { animation: `dash-flow ${speed}s linear infinite` }}
                />
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="14"
                  tabIndex={0}
                  role="button"
                  aria-label={`${lane.label}. Sectors: ${lane.sectors.join(", ")}`}
                  className="cursor-pointer outline-none"
                  onPointerEnter={() => {
                    setHoverLane(lane.id);
                    onTip({ kind: "lane", id: lane.id, scenario: lane.scenario, x: mid[0], y: mid[1] });
                  }}
                  onPointerLeave={() => {
                    setHoverLane(null);
                    onTip(null);
                  }}
                  onFocus={() => {
                    setHoverLane(lane.id);
                    onTip({ kind: "lane", id: lane.id, scenario: lane.scenario, x: mid[0], y: mid[1] });
                  }}
                  onBlur={() => {
                    setHoverLane(null);
                    onTip(null);
                  }}
                  onClick={() => onSelect(lane.scenario)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(lane.scenario);
                    }
                  }}
                />
              </g>
            );
          })}
          {model.hotspots.map((h) => {
            const [x, y] = project(view, wrapInto(view, h.pos[0]), h.pos[1]);
            const isActive = h.key === activeKey;
            const core = 3.5 + h.band.level * 1.4;
            const ringDur = 2.2 - h.band.level * 0.25; // <= ~0.6 Hz, well under the 3 Hz flash limit
            const show = () => {
              setHoverScenario(h.key);
              onTip({ kind: "scenario", id: h.key, scenario: h.key, x, y });
            };
            const hide = () => {
              setHoverScenario(null);
              onTip(null);
            };
            return (
              <g
                key={h.key}
                transform={`translate(${x},${y})`}
                tabIndex={0}
                role="button"
                aria-pressed={isActive}
                aria-label={`${h.label}, ${h.place}: heat ${h.heat}, ${h.band.label}`}
                className="cursor-pointer outline-none [&:focus-visible>circle.focus]:opacity-100"
                onClick={() => onSelect(h.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(h.key);
                  }
                }}
                onPointerEnter={show}
                onPointerLeave={hide}
                onFocus={show}
                onBlur={hide}
              >
                <circle r={22} fill="transparent" />
                <circle className="focus" r={core + 9} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" opacity="0" />
                {!reducedMotion && (
                  <circle r={core + 3} fill="none" stroke={h.band.color} strokeWidth="1.2" style={{ transformBox: "fill-box", transformOrigin: "center", animation: `ring-out ${ringDur}s ease-out infinite` }} />
                )}
                <circle r={core * 2.2} fill={h.band.color} opacity={isActive ? 0.35 : 0.18} filter="url(#flat-glow)" />
                <circle r={core} fill={h.band.color} stroke={isActive ? "#fff" : "rgb(5 7 13 / .8)"} strokeWidth={isActive ? 1.6 : 1} />
                <g transform={`translate(${core + 7},${-core - 4})`}>
                  <text className="display" fontSize="13" fill={h.band.color}>
                    {h.heat}
                  </text>
                  <text x="0" y="13" className="num" fontSize="9.5" letterSpacing="1.2" fill={isActive ? "var(--color-text)" : "var(--color-dim)"}>
                    {h.label.toUpperCase()}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
