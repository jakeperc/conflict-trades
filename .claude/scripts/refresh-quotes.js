#!/usr/bin/env node
/**
 * Refresh fallback quotes for every ticker in data/config.json.
 * Pulls Stooq first, falls back to Yahoo. Updates data/config.json in place.
 * Output: JSON summary of updates to stdout.
 */
const path = require("path");
const { fetchQuoteHistory, computeVolatility } = require(path.join(__dirname, "..", "..", "lib", "quotes"));
const { getAllTickers, bulkUpdateFallbackQuotes, loadConfig, saveConfig } = require(path.join(__dirname, "..", "..", "lib", "config"));

async function main() {
  const tickers = getAllTickers();
  const updates = {};
  const errors = [];

  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const history = await fetchQuoteHistory(ticker);
        const latest = history[history.length - 1];
        const annualizedVol = computeVolatility(history);
        updates[ticker] = {
          price: latest.close,
          annualizedVol,
          lastDate: latest.date
        };
      } catch (error) {
        errors.push({ ticker, error: error.message });
      }
    })
  );

  const before = loadConfig().fallbackQuotes;
  bulkUpdateFallbackQuotes(updates);
  const cfg = loadConfig();
  cfg.lastRefreshAt = new Date().toISOString();
  saveConfig(cfg);

  const summary = {
    timestamp: new Date().toISOString(),
    updated: Object.keys(updates).length,
    failed: errors.length,
    tickers: Object.fromEntries(
      Object.entries(updates).map(([ticker, data]) => [
        ticker,
        {
          oldPrice: before[ticker]?.price ?? null,
          newPrice: Number(data.price.toFixed(2)),
          pctChange:
            before[ticker]?.price
              ? Number((((data.price - before[ticker].price) / before[ticker].price) * 100).toFixed(2))
              : null,
          oldVol: before[ticker]?.annualizedVol ?? null,
          newVol: Number(data.annualizedVol.toFixed(3)),
          lastDate: data.lastDate
        }
      ])
    ),
    errors
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
