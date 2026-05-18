#!/usr/bin/env node
/**
 * Add a new scenario to data/config.json by copying a template.
 * Usage: node add-scenario.js <scenarioKey>
 * Looks up .claude/templates/scenarios/<scenarioKey>.json and appends.
 * Also adds default fallbackQuote entries (price=null) for any new tickers,
 * to be filled in by the next /refresh-quotes run.
 */
const path = require("path");
const fs = require("fs");
const { loadConfig, saveConfig, addScenario, getAllTickers } = require(path.join(__dirname, "..", "..", "lib", "config"));
const { fetchQuoteHistory, computeVolatility } = require(path.join(__dirname, "..", "..", "lib", "quotes"));

async function main() {
  const key = process.argv[2];
  if (!key) {
    console.error("Usage: node add-scenario.js <scenarioKey>");
    process.exit(1);
  }

  const templatePath = path.join(__dirname, "..", "templates", "scenarios", `${key}.json`);
  if (!fs.existsSync(templatePath)) {
    console.error(JSON.stringify({ error: `No template at ${templatePath}` }));
    process.exit(1);
  }

  const config = loadConfig();
  if (config.scenarios[key]) {
    console.error(JSON.stringify({ error: `Scenario already exists: ${key}` }));
    process.exit(1);
  }

  const template = JSON.parse(fs.readFileSync(templatePath, "utf-8"));
  addScenario(key, template);

  // Determine new tickers introduced by this scenario
  const before = new Set(Object.keys(config.fallbackQuotes));
  const incomingTickers = [...new Set(template.trades.map((t) => t.ticker))];
  const newTickers = incomingTickers.filter((t) => !before.has(t));

  // Fetch quotes for new tickers and add to fallbackQuotes
  const quoteUpdates = {};
  const quoteErrors = [];
  await Promise.all(
    newTickers.map(async (ticker) => {
      try {
        const history = await fetchQuoteHistory(ticker);
        const latest = history[history.length - 1];
        quoteUpdates[ticker] = {
          price: Number(latest.close.toFixed(2)),
          annualizedVol: Number(computeVolatility(history).toFixed(3))
        };
      } catch (error) {
        quoteErrors.push({ ticker, error: error.message });
        // Seed with conservative placeholder so dashboard renders
        quoteUpdates[ticker] = { price: 100, annualizedVol: 0.3 };
      }
    })
  );

  if (Object.keys(quoteUpdates).length) {
    const fresh = loadConfig();
    Object.entries(quoteUpdates).forEach(([t, q]) => {
      fresh.fallbackQuotes[t] = q;
    });
    saveConfig(fresh);
  }

  console.log(
    JSON.stringify(
      {
        action: "add-scenario",
        scenarioKey: key,
        title: template.title,
        tradeCount: template.trades.length,
        newTickers,
        quotesFetched: Object.keys(quoteUpdates).filter((t) => !quoteErrors.find((e) => e.ticker === t)),
        quoteErrors,
        allScenarios: Object.keys(loadConfig().scenarios)
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
