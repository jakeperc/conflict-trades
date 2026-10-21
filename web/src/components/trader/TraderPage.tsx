import { useMemo } from "react";
import type { TraderPayload } from "../../types";
import { useData } from "../../lib/data";
import { daysBetween, traderKpis } from "../../lib/derive";
import { dateTime, humanize, money, pct, shortDate, signedMoney, signedPct } from "../../lib/format";
import { navigate, useRoute } from "../../lib/router";
import { DirBadge, NumberTicker, Panel, Skeleton, scoreColor } from "../ui/primitives";
import { AllocationDonut, EquityChart, allocationSlices } from "./charts";
import { EdgeKey, FactorBars, Ladder } from "./parts";
import { PositionDrawer } from "./PositionDrawer";
import { SimulationLab } from "./SimulationLab";

export function TraderPage() {
  const { trader, refresh, source, reloadTrader } = useData();
  const route = useRoute();
  const data = trader.data;

  if (!data?.state) {
    if (trader.status === "error") {
      return (
        <div className="panel mx-auto mt-10 max-w-lg p-6 text-center">
          <div className="label mb-2">Could not load the AI trader</div>
          <p className="text-[14px] text-dim">{trader.error}</p>
          <button type="button" className="btn btn-accent mt-4" onClick={reloadTrader}>
            Retry
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading AI trader">
        <Skeleton className="h-[290px] rounded-[14px]" />
        <Skeleton className="h-[86px] rounded-[14px]" />
        <Skeleton className="h-[360px] rounded-[14px]" />
      </div>
    );
  }

  return (
    <>
      <TraderBody data={data} scenarios={refresh.data?.scenarios} live={source === "live"} />
      {route.positionId && <PositionDrawer id={route.positionId} state={data.state} />}
    </>
  );
}

function TraderBody({ data, scenarios, live }: { data: TraderPayload; scenarios: Parameters<typeof allocationSlices>[2]; live: boolean }) {
  const { state, memory, simulation, calibration } = data;
  const k = traderKpis(state, data.live);
  const slices = useMemo(() => allocationSlices(state.openPositions, state.cash, scenarios), [state.openPositions, state.cash, scenarios]);
  const recentClosed = useMemo(() => [...state.closedTrades].reverse().slice(0, 12), [state.closedTrades]);
  const up = k.pctVsStart >= 0;
  const asOf = live && data.live?.fetchedAt ? `marked ${dateTime(data.live.fetchedAt)}` : state.lastRunAt ? `as of cycle ${state.cycles}, ${dateTime(state.lastRunAt)}` : "waiting for first cycle";

  const kpis: { label: string; value: React.ReactNode; tone?: string; hint?: string }[] = [
    { label: "Since last cycle", value: k.dayChange == null ? "—" : signedMoney(k.dayChange), tone: k.dayChange == null ? undefined : k.dayChange >= 0 ? "var(--color-long)" : "var(--color-short)" },
    { label: "Max drawdown", value: pct(k.drawdown.maxDd, 1), tone: k.drawdown.maxDd < 0 ? "var(--color-short)" : undefined, hint: "Largest peak-to-trough fall in the equity curve" },
    { label: "Exposure", value: pct(k.exposure, 0), hint: "Marked value of open positions as a share of equity" },
    { label: "Win rate", value: k.winRate == null ? "—" : `${pct(k.winRate, 0)}`, hint: `${k.wins} of ${k.closedCount} closed trades` },
    { label: "Profit factor", value: k.profitFactor == null ? "—" : k.profitFactor === Infinity ? "∞" : k.profitFactor.toFixed(2), hint: "Gross realized gains ÷ gross realized losses" },
    { label: "Cash", value: money(state.cash, true) },
    { label: "Cycles", value: String(state.cycles) },
    { label: "Memory", value: String(memory?.summary?.bucketCount ?? 0), hint: "Learned pattern buckets" }
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className="panel overflow-hidden" aria-labelledby="equity-h">
        <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,2fr)] lg:items-end">
          <div>
            <div className="label">AI trader · paper book</div>
            <h1 id="equity-h" className="display mt-2 text-[44px] leading-none tracking-[-0.02em] sm:text-[52px]">
              <NumberTicker value={k.equity} format={(v) => money(v)} />
            </h1>
            <div className="num mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
              <span style={{ color: up ? "var(--color-long)" : "var(--color-short)" }}>{signedPct(k.pctVsStart, 2)}</span>
              <span className="text-muted">vs {money(state.startingCash, true)} start</span>
            </div>
            <div className="num mt-1 text-[11px] text-muted">{asOf}</div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <i className="block h-2 w-2 rounded-full bg-long" /> winning exit
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="block h-2 w-2 rounded-full bg-short" /> losing exit
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="block h-2.5 w-px bg-accent" /> entry
              </span>
            </div>
          </div>
          <EquityChart curve={state.equityCurve} start={state.startingCash} closed={state.closedTrades} open={state.openPositions} />
        </div>
        <dl className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4 xl:grid-cols-8">
          {kpis.map((x) => (
            <div key={x.label} className="bg-[rgb(9_12_20)] px-4 py-3 sm:px-5" title={x.hint}>
              <dt className="label text-[9.5px]">{x.label}</dt>
              <dd className="num mt-1 text-[16px]" style={{ color: x.tone }}>
                {x.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <Panel label="Marked to market" title={`Open positions · ${state.openPositions.length}`} bodyClass="pb-2" right={<span className="text-[11.5px] text-muted">Select a row for the full thesis</span>}>
          {state.openPositions.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">No open positions. The next /ai-trader cycle scores fresh candidates.</p>
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="data-table min-w-[760px]">
                <thead>
                  <tr>
                    <th className="pl-5">Position</th>
                    <th>Theater</th>
                    <th>Stop → target</th>
                    <th className="r">Mark</th>
                    <th className="r">P&L</th>
                    <th className="r">Days left</th>
                    <th className="r pr-5">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {state.openPositions.map((p) => {
                    const score = p.finalScoreAtEntry ?? Math.round((p.confidenceAtEntry ?? 0) * 100);
                    const good = (p.unrealizedPct ?? 0) >= 0;
                    const left = Math.max(0, p.horizonDays - daysBetween(p.entryDate));
                    const open = () => navigate({ page: "trader", positionId: p.id });
                    return (
                      <tr
                        key={p.id}
                        data-row
                        tabIndex={0}
                        className="cursor-pointer outline-none focus-visible:bg-raise"
                        onClick={open}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            open();
                          }
                        }}
                      >
                        <td className="pl-5">
                          <span className="flex items-center gap-2">
                            <span className="num w-11 text-[14px] font-semibold">{p.ticker}</span>
                            <DirBadge dir={p.direction} />
                          </span>
                        </td>
                        <td className="max-w-[180px] truncate text-[12.5px] text-dim">{p.scenarioTitle ?? p.scenario}</td>
                        <td>
                          <Ladder p={p} />
                        </td>
                        <td className="r num">{money(p.currentPrice)}</td>
                        <td className="r num" style={{ color: good ? "var(--color-long)" : "var(--color-short)" }}>
                          <div>{signedPct(p.unrealizedPct, 2)}</div>
                          <div className="text-[10.5px] opacity-80">{signedMoney(p.unrealizedPnlDollar)}</div>
                        </td>
                        <td className="r num text-dim">
                          {left}
                          <span className="text-muted">/{p.horizonDays}</span>
                        </td>
                        <td className="r pr-5">
                          <span className="num inline-block min-w-8 rounded-[5px] px-1.5 py-0.5 text-center text-[12px]" style={{ color: scoreColor(score), background: "rgb(255 255 255 / .04)" }}>
                            {score.toFixed(0)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel label="Marked value" title="Allocation">
          <AllocationDonut slices={slices} />
          <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
            Diversification is enforced at entry: each extra position in a crowded theater takes a score penalty.
          </p>
        </Panel>
      </div>

      <Panel label="Next candidates" title="Watchlist" right={<span className="text-[11.5px] text-muted">Ranked by composite score · 7 factors</span>}>
        {(state.lastWatchlist ?? []).length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">Run /ai-trader to score candidates.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {(state.lastWatchlist ?? []).map((c) => {
              const score = c.finalScore ?? Math.round((c.confidence ?? 0) * 100);
              return (
                <li key={`${c.ticker}-${c.direction}-${c.scenario}`} className="flex flex-col gap-3 rounded-xl border border-line bg-[rgb(255_255_255/.02)] p-3.5 transition-colors hover:border-line-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="num text-[15px] font-semibold">{c.ticker}</span>
                        <DirBadge dir={c.direction} />
                        {c.held && <span className="num rounded px-1 text-[9.5px] tracking-[0.08em] text-accent ring-1 ring-[rgb(139_147_255/.4)]">HELD</span>}
                      </div>
                      <div className="mt-1 truncate text-[11.5px] text-muted">
                        {(c.scenarioTitle ?? c.scenario).split("/")[0].trim()} · {c.sector}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="display text-[24px] leading-none" style={{ color: scoreColor(score) }}>
                        {score.toFixed(0)}
                      </div>
                      <div className="label mt-1 text-[9px]">score</div>
                    </div>
                  </div>
                  <FactorBars components={c.components} />
                  <div className="num flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-muted">
                    <span>{money(c.price)}</span>
                    <span>22d {signedPct(c.momentum22d, 1)}</span>
                    <span>vol {pct(c.annualizedVol, 0)}</span>
                    {c.rewardToRisk != null && <span>R:R {c.rewardToRisk.toFixed(2)}x</span>}
                    <span>mem ×{(c.memoryMult ?? 1).toFixed(2)}</span>
                    {(c.diversificationPenalty ?? 0) > 0 && <span className="text-short">−{c.diversificationPenalty?.toFixed(0)} div</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel label="Most recent first · each one updates memory" title={`Closed trades · ${state.closedTrades.length}`} bodyClass="pb-2">
          {recentClosed.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-muted">No closed trades yet; memory fills as positions exit.</p>
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="data-table min-w-[640px]">
                <thead>
                  <tr>
                    <th className="pl-5">Trade</th>
                    <th>Theater</th>
                    <th className="r">Return</th>
                    <th className="r">Days</th>
                    <th>Exit</th>
                    <th className="pr-5">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentClosed.map((t) => {
                    const win = t.outcome === "win";
                    return (
                      <tr key={`${t.id}-${t.exitDate}`} data-row tabIndex={0} className="cursor-pointer outline-none focus-visible:bg-raise" onClick={() => navigate({ page: "trader", positionId: t.id })} onKeyDown={(e) => e.key === "Enter" && navigate({ page: "trader", positionId: t.id })}>
                        <td className="pl-5">
                          <span className="flex items-center gap-2">
                            <i className="block h-2 w-2 rounded-full" style={{ background: win ? "var(--color-long)" : "var(--color-short)" }} aria-label={t.outcome} />
                            <span className="num w-11 font-semibold">{t.ticker}</span>
                            <DirBadge dir={t.direction} />
                          </span>
                        </td>
                        <td className="max-w-[160px] truncate text-[12.5px] text-dim">{(t.scenarioTitle ?? t.scenario).split("/")[0].trim()}</td>
                        <td className="r num" style={{ color: win ? "var(--color-long)" : "var(--color-short)" }}>
                          {signedPct(t.realizedPct, 2)}
                        </td>
                        <td className="r num text-dim">{t.holdingDays}</td>
                        <td className="text-[12px] text-dim">{humanize(t.exitReason)}</td>
                        <td className="num pr-5 text-[12px] text-muted">{shortDate(t.exitDate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel label="Patterns with ≥3 closed trades" title="Learned edges">
          <div className="flex flex-col gap-4">
            <div>
              <div className="label mb-2 text-long">Lean into</div>
              <ul className="flex flex-col gap-1.5">
                {(memory?.summary?.top ?? []).slice(0, 5).map((b) => (
                  <li key={b.key} className="rounded-lg border border-line bg-raise px-2.5 py-2" style={{ boxShadow: "inset 2px 0 0 var(--color-long)" }}>
                    <EdgeKey k={b.key} />
                    <div className="num mt-1.5 flex gap-3 text-[11px]">
                      <span className="text-long">{pct(b.winRate, 0)} win</span>
                      <span className="text-muted">n={b.n}</span>
                      <span className="text-long">avg {signedPct(b.avgPnlPct, 1)}</span>
                    </div>
                  </li>
                ))}
                {!(memory?.summary?.top ?? []).length && <li className="text-[12px] text-muted">Needs ≥3 closed trades per pattern.</li>}
              </ul>
            </div>
            <div>
              <div className="label mb-2 text-short">Avoid</div>
              <ul className="flex flex-col gap-1.5">
                {(memory?.summary?.bottom ?? [])
                  .filter((b) => b.score < 0)
                  .slice(0, 5)
                  .map((b) => (
                    <li key={b.key} className="rounded-lg border border-line bg-raise px-2.5 py-2" style={{ boxShadow: "inset 2px 0 0 var(--color-short)" }}>
                      <EdgeKey k={b.key} />
                      <div className="num mt-1.5 flex gap-3 text-[11px]">
                        <span className="text-short">{pct(b.winRate, 0)} win</span>
                        <span className="text-muted">n={b.n}</span>
                        <span className="text-short">avg {signedPct(b.avgPnlPct, 1)}</span>
                      </div>
                    </li>
                  ))}
                {!(memory?.summary?.bottom ?? []).some((b) => b.score < 0) && <li className="text-[12px] text-muted">No underperforming patterns yet.</li>}
              </ul>
            </div>
          </div>
        </Panel>
      </div>

      <SimulationLab sim={simulation} calibration={calibration} />
    </div>
  );
}
