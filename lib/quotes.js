const { URL } = require("url");
const { fetchText, fetchJson } = require("./fetcher");

async function fetchYahooHistory(ticker, range = "6mo") {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`);
  url.searchParams.set("range", range);
  url.searchParams.set("interval", "1d");
  url.searchParams.set("includePrePost", "false");
  url.searchParams.set("events", "div,splits");

  const payload = await fetchJson(url.toString());
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];

  const rows = timestamps
    .map((timestamp, index) => {
      const close = closes[index];
      if (!Number.isFinite(close)) {
        return null;
      }

      return {
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        close
      };
    })
    .filter(Boolean);

  if (!rows.length) {
    throw new Error(`No quote history for ${ticker}`);
  }

  return rows.slice(-80);
}

async function fetchStooqHistory(ticker) {
  const symbol = `${ticker.toLowerCase()}.us`;
  const url = `http://stooq.com/q/d/l/?s=${symbol}&i=d`;
  const csv = await fetchText(url);
  const lines = csv.trim().split(/\r?\n/).slice(1);
  const rows = lines
    .map((line) => line.split(","))
    .filter((cols) => cols.length >= 5 && cols[4] !== "N/D")
    .map((cols) => ({
      date: cols[0],
      close: Number(cols[4])
    }))
    .filter((row) => Number.isFinite(row.close));

  if (!rows.length) {
    throw new Error(`No Stooq quote history for ${ticker}`);
  }

  return rows.slice(-80);
}

async function fetchQuoteHistory(ticker) {
  const providers = [fetchStooqHistory, fetchYahooHistory];
  const errors = [];

  for (const provider of providers) {
    try {
      return await provider(ticker);
    } catch (error) {
      errors.push(`${provider.name}: ${error.message}`);
    }
  }

  throw new Error(errors.join(" | "));
}

function computeVolatility(rows) {
  const returns = [];
  for (let index = 1; index < rows.length; index += 1) {
    const prior = rows[index - 1].close;
    const current = rows[index].close;
    if (prior > 0 && current > 0) {
      returns.push(Math.log(current / prior));
    }
  }

  if (returns.length < 2) {
    return 0.18;
  }

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

function priorChange(rows, lookbackDays) {
  if (!rows || rows.length < 2) return null;
  const latest = rows[rows.length - 1].close;
  const lookback = rows[Math.max(0, rows.length - 1 - lookbackDays)].close;
  if (!Number.isFinite(latest) || !Number.isFinite(lookback) || lookback === 0) return null;
  return (latest - lookback) / lookback;
}

module.exports = {
  fetchYahooHistory,
  fetchStooqHistory,
  fetchQuoteHistory,
  computeVolatility,
  priorChange
};
