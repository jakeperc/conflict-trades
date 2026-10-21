import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { RefreshPayload, Scenario, Trade, TraderState } from "../../types";
import { alignedMomentum, alsoIn, heldIndex, heldKey } from "../../lib/derive";
import { money, pct, shortScenarioLabel, signedPct } from "../../lib/format";
import { navigate } from "../../lib/router";
import { useUi } from "../../lib/store";
import { DirBadge, Panel, Pips, Sparkline } from "../ui/primitives";
import { buildMapModel } from "../map/mapModel";

type SortKey = "aligned" | "ticker" | "price" | "m5" | "m22" | "vol" | "rr" | "conviction";
const FILTERS = [
  { key: "all", label: "All" },
  { key: "LONG", label: "Long" },
  { key: "SHORT", label: "Short" },
  { key: "Defense", label: "Defense" },
  { key: "Energy", label: "Energy" }
] as const;

const sorters: Record<SortKey, (t: Trade) => number | string | null> = {
  aligned: (t) => alignedMomentum(t),
  ticker: (t) => t.ticker,
  price: (t) => t.price,
  m5: (t) => t.momentum5d ?? null,
  m22: (t) => t.momentum22d ?? null,
  vol: (t) => t.annualizedVol ?? null,
  rr: (t) => t.rewardToRisk,
  conviction: (t) => t.conviction
};

function compare(a: number | string | null, b: number | string | null, dir: 1 | -1) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "string" || typeof b === "string") return String(a).localeCompare(String(b)) * dir;
  return (a - b) * dir;
}

const momColor = (v: number | null | undefined) => (v == null ? "var(--color-muted)" : v >= 0 ? "var(--color-long)" : "var(--color-short)");

