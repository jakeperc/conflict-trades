import type { ClosedTrade, EquityPoint, Position, RefreshPayload, Scenario, Trade, TraderState } from "../types";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Direction sign x 22d momentum: positive = the market is moving the way the trade wants. */
export function alignedMomentum(t: Pick<Trade, "direction" | "momentum22d">): number | null {
  if (!finite(t.momentum22d)) return null;
  return (t.direction === "SHORT" ? -1 : 1) * t.momentum22d;
}

/**
 * Thesis confirmation = mean 22d momentum of the LONG legs minus the SHORT legs.
 * Heat says how hot a theater is; this says whether the market is paying for it.
 */
export function thesisConfirmation(s: Pick<Scenario, "trades">): number | null {
  const longs = s.trades.filter((t) => t.direction === "LONG" && finite(t.momentum22d)).map((t) => t.momentum22d as number);
  const shorts = s.trades.filter((t) => t.direction === "SHORT" && finite(t.momentum22d)).map((t) => t.momentum22d as number);
  const l = mean(longs);
  const sh = mean(shorts);
  if (l == null && sh == null) return null;
  return (l ?? 0) - (sh ?? 0);
}

/** Ticker -> scenario keys it appears in (only tickers in 2+ scenarios). */
export function alsoIn(payload: RefreshPayload | null): Map<string, string[]> {
  const m = new Map<string, Set<string>>();
  if (!payload) return new Map();
  for (const s of Object.values(payload.scenarios)) {
    for (const t of s.trades) {
      if (!m.has(t.ticker)) m.set(t.ticker, new Set());
      m.get(t.ticker)!.add(s.key);
    }
  }
  const out = new Map<string, string[]>();
  for (const [k, v] of m) if (v.size > 1) out.set(k, [...v]);
  return out;
}

export const heldKey = (ticker: string, direction: string) => `${ticker}:${direction}`;

/** ticker:direction -> open position. */
export function heldIndex(state: TraderState | null | undefined): Map<string, Position> {
  const m = new Map<string, Position>();
  for (const p of state?.openPositions ?? []) m.set(heldKey(p.ticker, p.direction), p);
  return m;
}

export function theaterPositions(state: TraderState | null | undefined, key: string): Position[] {
  return (state?.openPositions ?? []).filter((p) => p.scenario === key);
}

/** Best setups: highest R:R among trades the market is already confirming; falls back to R:R alone. */
export function topSetups(s: Pick<Scenario, "trades">, n = 3): Trade[] {
  const priced = s.trades.filter((t) => finite(t.rewardToRisk));
  const confirmed = priced.filter((t) => (alignedMomentum(t) ?? 0) > 0);
  const pool = confirmed.length >= n ? confirmed : priced;
  return [...pool].sort((a, b) => (b.rewardToRisk as number) - (a.rewardToRisk as number)).slice(0, n);
}

export interface DriverBar {
  label: string;
  value: number;
  base: number;
  bump: number;
}

/** Sub-scores are heat plus small keyword bumps; show the bump explicitly instead of a flat radar. */
export function driverBars(s: Pick<Scenario, "subScores" | "heat">): DriverBar[] {
  return [...s.subScores]
    .map((x) => ({ label: x.label, value: x.value, base: Math.min(s.heat, x.value), bump: x.value - s.heat }))
    .sort((a, b) => b.value - a.value);
}

export interface Drawdown {
  maxDd: number;
  peakIdx: number;
  troughIdx: number;
}

export function maxDrawdown(curve: EquityPoint[]): Drawdown {
  let peak = -Infinity;
  let peakIdx = 0;
  let best: Drawdown = { maxDd: 0, peakIdx: 0, troughIdx: 0 };
  curve.forEach((p, i) => {
    if (p.totalEquity > peak) {
      peak = p.totalEquity;
      peakIdx = i;
    }
    const dd = peak > 0 ? (p.totalEquity - peak) / peak : 0;
    if (dd < best.maxDd) best = { maxDd: dd, peakIdx, troughIdx: i };
  });
  return best;
}

export function profitFactor(closed: ClosedTrade[]): number | null {
  let win = 0;
  let loss = 0;
  for (const t of closed) {
    if (!finite(t.realizedPnlDollar)) continue;
    if (t.realizedPnlDollar >= 0) win += t.realizedPnlDollar;
    else loss += -t.realizedPnlDollar;
  }
  if (loss === 0) return win > 0 ? Infinity : null;
  return win / loss;
}

export interface TraderKpis {
  equity: number;
  pctVsStart: number;
  dayChange: number | null;
  dayChangePct: number | null;
  exposure: number;
  winRate: number | null;
  wins: number;
  closedCount: number;
  profitFactor: number | null;
  drawdown: Drawdown;
}

