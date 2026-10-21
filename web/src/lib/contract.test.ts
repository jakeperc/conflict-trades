import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RefreshPayload, TraderPayload } from "../types";
import { buildMapModel } from "../components/map/mapModel";
import { thesisConfirmation, traderKpis } from "./derive";

const require = createRequire(import.meta.url);
const { checkRefresh, checkTrader } = require("../../../lib/contract.js") as {
  checkRefresh: (p: unknown) => string[];
  checkTrader: (p: unknown) => string[];
};

const repo = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const refresh = JSON.parse(readFileSync(repo("dist/api/refresh.json"), "utf-8")) as RefreshPayload;
const trader = JSON.parse(readFileSync(repo("dist/api/trader.json"), "utf-8")) as TraderPayload;
const clone = <T,>(x: T): T => structuredClone(x);

describe("contract: real snapshots", () => {
  it("refresh.json passes", () => expect(checkRefresh(refresh)).toEqual([]));
  it("trader.json passes", () => expect(checkTrader(trader)).toEqual([]));
});

describe("contract: edge fixtures", () => {
  it("no open positions is valid and KPIs still compute", () => {
    const t = clone(trader);
    t.state.openPositions = [];
    expect(checkTrader(t)).toEqual([]);
    expect(traderKpis(t.state, null).exposure).toBe(0);
  });

  it("null simulation / calibration is valid", () => {
    const t = clone(trader);
    t.simulation = null;
    t.calibration = null;
    expect(checkTrader(t)).toEqual([]);
  });

  it("null price / rewardToRisk is valid", () => {
    const r = clone(refresh);
    const first = Object.values(r.scenarios)[0];
    first.trades[0].price = null;
    first.trades[0].rewardToRisk = null;
    expect(checkRefresh(r)).toEqual([]);
  });

  it("one scenario and eight scenarios are valid", () => {
    const one = clone(refresh);
    const [k] = Object.keys(one.scenarios);
    one.scenarios = { [k]: one.scenarios[k] };
    expect(checkRefresh(one)).toEqual([]);
    const eight = clone(refresh);
    const base = Object.values(refresh.scenarios)[0];
    for (let i = 0; i < 8; i++) eight.scenarios[`s${i}`] = { ...clone(base), key: `s${i}` };
    expect(checkRefresh(eight)).toEqual([]);
  });

  it("a scenario without geo is valid and lands in the Unmapped group", () => {
    const r = clone(refresh);
    const list = Object.values(r.scenarios).map((s, i) => ({
      ...s,
      geo: i === 0 ? null : { pos: [10 * i, 20] as [number, number], label: "x", lanes: [] }
    }));
    expect(checkRefresh({ ...r, scenarios: Object.fromEntries(list.map((s) => [s.key, s])) })).toEqual([]);
    const model = buildMapModel(list);
    expect(model.unmapped.map((s) => s.key)).toEqual([list[0].key]);
    expect(model.hotspots).toHaveLength(list.length - 1);
  });

  it("flags broken shapes", () => {
    const r = clone(refresh);
    const s = Object.values(r.scenarios)[0];
    (s.trades[0] as unknown as { direction: string }).direction = "SIDEWAYS";
    (s as unknown as { heat: unknown }).heat = "hot";
    s.geo = { pos: [1] as unknown as [number, number], label: "x", lanes: [] };
    const errs = checkRefresh(r);
    expect(errs.some((e) => e.includes("direction"))).toBe(true);
    expect(errs.some((e) => e.includes("heat"))).toBe(true);
    expect(errs.some((e) => e.includes("geo"))).toBe(true);
    expect(checkTrader({})).not.toEqual([]);
    expect(checkRefresh({ generatedAt: "x", scenarios: {} })).not.toEqual([]);
  });

  it("thesis confirmation runs on every real scenario", () => {
    for (const s of Object.values(refresh.scenarios)) {
      const v = thesisConfirmation(s);
      expect(v === null || Number.isFinite(v)).toBe(true);
    }
  });
});