export function TradesTable({ scenario, payload, trader }: { scenario: Scenario; payload: RefreshPayload; trader: TraderState | null }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "aligned", dir: -1 });
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const query = useUi((s) => s.tradeFilterText);
  const setQuery = useUi((s) => s.setTradeFilterText);
  const hoverLane = useUi((s) => s.hoverLane);
  const setHoverTrade = useUi((s) => s.setHoverTrade);
  const inputRef = useRef<HTMLInputElement>(null);
  const held = useMemo(() => heldIndex(trader), [trader]);
  const also = useMemo(() => alsoIn(payload), [payload]);
  const laneSectors = useMemo(() => {
    if (!hoverLane) return null;
    const lane = buildMapModel([scenario]).lanes.find((l) => l.id === hoverLane);
    return lane ? new Set(lane.sectors) : null;
  }, [hoverLane, scenario]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scenario.trades
      .filter((t) => {
        if (filter === "LONG" || filter === "SHORT") return t.direction === filter;
        if (filter !== "all") return (t.sector || "").toLowerCase().includes(filter.toLowerCase());
        return true;
      })
      .filter((t) => !q || `${t.ticker} ${t.sector} ${t.thesis ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => compare(sorters[sort.key](a), sorters[sort.key](b), sort.dir));
  }, [scenario.trades, filter, query, sort]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const th = (key: SortKey, label: string, className = "", title?: string) => {
    const active = sort.key === key;
    return (
      <th className={className} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"} title={title}>
        <button
          type="button"
          className={`inline-flex items-center gap-1 uppercase tracking-[0.12em] transition-colors hover:text-text ${active ? "text-text" : ""}`}
          onClick={() => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "ticker" ? 1 : -1 }))}
        >
          {label}
          <span aria-hidden="true" className="text-[9px]">
            {active ? (sort.dir === 1 ? "▲" : "▼") : ""}
          </span>
        </button>
      </th>
    );
  };

  const heldBadge = (t: Trade) => {
    const p = held.get(heldKey(t.ticker, t.direction));
    if (!p) return null;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          navigate({ page: "trader", positionId: p.id });
        }}
        className="num inline-flex h-[18px] items-center gap-1 rounded-[5px] px-1.5 text-[9.5px] font-semibold tracking-[0.08em] text-accent ring-1 ring-[rgb(139_147_255/.4)] transition-colors hover:bg-accent-soft"
        title={`AI trader holds ${p.ticker} (${p.scenarioTitle ?? p.scenario}), ${signedPct(p.unrealizedPct, 2)}. Open position.`}
      >
        AI HELD
      </button>
    );
  };

  const alsoChip = (t: Trade) => {
    const keys = (also.get(t.ticker) ?? []).filter((k) => k !== scenario.key);
    if (!keys.length) return null;
    const names = keys.map((k) => shortScenarioLabel(payload.scenarios[k]?.title ?? k, k));
    return (
      <span className="num text-[10px] text-muted" title={`Also on the ${names.join(", ")} desk${keys.length > 1 ? "s" : ""}`}>
        +{keys.length}
      </span>
    );
  };

  return (
    <Panel
      id="trades"
      label={`${shortScenarioLabel(scenario.title, scenario.key)} desk`}
      title="Trades"
      bodyClass="pb-2"
      right={
        <>
          <div className="seg" role="group" aria-label="Filter trades">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
          <label className="relative">
            <span className="sr-only">Filter by ticker, sector or thesis</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery("");
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="Filter"
              className="num h-[36px] w-32 rounded-[10px] border border-line bg-raise pl-3 pr-7 text-[12px] text-text placeholder:text-muted focus:w-44 focus:border-line-2 focus:outline-none sm:w-36"
              style={{ transition: "width .2s" }}
            />
            <kbd className="num pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line-2 px-1 text-[9.5px] text-muted">/</kbd>
          </label>
        </>
      }
    >
      {/* desktop table */}
      <div className="scroll-thin hidden overflow-x-auto md:block">
        <table className="data-table min-w-[960px]">
          <thead>
            <tr>
              {th("ticker", "Ticker", "pl-5")}
              <th>Dir</th>
              <th>Sector</th>
              {th("price", "Price", "r")}
              {th("m5", "5d", "r")}
              {th("m22", "22d", "r")}
              {th("aligned", "Aligned", "r", "Direction sign x 22-day momentum: positive means the market is moving the way the trade wants")}
              {th("vol", "Vol", "r")}
              {th("rr", "R:R", "")}
              <th>Horizon</th>
              <th className="pr-5">40d</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="py-8 text-center text-[13px] text-muted">
                  No trades match this filter.
                </td>
              </tr>
            )}
            {rows.map((t) => {
              const id = `${scenario.key}:${t.ticker}:${t.direction}`;
              const isOpen = open.has(id);
              const am = alignedMomentum(t);
              const lit = laneSectors?.has(t.sector);
              return (
                <Fragment key={id}>
                  <tr
                    data-row
                    tabIndex={0}
                    aria-expanded={isOpen}
                    className="cursor-pointer outline-none focus-visible:bg-raise"
                    style={lit ? { background: "rgb(139 147 255 / .09)", boxShadow: "inset 3px 0 0 var(--color-accent)" } : undefined}
                    onClick={() => toggle(id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(id);
                      }
                    }}
                    onPointerEnter={() => setHoverTrade({ scenario: scenario.key, sector: t.sector, ticker: t.ticker })}
                    onPointerLeave={() => setHoverTrade(null)}
                    onFocus={() => setHoverTrade({ scenario: scenario.key, sector: t.sector, ticker: t.ticker })}
                    onBlur={() => setHoverTrade(null)}
                  >
                    <td className="pl-5">
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true" className={`text-[10px] text-muted transition-transform ${isOpen ? "rotate-90" : ""}`}>
                          ▸
                        </span>
                        <span className="num w-11 text-[13.5px] font-semibold">{t.ticker}</span>
                        <Pips n={t.conviction} title={`Conviction ${t.conviction}/5`} />
                        {heldBadge(t)}
                        {alsoChip(t)}
                      </span>
                    </td>
                    <td>
                      <DirBadge dir={t.direction} />
                    </td>
                    <td className="max-w-[170px] truncate text-[12.5px] text-dim">{t.sector}</td>
                    <td className="r num">
                      {money(t.price)}
                      {t.priceSource === "Fallback baseline" && (
                        <span className="text-heat-moderate" title="Fallback price: live quote unavailable">
                          ~
                        </span>
                      )}
                    </td>
                    <td className="r num text-[12.5px]" style={{ color: momColor(t.momentum5d) }}>
                      {signedPct(t.momentum5d, 1)}
                    </td>
                    <td className="r num text-[12.5px]" style={{ color: momColor(t.momentum22d) }}>
                      {signedPct(t.momentum22d, 1)}
                    </td>
                    <td className="r num text-[12.5px] font-semibold" style={{ color: momColor(am) }}>
                      {signedPct(am, 1)}
                    </td>
                    <td className="r num text-[12.5px] text-dim">{pct(t.annualizedVol, 0)}</td>
                    <td>
                      {t.rewardToRisk != null ? (
                        <span className="flex items-center gap-2">
                          <span className="block h-[4px] w-14 overflow-hidden rounded-full bg-[rgb(148_163_184/.12)]">
                            <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (t.rewardToRisk / 3) * 100)}%`, background: t.rewardToRisk >= 2 ? "var(--color-long)" : "var(--color-dim)" }} />
                          </span>
                          <span className="num text-[12px] text-dim">{t.rewardToRisk.toFixed(2)}x</span>
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="text-[12.5px] text-dim">{t.horizon ?? "—"}</td>
                    <td className="pr-5">
                      <Sparkline series={t.priceSeries} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={11} className="bg-[rgb(255_255_255/.015)] px-5 py-4">
                        <TradeDetail t={t} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* mobile cards */}
      <ul className="flex flex-col gap-2 px-4 md:hidden">
        {rows.map((t) => {
          const id = `${scenario.key}:${t.ticker}:${t.direction}`;
          const isOpen = open.has(id);
          const am = alignedMomentum(t);
          return (
            <li key={id} className="rounded-xl border border-line bg-[rgb(255_255_255/.02)]">
              <button type="button" className="flex w-full flex-col gap-2 p-3 text-left" aria-expanded={isOpen} onClick={() => toggle(id)}>
                <span className="flex items-center gap-2">
                  <span className="num text-[15px] font-semibold">{t.ticker}</span>
                  <DirBadge dir={t.direction} />
                  {held.has(heldKey(t.ticker, t.direction)) && (
                    <span className="num rounded-[5px] px-1.5 text-[9.5px] font-semibold tracking-[0.08em] text-accent ring-1 ring-[rgb(139_147_255/.4)]">AI HELD</span>
                  )}
                  <span className="num ml-auto text-[13px]">{money(t.price)}</span>
                </span>
                <span className="flex items-center gap-3 text-[11.5px] text-muted">
                  <span className="truncate">{t.sector}</span>
                  <span className="num ml-auto" style={{ color: momColor(am) }}>
                    {signedPct(am, 1)} aligned
                  </span>
                  <span className="num">{t.rewardToRisk != null ? `${t.rewardToRisk.toFixed(2)}x` : "—"}</span>
                  <Sparkline series={t.priceSeries} width={56} height={18} />
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-line p-3">
                  <TradeDetail t={t} />
                  {held.get(heldKey(t.ticker, t.direction)) && (
                    <button type="button" className="btn btn-accent mt-3 h-8 w-full" onClick={() => navigate({ page: "trader", positionId: held.get(heldKey(t.ticker, t.direction))!.id })}>
                      Open the AI trader's position
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function TradeDetail({ t }: { t: Trade }) {
  const stats: [string, string][] = [
    ["Target", money(t.targetPrice)],
    ["Stop", money(t.stopPrice)],
    ["Upside", pct(t.upsidePct)],
    ["Downside", pct(t.downsidePct)],
    ["vs 22d MA", signedPct(t.pctVsMa22, 1)],
    ["vs 50d MA", signedPct(t.pctVsMa50, 1)],
    ["Risk", t.riskLevel ?? "—"],
    ["Conviction", `${t.conviction}/5`]
  ];
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <div className="label mb-1.5">Thesis</div>
        <p className="text-[13.5px] leading-relaxed text-text">{t.thesis ?? "—"}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <div className="label mb-1">Catalyst</div>
            <p className="text-[12.5px] text-dim">{t.catalyst ?? "—"}</p>
          </div>
          <div>
            <div className="label mb-1">Thesis breaker</div>
            <p className="text-[12.5px] text-dim">{t.thesisBreaker ?? "—"}</p>
          </div>
          <div>
            <div className="label mb-1">Pair trade</div>
            <p className="num text-[12.5px] text-dim">{t.pairTrade ?? "—"}</p>
          </div>
        </div>
      </div>
      <div>
        <div className="label mb-1.5">Risk bands</div>
        <dl className="num grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
          {stats.map(([k, v]) => (
            <Fragment key={k}>
              <dt className="text-muted">{k}</dt>
              <dd className="text-right">{v}</dd>
            </Fragment>
          ))}
        </dl>
        <div className="num mt-2 text-[10.5px] text-muted">
          {t.priceSource ?? ""}
          {t.lastQuoteDate ? ` · ${t.lastQuoteDate}` : ""}
          {t.quoteError ? ` · ${t.quoteError}` : ""}
        </div>
      </div>
    </div>
  );
}
