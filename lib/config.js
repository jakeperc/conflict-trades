const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", "data", "config.json");

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw);
}

function saveConfig(config) {
  const json = JSON.stringify(config, null, 2);
  fs.writeFileSync(CONFIG_PATH, json + "\n", "utf-8");
}

function getScenarios() {
  return loadConfig().scenarios;
}

function getFallbackQuotes() {
  return loadConfig().fallbackQuotes;
}

function updateScenarioField(scenarioKey, field, value) {
  const config = loadConfig();
  if (!config.scenarios[scenarioKey]) {
    throw new Error(`Unknown scenario: ${scenarioKey}`);
  }
  config.scenarios[scenarioKey][field] = value;
  saveConfig(config);
}

function updateFallbackQuote(ticker, price, annualizedVol) {
  const config = loadConfig();
  config.fallbackQuotes[ticker] = {
    price: Number(price.toFixed(2)),
    annualizedVol: Number(annualizedVol.toFixed(3))
  };
  saveConfig(config);
}

function bulkUpdateFallbackQuotes(updates) {
  const config = loadConfig();
  Object.entries(updates).forEach(([ticker, data]) => {
    if (data && Number.isFinite(data.price) && Number.isFinite(data.annualizedVol)) {
      config.fallbackQuotes[ticker] = {
        price: Number(data.price.toFixed(2)),
        annualizedVol: Number(data.annualizedVol.toFixed(3))
      };
    }
  });
  saveConfig(config);
}

function addScenario(key, scenario) {
  const config = loadConfig();
  config.scenarios[key] = { ...scenario, key };
  saveConfig(config);
}

function addTradesToScenario(scenarioKey, trades) {
  const config = loadConfig();
  if (!config.scenarios[scenarioKey]) {
    throw new Error(`Unknown scenario: ${scenarioKey}`);
  }
  const existingTickers = new Set(config.scenarios[scenarioKey].trades.map((t) => t.ticker));
  const filteredNew = trades.filter((t) => !existingTickers.has(t.ticker));
  config.scenarios[scenarioKey].trades.push(...filteredNew);
  saveConfig(config);
  return filteredNew.length;
}

function getAllTickers() {
  const config = loadConfig();
  const tickers = new Set();
  Object.values(config.scenarios).forEach((scenario) => {
    scenario.trades.forEach((trade) => tickers.add(trade.ticker));
  });
  Object.keys(config.fallbackQuotes).forEach((ticker) => tickers.add(ticker));
  return [...tickers].sort();
}

module.exports = {
  CONFIG_PATH,
  loadConfig,
  saveConfig,
  getScenarios,
  getFallbackQuotes,
  updateScenarioField,
  updateFallbackQuote,
  bulkUpdateFallbackQuotes,
  addScenario,
  addTradesToScenario,
  getAllTickers
};
