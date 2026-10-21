// Zero-dependency shape checks for the frozen API payloads. build.js refuses to publish a
// dist/ whose JSON would break the UI, so the daily automation never commits a broken site.

const isStr = (v) => typeof v === "string";
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isArr = Array.isArray;
const isObj = (v) => !!v && typeof v === "object" && !isArr(v);
const isLngLat = (v) => isArr(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);

function checker() {
  const errors = [];
  const need = (ok, where, what) => {
    if (!ok && errors.length < 25) errors.push(`${where}: ${what}`);
    return ok;
  };
  return { errors, need };
}

function checkRefresh(p) {
  const { errors, need } = checker();
  if (!need(isObj(p), "refresh", "not an object")) return errors;
  need(isStr(p.generatedAt), "refresh.generatedAt", "missing");
  if (!need(isObj(p.scenarios) && Object.keys(p.scenarios).length > 0, "refresh.scenarios", "empty or missing")) return errors;
  for (const [key, s] of Object.entries(p.scenarios)) {
    const at = `scenarios.${key}`;
    if (!need(isObj(s), at, "not an object")) continue;
    need(s.key === key, `${at}.key`, "does not match its map key");
    need(isStr(s.title), `${at}.title`, "missing");
    need(isStr(s.color), `${at}.color`, "missing");
    need(isNum(s.heat), `${at}.heat`, "not a number");
    need(isArr(s.subScores) && s.subScores.every((x) => isStr(x.label) && isNum(x.value)), `${at}.subScores`, "bad shape");
    need(isArr(s.indicators), `${at}.indicators`, "not an array");
    need(isArr(s.headlines), `${at}.headlines`, "not an array");
    need(isArr(s.secondOrderEffects), `${at}.secondOrderEffects`, "not an array");
    if (s.geo != null) {
      need(isObj(s.geo) && isLngLat(s.geo.pos) && isStr(s.geo.label), `${at}.geo`, "needs pos [lng, lat] and label");
      need(
        isArr(s.geo.lanes) && s.geo.lanes.every((l) => isStr(l.id) && isLngLat(l.from) && isLngLat(l.to) && isArr(l.sectors)),
        `${at}.geo.lanes`,
        "each lane needs id, from, to, sectors"
      );
    }
    if (need(isArr(s.trades) && s.trades.length > 0, `${at}.trades`, "empty or missing")) {
      s.trades.forEach((t, i) => {
        const tat = `${at}.trades[${i}]`;
        need(isStr(t.ticker), `${tat}.ticker`, "missing");
        need(t.direction === "LONG" || t.direction === "SHORT", `${tat}.direction`, "must be LONG or SHORT");
        need(isNum(t.conviction), `${tat}.conviction`, "not a number");
        need(isStr(t.sector), `${tat}.sector`, "missing");
        need(t.price === null || isNum(t.price), `${tat}.price`, "must be a number or null");
      });
    }
  }
  return errors;
}

function checkTrader(p) {
  const { errors, need } = checker();
  if (!need(isObj(p) && isObj(p.state), "trader.state", "missing")) return errors;
  const s = p.state;
  need(isNum(s.cash), "state.cash", "not a number");
  need(isNum(s.startingCash), "state.startingCash", "not a number");
  need(isNum(s.cycles), "state.cycles", "not a number");
  if (need(isArr(s.openPositions), "state.openPositions", "not an array")) {
    s.openPositions.forEach((x, i) => {
      const at = `openPositions[${i}]`;
      need(isStr(x.id) && isStr(x.ticker) && isStr(x.scenario), at, "needs id, ticker, scenario");
      need(x.direction === "LONG" || x.direction === "SHORT", `${at}.direction`, "must be LONG or SHORT");
      need([x.entryPrice, x.shares, x.targetPrice, x.stopPrice].every(isNum), at, "entryPrice/shares/targetPrice/stopPrice must be numbers");
    });
  }
  if (need(isArr(s.closedTrades), "state.closedTrades", "not an array")) {
    s.closedTrades.forEach((x, i) => need(isStr(x.id) && isStr(x.exitDate) && isStr(x.outcome), `closedTrades[${i}]`, "needs id, exitDate, outcome"));
  }
  if (need(isArr(s.equityCurve), "state.equityCurve", "not an array")) {
    s.equityCurve.forEach((x, i) => need(isStr(x.date) && isNum(x.totalEquity), `equityCurve[${i}]`, "needs date and totalEquity"));
  }
  return errors;
}

module.exports = { checkRefresh, checkTrader };
