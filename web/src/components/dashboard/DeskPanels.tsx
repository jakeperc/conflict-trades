import type { RefreshPayload, Scenario } from "../../types";
import { driverBars, newHeadlineTitles } from "../../lib/derive";
import { ago, splitHeadline, stripHtml } from "../../lib/format";
import { heatBand } from "../../lib/heat";
import { ExternalMark, Panel } from "../ui/primitives";

export function Drivers({ scenario }: { scenario: Scenario }) {
  const bars = driverBars(scenario);
  const history = scenario.heatHistory ?? [];
  return (
    <Panel label="What is driving heat" title="Drivers" right={<span className="num text-[11px] text-muted">baseline = heat {scenario.heat}</span>}>
      <ul className="flex flex-col gap-3.5">
        {bars.map((b) => {
          const band = heatBand(b.value);
          return (
            <li key={b.label}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[12.5px]">
                <span className="text-dim">{b.label}</span>
                <span className="num">
                  <span className="text-muted">{b.bump > 0 ? `+${b.bump} from headlines · ` : b.bump < 0 ? `${b.bump} offset · ` : ""}</span>
                  <span style={{ color: band.color }}>{b.value}</span>
                </span>
              </div>
              <div className="relative h-[6px] overflow-hidden rounded-full bg-[rgb(148_163_184/.1)]" aria-hidden="true">
                <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${b.base}%`, background: `${band.color}66` }} />
                {b.bump > 0 && <div className="absolute inset-y-0 rounded-r-full" style={{ left: `${b.base}%`, width: `${b.bump}%`, background: band.color }} />}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
        Each driver starts at the theater's heat; the bright segment is the bump from keyword hits in the latest headlines.
      </p>
      {history.length >= 7 && <HeatTrend history={history} />}
    </Panel>
  );
}

function HeatTrend({ history }: { history: { t: string; heat: number }[] }) {
  const w = 300;
  const h = 48;
  const xs = history.map((_, i) => (i / (history.length - 1)) * w);
  const ys = history.map((p) => h - 4 - ((p.heat - 35) / 61) * (h - 8));
  const d = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join("");
  return (
    <div className="mt-4">
      <div className="label mb-1">Heat trend</div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={d} fill="none" stroke="var(--color-dim)" strokeWidth="1.4" />
      </svg>
    </div>
  );
}

export function Indicators({ scenario }: { scenario: Scenario }) {
  return (
    <Panel label="Model-implied" title="Market transmission">
      <dl className="grid grid-cols-2 gap-2">
        {scenario.indicators.map((i) => (
          <div key={i.label} className="rounded-lg border border-line bg-[rgb(255_255_255/.02)] px-3 py-2.5">
            <dt className="text-[11.5px] text-muted">{i.label}</dt>
            <dd className="num mt-1 text-[16px] text-text">
              {i.value}
              <span className="ml-1 text-[11px] text-muted">{i.unit}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
        Derived from heat and sub-scores against a fixed base, not live market prints. Read them as the model's pressure gauge.
      </p>
    </Panel>
  );
}

export function Effects({ scenario }: { scenario: Scenario }) {
  return (
    <Panel label="Second-order" title="Knock-on effects">
      <ol className="flex flex-col gap-2.5">
        {scenario.secondOrderEffects.map((e, i) => (
          <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-dim">
            <span className="num mt-[3px] text-[10.5px] text-faint">{String(i + 1).padStart(2, "0")}</span>
            <span>{e}</span>
          </li>
        ))}
        {scenario.secondOrderEffects.length === 0 && <li className="text-[13px] text-muted">No second-order effects listed.</li>}
      </ol>
    </Panel>
  );
}

export function Headlines({ scenario, baseline }: { scenario: Scenario; baseline: RefreshPayload | null }) {
  const fresh = newHeadlineTitles(scenario, baseline);
  return (
    <Panel label="Signal inputs" title="Headlines" right={<span className="num text-[11px] text-muted">{scenario.headlines.length} · newest first</span>} bodyClass="px-2 pb-3 sm:px-3">
      {scenario.headlines.length === 0 ? (
        <p className="px-2 py-6 text-center text-[13px] text-muted">No recent headlines came back for this refresh window.</p>
      ) : (
        <ul className="flex flex-col">
          {scenario.headlines.map((hd) => {
            const { text, source } = splitHeadline(hd.title, hd.source);
            const isNew = fresh.has(hd.title);
            const rel = hd.relevance ?? 1;
            return (
              <li key={hd.link}>
                <a
                  href={hd.link}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="group flex gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-raise"
                  title={stripHtml(hd.description).slice(0, 240) || undefined}
                >
                  <span className="mt-[6px] flex shrink-0 gap-[2px]" title={`Signal relevance ${rel}/5`} aria-label={`relevance ${rel} of 5`}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <i key={i} className="block h-[10px] w-[3px] rounded-full" style={{ background: i < rel ? "var(--color-dim)" : "var(--color-faint)" }} />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] leading-snug text-text group-hover:underline group-hover:decoration-line-2 group-hover:underline-offset-4">
                      {text}
                      <ExternalMark />
                    </span>
                    <span className="num mt-1 flex items-center gap-2 text-[10.5px] text-muted">
                      {isNew && (
                        <span className="rounded px-1 py-[1px] font-semibold tracking-[0.1em] text-accent ring-1 ring-[rgb(139_147_255/.4)]">NEW</span>
                      )}
                      <span className="truncate">{source || "News"}</span>
                      <span className="text-faint">·</span>
                      <span>{ago(hd.publishedAt)}</span>
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function Methodology({ payload }: { payload: RefreshPayload }) {
  return (
    <Panel label="How to read this" title="Method & disclaimer">
      <div className="flex flex-col gap-4 text-[12.5px] leading-relaxed text-dim">
        <p>{payload.methodology}</p>
        <p>
          Heat bands: <span style={{ color: "var(--color-heat-critical)" }}>Critical ≥95</span> ·{" "}
          <span style={{ color: "var(--color-heat-high)" }}>High ≥75</span> · <span style={{ color: "var(--color-heat-moderate)" }}>Moderate ≥50</span> ·{" "}
          <span style={{ color: "var(--color-heat-low)" }}>Low</span>. "Market confirms" is the mean 22-day move of a theater's LONG legs minus its SHORT legs.
        </p>
        <p className="rounded-lg border border-line bg-[rgb(255_255_255/.02)] p-3 text-[12px] text-muted">{payload.disclaimer}</p>
        <p className="num text-[10.5px] text-muted">
          Data: Google News RSS · Stooq / Yahoo Finance daily closes · CFTC, EIA, OFAC, DoD and CENTCOM feeds · Conflict Monitor tilt. Paper trading only.
        </p>
      </div>
    </Panel>
  );
}
