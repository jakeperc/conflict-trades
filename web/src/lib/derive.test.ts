import { describe, expect, it } from "vitest";
import type { ClosedTrade, EquityPoint, Position, RefreshPayload, Scenario, Trade, TraderState } from "../types";
import {
  alignedMomentum,
  alsoIn,
  driverBars,
  findPosition,
  heldIndex,
  heldKey,
  ladderProgress,
  maxDrawdown,
  profitFactor,
  scenarioDeltas,
  thesisConfirmation,
  topSetups,
  traderSince,
  traderSnapshot
} from "./derive";
import { heatBand } from "./heat";
import { parseHash, toHash } from "./router";

const trade = (o: Partial<Trade>): Trade => ({
  ticker: "XOM",
  direction: "LONG",
  conviction: 3,
  sector: "Energy",
  price: 100,
  upsidePct: 0.2,
  downsidePct: 0.1,
  targetPrice: 120,
  stopPrice: 90,
  rewardToRisk: 2,
  momentum22d: 0.1,
  ...o
});

const scenario = (key: string, trades: Trade[], heat = 80): Scenario => ({
  key,
  title: `${key} / x`,
  subtitle: "",
  color: "#fff",
  geo: null,
  summary: "",
  heat,
  ww3Tilt: 0,
  ww3Signal: null,
  subScores: [
    { label: "A", value: heat + 8 },
    { label: "B", value: heat - 6 }
  ],
  indicators: [],
  secondOrderEffects: [],
  topPairTrade: null,
  refreshedAt: "",
  headlines: [],
  trades
});

const pos = (o: Partial<Position>): Position => ({
  id: "p1",
  ticker: "USO",
  scenario: "iran",
  sector: "Oil ETF",
  direction: "LONG",
  conviction: 4,
  entryDate: "2026-10-01",
  entryPrice: 100,
  shares: 10,
  allocatedCash: 1000,
  targetPrice: 130,
  stopPrice: 85,
  horizonDays: 28,
  currentPrice: 110,
  ...o
});

describe("heat bands", () => {
  it("uses the legacy thresholds", () => {
    expect(heatBand(96).key).toBe("critical");
    expect(heatBand(95).key).toBe("critical");
    expect(heatBand(94).key).toBe("high");
    expect(heatBand(75).key).toBe("high");
    expect(heatBand(74).key).toBe("moderate");
    expect(heatBand(50).key).toBe("moderate");
    expect(heatBand(10).key).toBe("low");
    expect(heatBand(null).key).toBe("low");
  });
});

describe("momentum metrics", () => {
  it("aligned momentum flips sign for shorts", () => {
    expect(alignedMomentum({ direction: "LONG", momentum22d: 0.05 })).toBeCloseTo(0.05);
    expect(alignedMomentum({ direction: "SHORT", momentum22d: 0.05 })).toBeCloseTo(-0.05);
    expect(alignedMomentum({ direction: "SHORT", momentum22d: null })).toBeNull();
  });

  it("thesis confirmation = mean LONG 22d minus mean SHORT 22d", () => {
    const s = scenario("iran", [
      trade({ momentum22d: 0.1 }),
      trade({ momentum22d: 0.3 }),
      trade({ direction: "SHORT", momentum22d: -0.1 }),
      trade({ direction: "LONG", momentum22d: null })
    ]);
    expect(thesisConfirmation(s)).toBeCloseTo(0.2 - -0.1);
    expect(thesisConfirmation(scenario("x", [trade({ momentum22d: null })]))).toBeNull();
    expect(thesisConfirmation(scenario("y", [trade({ direction: "SHORT", momentum22d: 0.04 })]))).toBeCloseTo(-0.04);
  });

  it("top setups prefer confirmed trades, then fall back to R:R", () => {
    const s = scenario("a", [
      trade({ ticker: "A", rewardToRisk: 3, momentum22d: -0.2 }),
      trade({ ticker: "B", rewardToRisk: 2, momentum22d: 0.1 }),
      trade({ ticker: "C", rewardToRisk: 2.5, momentum22d: 0.1 }),
      trade({ ticker: "D", rewardToRisk: 1.5, momentum22d: 0.2 }),
      trade({ ticker: "E", rewardToRisk: null })
    ]);
    expect(topSetups(s, 3).map((t) => t.ticker)).toEqual(["C", "B", "D"]);
    expect(topSetups(s, 4).map((t) => t.ticker)).toEqual(["A", "C", "B", "D"]);
  });

  it("driver bars expose the headline bump", () => {
    const bars = driverBars(scenario("a", [], 80));
    expect(bars[0]).toMatchObject({ label: "A", value: 88, base: 80, bump: 8 });
    expect(bars[1]).toMatchObject({ label: "B", value: 74, base: 74, bump: -6 });
  });
});

