import { m } from "motion/react";
import type { RefreshPayload, Scenario, TraderState } from "../../types";
import { alignedMomentum, theaterPositions, thesisConfirmation, topSetups } from "../../lib/derive";
import { pp, signedInt, signedPct } from "../../lib/format";
import { heatBand } from "../../lib/heat";
import { navigate } from "../../lib/router";
import { DirBadge, HeatGauge } from "../ui/primitives";

export function TheaterCard({
  scenario,
  index,
  total,
  baseline,
  trader
}: {
  scenario: Scenario;
  index: number;
  total: number;
  baseline: RefreshPayload | null;
  trader: TraderState | null;
}) {
  const band = heatBand(scenario.heat);
  const prev = baseline?.scenarios?.[scenario.key];
  const dHeat = prev ? scenario.heat - prev.heat : null;
  const conf = thesisConfirmation(scenario);
  const held = theaterPositions(trader, scenario.key);
  const setups = topSetups(scenario, 3);
  const ww3 = scenario.ww3Signal;

  return (
    <article
      className="panel flex min-h-0 flex-col overflow-hidden"
      aria-labelledby="theater-title"
      style={{ boxShadow: `inset 3px 0 0 ${scenario.color}, inset 0 1px 0 rgb(255 255 255 / .04), 0 20px 40px -24px rgb(0 0 0 / .6)` }}
    >
      <m.div
        key={scenario.key}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="scroll-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-5"
      >
        <header>
          <div className="label flex items-center gap-2">
            <span>
              Theater {String(index + 1).padStart(2, "0")}/{String(total).padStart(2, "0")}
            </span>
            {scenario.geo && <span className="text-faint">·</span>}
            {scenario.geo && <span>{scenario.geo.label}</span>}
          </div>
          <h1 id="theater-title" className="mt-1.5 text-[22px] font-semibold leading-tight tracking-[-0.02em]">
            {scenario.title}
          </h1>
          <p className="mt-1 text-[13px] text-dim">{scenario.subtitle}</p>
        </header>

        <div className="grid grid-cols-[auto_1fr] items-center gap-4">
          <HeatGauge heat={scenario.heat} size={124} />
          <dl className="num grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-[12px]">
            <dt className="text-muted">Since last visit</dt>
            <dd className="text-right">
              {dHeat == null ? <span className="text-muted">first look</span> : dHeat === 0 ? <span className="text-muted">unchanged</span> : <span style={{ color: band.color }}>{signedInt(dHeat)} pts</span>}
            </dd>
            <dt className="text-muted" title="Mean 22-day momentum of the LONG legs minus the SHORT legs. Positive = the market is paying for this thesis.">
              Market confirms <span aria-hidden="true" className="text-faint">ⓘ</span>
            </dt>
            <dd className="text-right font-semibold" style={{ color: conf == null ? undefined : conf >= 0 ? "var(--color-long)" : "var(--color-short)" }}>
              {pp(conf)}
            </dd>
            <dt className="text-muted" title="Tilt from the sibling Conflict Monitor dashboard">
              Monitor tilt
            </dt>
            <dd className="text-right text-dim">{ww3 ? signedInt(ww3.tilt) : "—"}</dd>
            <dt className="text-muted">Trades on desk</dt>
            <dd className="text-right text-dim">
              {scenario.trades.filter((t) => t.direction === "LONG").length}L / {scenario.trades.filter((t) => t.direction === "SHORT").length}S
            </dd>
          </dl>
        </div>

        {ww3 && ww3.sources.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="label mr-1">Moved by</span>
            {ww3.sources.map((src) => (
              <span key={src} className="chip h-5 text-[10.5px]">
                {src.replace(/-/g, " ")}
              </span>
            ))}
            <a href="/conflict-monitor/" className="link-quiet ml-auto text-[11px]">
              Conflict Monitor
            </a>
          </div>
        )}

        <p className="text-[13.5px] leading-relaxed text-dim">{scenario.summary}</p>

        <section aria-label="AI book in this theater">
          <div className="label mb-2">AI book here</div>
          {held.length === 0 ? (
            <p className="text-[12.5px] text-muted">No open positions in this theater.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {held.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => navigate({ page: "trader", positionId: p.id })}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-raise"
                  >
                    <span className="num w-12 text-[13px] font-semibold">{p.ticker}</span>
                    <DirBadge dir={p.direction} />
                    <span className="truncate text-[12px] text-muted">{p.sector}</span>
                    <span className="num ml-auto text-[12.5px]" style={{ color: (p.unrealizedPct ?? 0) >= 0 ? "var(--color-long)" : "var(--color-short)" }}>
                      {signedPct(p.unrealizedPct, 2)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Top setups">
          <div className="label mb-2" title="Highest reward-to-risk among trades whose 22-day momentum already agrees with the direction">
            Top setups · market agreeing
          </div>
          <ul className="flex flex-col gap-1">
            {setups.map((t) => {
              const am = alignedMomentum(t);
              return (
                <li key={`${t.ticker}-${t.direction}`} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                  <span className="num w-12 text-[13px] font-semibold">{t.ticker}</span>
                  <DirBadge dir={t.direction} />
                  <span className="truncate text-[12px] text-muted">{t.sector}</span>
                  <span className="num ml-auto text-[12px] text-dim">{t.rewardToRisk?.toFixed(2)}x</span>
                  <span className="num w-14 text-right text-[12px]" style={{ color: am == null ? undefined : am >= 0 ? "var(--color-long)" : "var(--color-short)" }}>
                    {signedPct(am, 1)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {scenario.topPairTrade && (
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3">
            <span className="label">Featured pair</span>
            <span className="num text-[12.5px] text-text">{scenario.topPairTrade}</span>
          </div>
        )}
      </m.div>
    </article>
  );
}
