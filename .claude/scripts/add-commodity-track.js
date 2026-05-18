#!/usr/bin/env node
/**
 * Add commodity ETFs to all scenarios per .claude/templates/commodity-tracks.json.
 * Fetches live quotes for new tickers and adds them to fallbackQuotes.
 * Skips trades whose ticker is already in a scenario.
 */
const path = require("path");
const fs = require("fs");
const { loadConfig, saveConfig, addTradesToScenario } = require(path.join(__dirname, "..", "..", "lib", "config"));
const { fetchQuoteHistory, computeVolatility } = require(path.join(__dirname, "..", "..", "lib", "quotes"));

async function main() {
  const templatePath = path.join(__dirname, "..", "templates", "commodity-tracks.json");
  const template = JSON.parse(fs.readFileSync(templatePath, "utf-8"));

  const config = loadConfig();
  const additions = {};
  const allNewTickers = new Set();

  for (const [scenarioKey, trades] of Object.entries(template)) {
    if (!config.scenarios[scenarioKey]) {
      additions[scenarioKey] = { error: `Scenario does not exist` };
      continue;
    }
    const added = addTradesToScenario(scenarioKey, trades);
    additions[scenarioKey] = { added, tradeTickers: trades.map((t) => t.ticker) };
    trades.forEach((t) => allNewTickers.add(t.ticker));
  }

  // Fetch quotes for any tickers not yet in fallbackQuotes
  const fresh = loadConfig();
  const needQuote = [...allNewTickers].filter((t) => !fresh.fallbackQuotes[t]);
  const quoteUpdates = {};
  const quoteErrors = [];

  await Promise.all(
    needQuote.map(async (ticker) => {
      try {
        const history = await fetchQuoteHistory(ticker);
        const latest = history[history.length - 1];
        quoteUpdates[ticker] = {
          price: Number(latest.close.toFixed(2)),
          annualizedVol: Number(computeVolatility(history).toFixed(3))
        };
      } catch (error) {
        quoteErrors.push({ ticker, error: error.message });
        quoteUpdates[ticker] = { price: 50, annualizedVol: 0.35 };
      }
    })
  );

  if (Object.keys(quoteUpdates).length) {
    const cfg = loadConfig();
    Object.entries(quoteUpdates).forEach(([t, q]) => {
      cfg.fallbackQuotes[t] = q;
    });
    saveConfig(cfg);
  }

  console.log(
    JSON.stringify(
      {
        action: "add-commodity-track",
        additions,
        newTickersAddedToFallback: Object.keys(quoteUpdates),
        quoteErrors
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
