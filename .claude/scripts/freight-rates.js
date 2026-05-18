#!/usr/bin/env node
/**
 * Read-only freight indicator: pulls tanker/dry-bulk equity proxies and computes
 * 5d/22d momentum as a stand-in for Baltic Exchange rates (which are paywalled).
 * Writes to data/flows/freight-rates-<date>.json.
 *
 * Tankers: FRO, TNK, DHT, INSW, EURN, STNG
 * Dry bulk / container: BDRY (ETF), ZIM
 * Air freight: FDX (proxy for global trade)
 */
const path = require("path");
const fs = require("fs");
const { fetchYahooHistory, fetchStooqHistory, priorChange } = require(path.join(__dirname, "..", "..", "lib", "quotes"));

const PROXIES = [
  { ticker: "FRO", category: "VLCC/Suezmax tankers" },
  { ticker: "TNK", category: "Product tankers" },
  { ticker: "DHT", category: "Crude tankers" },
  { ticker: "INSW", category: "Mixed tankers" },
  { ticker: "EURN", category: "Crude tankers (Belgian)" },
  { ticker: "STNG", category: "Product tankers" },
  { ticker: "BDRY", category: "Dry bulk shipping ETF" },
  { ticker: "ZIM", category: "Container shipping" },
  { ticker: "FDX", category: "Air freight (FedEx proxy)" }
];

async function tryHistory(ticker) {
  try {
    return await fetchStooqHistory(ticker);
  } catch {
    return await fetchYahooHistory(ticker, "3mo");
  }
}

async function main() {
  const readings = {};
  for (const proxy of PROXIES) {
    try {
      const history = await tryHistory(proxy.ticker);
      const latest = history[history.length - 1];
      readings[proxy.ticker] = {
        category: proxy.category,
        price: Number(latest.close.toFixed(2)),
        date: latest.date,
        change5d: priorChange(history, 5),
        change22d: priorChange(history, 22)
      };
    } catch (error) {
      readings[proxy.ticker] = { category: proxy.category, error: error.message };
    }
  }

  const tankers = ["FRO", "TNK", "DHT", "INSW", "EURN", "STNG"]
    .map((t) => readings[t]?.change5d)
    .filter((v) => v != null);
  const tankerAvg5d = tankers.length
    ? tankers.reduce((a, b) => a + b, 0) / tankers.length
    : null;

  const flowsDir = path.join(__dirname, "..", "..", "data", "flows");
  fs.mkdirSync(flowsDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const flowPath = path.join(flowsDir, `freight-rates-${stamp}.json`);

  let interpretation = "Insufficient data";
  if (tankerAvg5d != null) {
    const pct = (tankerAvg5d * 100).toFixed(1);
    if (tankerAvg5d >= 0.05) interpretation = `Tanker proxies +${pct}% over 5d — freight tight, shipping longs supported`;
    else if (tankerAvg5d >= 0.02) interpretation = `Tanker proxies +${pct}% over 5d — mild tightening`;
    else if (tankerAvg5d <= -0.05) interpretation = `Tanker proxies ${pct}% over 5d — freight loosening, trim shipping exposure`;
    else interpretation = `Tanker proxies ${pct}% over 5d — neutral`;
  }

  const flow = {
    topic: "freight-rates",
    fetchedAt: new Date().toISOString(),
    readings,
    tankerAvg5d,
    interpretation
  };
  fs.writeFileSync(flowPath, JSON.stringify(flow, null, 2));

  console.log(JSON.stringify({ ...flow, flowPath: path.relative(path.join(__dirname, "..", ".."), flowPath) }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
