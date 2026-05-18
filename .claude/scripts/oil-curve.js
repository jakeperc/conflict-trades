#!/usr/bin/env node
/**
 * Read-only oil indicator: pulls Brent (BZ=F) + WTI (CL=F) spot from Yahoo,
 * computes 7d/22d momentum + Brent-WTI spread. Writes to data/flows/oil-curve-<date>.json.
 * Does NOT change config.json — this is a reading the trader reads.
 */
const path = require("path");
const fs = require("fs");
const { fetchYahooHistory, priorChange } = require(path.join(__dirname, "..", "..", "lib", "quotes"));

const TICKERS = [
  { symbol: "BZ=F", label: "Brent" },
  { symbol: "CL=F", label: "WTI" },
  { symbol: "NG=F", label: "Henry Hub" },
  { symbol: "USO", label: "USO ETF" },
  { symbol: "BNO", label: "BNO ETF (Brent)" },
  { symbol: "UNG", label: "UNG ETF" }
];

async function main() {
  const readings = {};
  for (const ticker of TICKERS) {
    try {
      const history = await fetchYahooHistory(ticker.symbol, "3mo");
      const latest = history[history.length - 1];
      readings[ticker.symbol] = {
        label: ticker.label,
        price: Number(latest.close.toFixed(2)),
        date: latest.date,
        change7d: priorChange(history, 5),
        change22d: priorChange(history, 22)
      };
    } catch (error) {
      readings[ticker.symbol] = { label: ticker.label, error: error.message };
    }
  }

  const brent = readings["BZ=F"];
  const wti = readings["CL=F"];
  let brentWtiSpread = null;
  if (brent?.price && wti?.price) {
    brentWtiSpread = Number((brent.price - wti.price).toFixed(2));
  }

  const flowsDir = path.join(__dirname, "..", "..", "data", "flows");
  fs.mkdirSync(flowsDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const flowPath = path.join(flowsDir, `oil-curve-${stamp}.json`);

  const flow = {
    topic: "oil-curve",
    fetchedAt: new Date().toISOString(),
    readings,
    brentWtiSpread,
    interpretation: interpretBrentWti(brent?.price, brentWtiSpread, brent?.change7d, brent?.change22d)
  };
  fs.writeFileSync(flowPath, JSON.stringify(flow, null, 2));

  console.log(JSON.stringify({ ...flow, flowPath: path.relative(path.join(__dirname, "..", ".."), flowPath) }, null, 2));
}

function interpretBrentWti(brent, spread, mom7, mom22) {
  if (!brent || spread == null) return "Insufficient data";
  const lines = [];
  if (brent >= 95) lines.push("Brent ≥ $95 — supply-tight regime, energy longs favored");
  else if (brent >= 85) lines.push("Brent $85–95 — balanced, scenario-dependent");
  else lines.push("Brent < $85 — supply-loose, energy longs need a catalyst");

  if (spread >= 6) lines.push("Brent-WTI spread ≥ $6 — international risk premium elevated (Hormuz/Red Sea bias)");
  else if (spread <= 2) lines.push("Brent-WTI spread ≤ $2 — international risk premium muted");

  if (mom7 != null) {
    const pct = (mom7 * 100).toFixed(1);
    if (mom7 >= 0.05) lines.push(`7d momentum +${pct}% — energy trades have running room`);
    else if (mom7 <= -0.05) lines.push(`7d momentum ${pct}% — fade rallies into energy longs`);
  }
  return lines.join(" | ");
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
