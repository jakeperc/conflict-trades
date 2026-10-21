import type { Calibration, Simulation } from "../../types";
import { humanize, pct } from "../../lib/format";
import { COMPONENTS, DEFAULT_WEIGHTS, EdgeKey } from "./parts";

const FAILURE: { key: string; label: string; color: string }[] = [
  { key: "target_hit", label: "Target hit clean", color: "#34d399" },
  { key: "target_undershoot", label: "Target too modest", color: "#f5d76e" },
  { key: "horizon_drift_winner", label: "Drifted (winner)", color: "rgb(52 211 153 / .45)" },
  { key: "horizon_drift_loser", label: "Drifted (loser)", color: "rgb(248 113 113 / .45)" },
  { key: "stop_overshoot", label: "Stop too tight", color: "#ff9f43" },
  { key: "stop_hit_quick", label: "Stopped within 5d", color: "#f87171" },
  { key: "stop_hit_late", label: "Stopped late", color: "#c2414b" }
];

const VARIANTS: [string, string][] = [
  ["tight_stop", "Tight stop ×0.7"],
  ["standard", "Standard"],
  ["wide_stop", "Wide stop ×1.3"],
  ["tight_target", "Tight target ×0.7"],
  ["wide_target", "Wide target ×1.3"]
];

export function SimulationLab({ sim, calibration }: { sim: Simulation | null | undefined; calibration: Calibration | null | undefined }) {
  if (!sim || !sim.closedCount) return null;
  const since = sim.startDate ? new Date(sim.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  const fm = sim.failureMode ?? {};
  const std = sim.variantStats?.standard?.winRate ?? 0;
  const gw = calibration?.globalWeights ?? null;
  const buckets = Object.entries(calibration?.perBucket ?? {})
    .filter(([k]) => k.split("|").length === 3)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 6);

  return (
    <details className="panel group open:pb-2">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-4 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-90">
            ▸
          </span>
          <div>
            <div className="label">Backtest</div>
            <h2 className="text-[15px] font-semibold">Simulation lab</h2>
            <p className="num mt-0.5 text-[11.5px] text-muted">
              {sim.closedCount.toLocaleString()} simulated trades since {since} · {sim.tradingDays} trading days
            </p>
          </div>
        </div>
        <dl className="num flex flex-wrap gap-2">
          {[
            ["Closed", sim.closedCount.toLocaleString(), undefined],
            ["Win rate", pct(sim.overallWinRate, 1), undefined],
            ["Avg P&L", pct(sim.overallAvgPnlPct, 2), sim.overallAvgPnlPct >= 0 ? "var(--color-long)" : "var(--color-short)"],
            ["Recalibrated", String(sim.recalibratedBuckets ?? 0), undefined]
          ].map(([k, v, c]) => (
            <div key={k} className="rounded-lg border border-line bg-raise px-3 py-1.5">
              <dt className="label text-[9.5px]">{k}</dt>
              <dd className="text-[15px]" style={{ color: c }}>
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </summary>

      <div className="grid grid-cols-1 gap-6 px-4 pb-4 sm:px-5 lg:grid-cols-2">
        <section>
          <h3 className="label mb-2">How simulated trades ended</h3>
          <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label="Exit mix">
            {FAILURE.map((f) => {
              const n = fm[f.key] ?? 0;
              if (!n) return null;
              return <span key={f.key} title={`${f.label}: ${n}`} style={{ flex: `${n} 0 0`, background: f.color }} />;
            })}
          </div>
          <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {FAILURE.map((f) => {
              const n = fm[f.key] ?? 0;
              if (!n) return null;
              return (
                <li key={f.key} className="flex items-center gap-2 text-[12px]">
                  <i className="block h-2 w-2 rounded-sm" style={{ background: f.color }} />
                  <span className="text-dim">{f.label}</span>
                  <span className="num ml-auto text-muted">{pct(n / sim.closedCount, 1)}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h3 className="label mb-2">Stop / target variants (win rate)</h3>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-3 xl:grid-cols-5">
            {VARIANTS.map(([k, label]) => {
              const v = sim.variantStats?.[k];
              if (!v) return null;
              const d = v.winRate - std;
              return (
                <li key={k} className={`rounded-lg border px-2.5 py-2 ${k === "standard" ? "border-line-2 bg-raise-2" : "border-line bg-raise"}`}>
                  <div className="text-[11px] text-muted">{label}</div>
                  <div className="num text-[15px]">{pct(v.winRate, 1)}</div>
                  {k !== "standard" && (
                    <div className="num text-[10.5px]" style={{ color: d > 0.02 ? "var(--color-long)" : d < -0.02 ? "var(--color-short)" : "var(--color-muted)" }}>
                      {d >= 0 ? "+" : "−"}
                      {Math.abs(d * 100).toFixed(1)}pp
                    </div>
                  )}
                  <div className="num text-[10px] text-muted">n={v.n.toLocaleString()}</div>
                </li>
              );
            })}
          </ul>
        </section>

        {gw && (
          <section>
            <h3 className="label mb-2">
              Live scoring weights
              {calibration?.tournamentMeta ? ` · tournament +${(calibration.tournamentMeta.improvement * 100).toFixed(2)}pp over ${calibration.tournamentMeta.candidateCount} candidates` : ""}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {COMPONENTS.map((c) => {
                const w = gw[c.key] ?? 0;
                const d = w - DEFAULT_WEIGHTS[c.key];
                return (
                  <li key={c.key} className="grid grid-cols-[96px_1fr_44px_64px] items-center gap-3 text-[12px]">
                    <span className="text-dim">{c.label}</span>
                    <span className="h-[5px] overflow-hidden rounded-full bg-[rgb(148_163_184/.1)]">
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${(w / 0.3) * 100}%` }} />
                    </span>
                    <span className="num text-right">{(w * 100).toFixed(1)}%</span>
                    <span className="num text-right text-[11px]" style={{ color: d > 0.005 ? "var(--color-long)" : d < -0.005 ? "var(--color-short)" : "var(--color-muted)" }}>
                      {d >= 0 ? "+" : "−"}
                      {Math.abs(d * 100).toFixed(1)}pp
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section>
          <h3 className="label mb-2">
            Recalibrated buckets · {calibration?.applyBucketWeights ? "overrides active" : "observational only"}
          </h3>
          {buckets.length === 0 ? (
            <p className="text-[12px] text-muted">No buckets had enough samples to recalibrate.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {buckets.map(([k, b]) => (
                <li key={k} className="rounded-lg border border-line bg-raise px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <EdgeKey k={k} />
                    <span className="num flex gap-2 text-[11px]">
                      <span className="text-muted">n={b.n}</span>
                      <span style={{ color: (b.standardWinRate ?? 0) >= 0.5 ? "var(--color-long)" : "var(--color-short)" }}>{pct(b.standardWinRate, 0)} win</span>
                      <span style={{ color: (b.standardAvgPnl ?? 0) >= 0 ? "var(--color-long)" : "var(--color-short)" }}>avg {pct(b.standardAvgPnl, 1)}</span>
                      {b.stopMult && b.stopMult !== 1 && <span className="text-dim">stop ×{b.stopMult.toFixed(2)}</span>}
                      {b.targetMult && b.targetMult !== 1 && <span className="text-dim">target ×{b.targetMult.toFixed(2)}</span>}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {sim.topRecalibrationSignals && sim.topRecalibrationSignals.length > 0 && (
            <p className="mt-2 text-[11.5px] text-muted">
              Strongest signal: {humanize(sim.topRecalibrationSignals[0].signal)}. {sim.topRecalibrationSignals[0].action}
            </p>
          )}
        </section>
      </div>
    </details>
  );
}