describe("cross-references", () => {
  const payload = {
    generatedAt: "g",
    disclaimer: "",
    methodology: "",
    scenarios: {
      a: scenario("a", [trade({ ticker: "LMT" }), trade({ ticker: "XOM" })]),
      b: scenario("b", [trade({ ticker: "LMT" })])
    }
  } as RefreshPayload;

  it("also-in lists tickers in 2+ scenarios only", () => {
    const m = alsoIn(payload);
    expect(m.get("LMT")?.sort()).toEqual(["a", "b"]);
    expect(m.has("XOM")).toBe(false);
  });

  it("held index keys on ticker + direction", () => {
    const state = { openPositions: [pos({ ticker: "LMT", direction: "LONG" })] } as TraderState;
    const h = heldIndex(state);
    expect(h.get(heldKey("LMT", "LONG"))?.id).toBe("p1");
    expect(h.get(heldKey("LMT", "SHORT"))).toBeUndefined();
  });

  it("scenario deltas count new headlines against the baseline", () => {
    const cur = structuredClone(payload);
    cur.scenarios.a.heat = 90;
    cur.scenarios.a.headlines = [
      { title: "old", link: "1" },
      { title: "new", link: "2" }
    ];
    const base = structuredClone(payload);
    base.scenarios.a.headlines = [{ title: "old", link: "1" }];
    const d = scenarioDeltas(cur, base).find((x) => x.key === "a")!;
    expect(d.heatDelta).toBe(10);
    expect(d.newHeadlines).toBe(1);
    expect(scenarioDeltas(cur, null)[0].heatDelta).toBeNull();
  });
});

describe("trader", () => {
  const curve = (vals: number[]): EquityPoint[] =>
    vals.map((v, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, cycle: i, cash: 0, openMtM: v, totalEquity: v, pctVsStart: v / 100 - 1 }));

  it("max drawdown finds peak and trough", () => {
    const dd = maxDrawdown(curve([100, 110, 99, 105, 88, 120]));
    expect(dd.maxDd).toBeCloseTo(88 / 110 - 1);
    expect(dd.peakIdx).toBe(1);
    expect(dd.troughIdx).toBe(4);
    expect(maxDrawdown(curve([100, 101, 102])).maxDd).toBe(0);
  });

  it("profit factor", () => {
    const c = (v: number) => ({ realizedPnlDollar: v }) as ClosedTrade;
    expect(profitFactor([c(100), c(50), c(-50)])).toBeCloseTo(3);
    expect(profitFactor([c(10)])).toBe(Infinity);
    expect(profitFactor([])).toBeNull();
  });

  it("drawer lookup: open, then closed, then not found", () => {
    const state = {
      openPositions: [pos({ id: "open-1" })],
      closedTrades: [{ ...pos({ id: "closed-1" }), exitDate: "x", exitPrice: 1, exitReason: "stop_hit", realizedPnlDollar: -1, realizedPct: -0.01, holdingDays: 3, outcome: "loss" }]
    } as TraderState;
    expect(findPosition(state, "open-1")?.kind).toBe("open");
    expect(findPosition(state, "closed-1")?.kind).toBe("closed");
    expect(findPosition(state, "missing")).toBeNull();
    expect(findPosition(null, "open-1")).toBeNull();
  });

  it("ladder is direction-aware", () => {
    const l = ladderProgress(pos({ entryPrice: 100, stopPrice: 90, targetPrice: 130, currentPrice: 110 }));
    expect(l.entry).toBeCloseTo(0.25);
    expect(l.mark).toBeCloseTo(0.5);
    const s = ladderProgress(pos({ direction: "SHORT", entryPrice: 100, stopPrice: 110, targetPrice: 80, currentPrice: 90 }));
    expect(s.entry).toBeCloseTo(20 / 30);
    expect(s.mark).toBeCloseTo(10 / 30);
  });

  it("trader since-last counts entries and exits", () => {
    const before = { cycles: 10, openPositions: [pos({ id: "a" })], closedTrades: [] } as unknown as TraderState;
    const snap = traderSnapshot(before, 10000);
    const after = {
      cycles: 12,
      openPositions: [pos({ id: "b" })],
      closedTrades: [{ ...pos({ id: "a" }), exitDate: "", exitPrice: 1, exitReason: "", realizedPnlDollar: 1, realizedPct: 0.1, holdingDays: 1, outcome: "win" }]
    } as unknown as TraderState;
    const s = traderSince(after, snap)!;
    expect(s.cycles).toBe(2);
    expect(s.entered.map((p) => p.id)).toEqual(["b"]);
    expect(s.exited.map((p) => p.id)).toEqual(["a"]);
    expect(traderSince(after, null)).toBeNull();
  });
});

describe("router", () => {
  it("parses and round-trips", () => {
    expect(parseHash("")).toEqual({ page: "dashboard" });
    expect(parseHash("#/")).toEqual({ page: "dashboard" });
    expect(parseHash("#/?s=taiwan")).toEqual({ page: "dashboard", scenario: "taiwan" });
    expect(parseHash("#/trader")).toEqual({ page: "trader" });
    expect(parseHash("#/trader/p/pos-2026-10-07-TNK-iran")).toEqual({ page: "trader", positionId: "pos-2026-10-07-TNK-iran" });
    expect(toHash({ page: "trader", positionId: "a b" })).toBe("#/trader/p/a%20b");
    expect(parseHash(toHash({ page: "trader", positionId: "a b" }))).toEqual({ page: "trader", positionId: "a b" });
  });

  it("keeps legacy hashes working", () => {
    expect(parseHash("#pageTrader")).toEqual({ page: "trader" });
    expect(parseHash("#pageDashboard")).toEqual({ page: "dashboard" });
  });
});