export function traderKpis(state: TraderState, live?: { equity: number; pctReturn: number } | null): TraderKpis {
  const curve = state.equityCurve ?? [];
  const last = curve[curve.length - 1];
  const prev = curve[curve.length - 2];
  const equity = live?.equity ?? last?.totalEquity ?? state.cash;
  const pctVsStart = live?.pctReturn ?? last?.pctVsStart ?? (state.startingCash ? equity / state.startingCash - 1 : 0);
  const ref = live ? last : prev;
  const dayChange = ref ? equity - ref.totalEquity : null;
  const wins = state.closedTrades.filter((t) => t.outcome === "win").length;
  const openValue = state.openPositions.reduce((a, p) => a + (p.currentPrice ?? p.entryPrice) * p.shares, 0);
  return {
    equity,
    pctVsStart,
    dayChange,
    dayChangePct: ref && dayChange != null ? dayChange / ref.totalEquity : null,
    exposure: equity > 0 ? openValue / equity : 0,
    winRate: state.closedTrades.length ? wins / state.closedTrades.length : null,
    wins,
    closedCount: state.closedTrades.length,
    profitFactor: profitFactor(state.closedTrades),
    drawdown: maxDrawdown(curve)
  };
}

export type Found = { kind: "open"; item: Position } | { kind: "closed"; item: ClosedTrade };

/** Drawer lookup: open first, then closed (ids move to closed on exit), else null. */
export function findPosition(state: TraderState | null | undefined, id: string | undefined): Found | null {
  if (!state || !id) return null;
  const open = state.openPositions.find((p) => p.id === id);
  if (open) return { kind: "open", item: open };
  const closed = [...state.closedTrades].reverse().find((p) => p.id === id);
  if (closed) return { kind: "closed", item: closed };
  return null;
}

export function daysBetween(fromIso: string, to = Date.now()): number {
  const t = Date.parse(fromIso.length === 10 ? `${fromIso}T00:00:00` : fromIso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((to - t) / 86_400_000));
}

/** Where the mark sits on the stop..target ladder, 0..1 (direction-aware). */
export function ladderProgress(p: Pick<Position, "direction" | "stopPrice" | "targetPrice" | "entryPrice" | "currentPrice">) {
  const lo = p.direction === "LONG" ? p.stopPrice : p.targetPrice;
  const hi = p.direction === "LONG" ? p.targetPrice : p.stopPrice;
  const span = hi - lo || 1;
  const at = (v: number | undefined) => (finite(v) ? Math.min(1, Math.max(0, (v - lo) / span)) : null);
  return { entry: at(p.entryPrice), mark: at(p.currentPrice), lo, hi };
}

export interface ScenarioDelta {
  key: string;
  heat: number;
  heatDelta: number | null;
  newHeadlines: number;
}

export function scenarioDeltas(current: RefreshPayload, baseline: RefreshPayload | null): ScenarioDelta[] {
  return Object.values(current.scenarios).map((s) => {
    const prev = baseline?.scenarios?.[s.key];
    if (!prev) return { key: s.key, heat: s.heat, heatDelta: null, newHeadlines: 0 };
    const seen = new Set((prev.headlines ?? []).map((h) => h.title));
    return {
      key: s.key,
      heat: s.heat,
      heatDelta: s.heat - prev.heat,
      newHeadlines: (s.headlines ?? []).filter((h) => !seen.has(h.title)).length
    };
  });
}

/** Headline titles that are new since the baseline for one scenario (empty set when no baseline). */
export function newHeadlineTitles(current: Scenario, baseline: RefreshPayload | null): Set<string> {
  const prev = baseline?.scenarios?.[current.key];
  if (!prev) return new Set();
  const seen = new Set((prev.headlines ?? []).map((h) => h.title));
  return new Set(current.headlines.filter((h) => !seen.has(h.title)).map((h) => h.title));
}

export interface TraderSnapshot {
  lastRunAt: string | null;
  cycles: number;
  openIds: string[];
  closedIds: string[];
  equity: number;
}

export function traderSnapshot(state: TraderState, equity: number): TraderSnapshot {
  return {
    lastRunAt: state.lastRunAt ?? null,
    cycles: state.cycles,
    openIds: state.openPositions.map((p) => p.id),
    closedIds: state.closedTrades.map((p) => p.id),
    equity
  };
}

export function traderSince(state: TraderState, base: TraderSnapshot | null) {
  if (!base) return null;
  const seenOpen = new Set(base.openIds);
  const seenClosed = new Set(base.closedIds);
  return {
    cycles: state.cycles - base.cycles,
    entered: state.openPositions.filter((p) => !seenOpen.has(p.id) && !seenClosed.has(p.id)),
    exited: state.closedTrades.filter((p) => !seenClosed.has(p.id))
  };
}
