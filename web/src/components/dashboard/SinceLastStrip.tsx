import type { RefreshPayload, TraderPayload } from "../../types";
import type { TraderSnapshot } from "../../lib/derive";
import { scenarioDeltas, traderKpis, traderSince } from "../../lib/derive";
import { dateTime, shortScenarioLabel, signedMoney } from "../../lib/format";
import { heatBand } from "../../lib/heat";
import { navigate } from "../../lib/router";

export function SinceLastStrip({
  current,
  baseline,
  trader,
  traderBaseline,
  onSelect
}: {
  current: RefreshPayload;
  baseline: RefreshPayload | null;
  trader: TraderPayload | null;
  traderBaseline: TraderSnapshot | null;
  onSelect: (key: string) => void;
}) {
  if (!baseline) {
    return (
      <p className="num text-[11.5px] text-muted">
        <span className="label mr-2">Since last visit</span>
        First look from this browser. Changes since your last visit will collect here.
      </p>
    );
  }
  const deltas = scenarioDeltas(current, baseline);
  const since = trader?.state ? traderSince(trader.state, traderBaseline) : null;
  const k = trader?.state ? traderKpis(trader.state, trader.live) : null;
  const eqDelta = k && traderBaseline ? k.equity - traderBaseline.equity : null;

  return (
    <div className="scroll-thin -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label={`Changes since ${dateTime(baseline.generatedAt)}`}>
      <span className="label shrink-0 pr-1" title={`Compared with the data you last saw (${dateTime(baseline.generatedAt)})`}>
        Since {dateTime(baseline.generatedAt)}
      </span>
      {deltas.map((d) => {
        const s = current.scenarios[d.key];
        const band = heatBand(d.heat);
        return (
          <button key={d.key} type="button" onClick={() => onSelect(d.key)} className="chip shrink-0 gap-2 transition-colors hover:border-line-2 hover:text-text">
            <span>{shortScenarioLabel(s.title, s.key)}</span>
            <span className="num" style={{ color: d.heatDelta ? band.color : "var(--color-muted)" }}>
              {d.heatDelta == null ? "new" : d.heatDelta === 0 ? "±0" : `${d.heatDelta > 0 ? "▲" : "▼"}${Math.abs(d.heatDelta)}`}
            </span>
            {d.newHeadlines > 0 && <span className="num text-dim">{d.newHeadlines} new</span>}
          </button>
        );
      })}
      {since && (
        <button type="button" onClick={() => navigate({ page: "trader" })} className="chip shrink-0 gap-2 transition-colors hover:border-line-2 hover:text-text">
          <span>AI book</span>
          {eqDelta != null && (
            <span className="num" style={{ color: eqDelta >= 0 ? "var(--color-long)" : "var(--color-short)" }}>
              {signedMoney(eqDelta)}
            </span>
          )}
          <span className="num text-dim">
            {since.cycles} cycle{since.cycles === 1 ? "" : "s"} · {since.entered.length} in · {since.exited.length} out
          </span>
        </button>
      )}
    </div>
  );
}
