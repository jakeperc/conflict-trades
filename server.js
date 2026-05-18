const http = require("http");
const fs = require("fs");
const path = require("path");
const https = require("https");
const { URL } = require("url");

const PORT = process.env.PORT || 8787;
const PUBLIC_DIR = path.join(__dirname, "public");

const scenarioConfig = {
  iran: {
    key: "iran",
    title: "Iran / Hormuz / Yemen",
    subtitle: "Hormuz freeze, tanker repricing, defense replenishment",
    color: "#ff8a3d",
    query:
      "Iran Strait of Hormuz blockade Project Freedom mines tanker shipping oil CENTCOM Yemen Houthi",
    newsFallbackQueries: [
      "Strait of Hormuz shipping Iran oil blockade",
      "Iran oil prices Hormuz shipping",
      "Yemen Houthi Red Sea shipping oil"
    ],
    heatBase: 82,
    summary:
      "Updated for the May 2026 Hormuz blockage: crude sensitivity, trapped-vessel release attempts, tanker insurance stress, and defense restocking if Gulf transit risk stays elevated.",
    secondOrderEffects: [
      "Marine insurance and mine-risk terms can hit delivered crude costs faster than headline oil moves.",
      "A slow, military-managed reopening keeps tanker availability tight even if a small number of vessels transit.",
      "Airline and consumer discretionary names can lag after oil peaks if fuel hedges reset higher."
    ],
    indicatorBlueprints: [
      { label: "Brent crude", unit: "pts", mode: "risk-on-disruption", base: 110, sensitivity: 0.28 },
      { label: "Tanker rates", unit: "%", mode: "risk-on-disruption", base: 155, sensitivity: 1.2 },
      { label: "Marine insurance", unit: "bps", mode: "risk-on-disruption", base: 245, sensitivity: 1.55 },
      { label: "Airline margin stress", unit: "%", mode: "risk-on-disruption", base: 27, sensitivity: 0.55 }
    ],
    trades: [
      { ticker: "XOM", direction: "LONG", conviction: 5, sector: "Energy", horizon: "2-6 weeks", pairTrade: "Long XOM / Short UAL", thesisBreaker: "Fast de-escalation plus OPEC offset supply lift.", catalyst: "Brent reprices on tanker and insurance stress.", riskLevel: "Medium", thesis: "Integrated major with direct upside to higher crude and LNG pricing." },
      { ticker: "CVX", direction: "LONG", conviction: 4, sector: "Energy", horizon: "2-6 weeks", pairTrade: "Long CVX / Short CCL", thesisBreaker: "Oil retraces before downstream margins expand.", catalyst: "Upstream sensitivity and dividend quality attract capital.", riskLevel: "Medium", thesis: "Large upstream torque and strong cash returns in an oil squeeze." },
      { ticker: "COP", direction: "LONG", conviction: 4, sector: "Energy", horizon: "1-4 weeks", pairTrade: "Long COP / Short UAL", thesisBreaker: "Headline escalation fails to convert into sustained crude drawdown.", catalyst: "Cleaner oil beta than integrated peers.", riskLevel: "High", thesis: "Upstream-heavy exposure gives cleaner oil beta than integrated peers." },
      { ticker: "LNG", direction: "LONG", conviction: 4, sector: "Gas / LNG", horizon: "2-8 weeks", pairTrade: "Long LNG / Short airlines basket", thesisBreaker: "Shipping stress stays localized and gas balances remain loose.", catalyst: "LNG premium widens if Atlantic and Red Sea routes tighten.", riskLevel: "High", thesis: "LNG export leverage rises if shipping routes and gas balances tighten." },
      { ticker: "FRO", direction: "LONG", conviction: 4, sector: "Shipping", horizon: "1-3 weeks", pairTrade: "Long FRO / Short CCL", thesisBreaker: "Rerouting proves temporary and rate spike fades.", catalyst: "Voyage lengths and risk premia push tanker day rates higher.", riskLevel: "High", thesis: "Tanker day rates can spike when voyages reroute around risk zones." },
      { ticker: "TNK", direction: "LONG", conviction: 3, sector: "Shipping", horizon: "1-3 weeks", pairTrade: "Long TNK / Short UAL", thesisBreaker: "Insurance market normalizes quickly.", catalyst: "Refined-product freight reacts fast to route disruption.", riskLevel: "High", thesis: "Product tanker pricing improves with insurance and routing friction." },
      { ticker: "LMT", direction: "LONG", conviction: 3, sector: "Defense", horizon: "1-6 months", pairTrade: "Long LMT / Short travel basket", thesisBreaker: "Conflict stays rhetorical without procurement urgency.", catalyst: "Interceptor and missile demand rises with Gulf defense posture.", riskLevel: "Medium", thesis: "Missile and air-defense replenishment benefits from a sustained Gulf scare." },
      { ticker: "NOC", direction: "LONG", conviction: 3, sector: "Defense", horizon: "1-6 months", pairTrade: "Long NOC / Short consumer cyclicals", thesisBreaker: "Budget focus shifts away from missile defense.", catalyst: "Naval and missile systems benefit from prolonged escalation.", riskLevel: "Medium", thesis: "Naval, space, and missile defense exposure fits prolonged regional escalation." },
      { ticker: "HAL", direction: "LONG", conviction: 3, sector: "Oil services", horizon: "1-3 months", pairTrade: "Long HAL / Short airline ETF proxy", thesisBreaker: "Oil spike is brief and producers avoid capex follow-through.", catalyst: "Sustained crude strength can reopen service-cycle upside.", riskLevel: "High", thesis: "Oilfield services typically follow through if crude stays bid long enough." },
      { ticker: "UAL", direction: "SHORT", conviction: 3, sector: "Airlines", horizon: "1-4 weeks", pairTrade: "Short UAL / Long XOM", thesisBreaker: "Fuel retreats quickly and demand remains resilient.", catalyst: "Jet fuel inflation and route changes pressure margins first.", riskLevel: "High", thesis: "Jet fuel inflation and route disruptions pressure airline margins." }
    ]
  },
  taiwan: {
    key: "taiwan",
    title: "China / Taiwan",
    subtitle: "Gray-zone pressure, customs blockade risk, Indo-Pacific defense bid",
    color: "#5bc0ff",
    query:
      "China Taiwan Strait PLA ships aircraft drills customs blockade semiconductor supply chain US aid defense",
    newsFallbackQueries: [
      "Taiwan China military drills Taiwan Strait",
      "Taiwan China blockade semiconductor supply chain",
      "US Taiwan defense aid China"
    ],
    heatBase: 67,
    summary:
      "Updated for persistent PLA activity around Taiwan and blockade-risk headlines: semiconductor disruption, consumer hardware downside, and defense / onshoring beneficiaries.",
    secondOrderEffects: [
      "A customs or quarantine-style blockade can hit inventories before fabs are physically disrupted.",
      "Consumer hardware multiples compress on uncertainty before revenue impacts show up.",
      "Alternative foundry, packaging, and U.S.-based fab capacity can rerate on resilience demand before orders shift."
    ],
    indicatorBlueprints: [
      { label: "Semiconductor stress", unit: "%", mode: "risk-on-disruption", base: 100, sensitivity: 0.95 },
      { label: "Defense bid", unit: "%", mode: "risk-on-disruption", base: 100, sensitivity: 0.48 },
      { label: "Asia shipping risk", unit: "pts", mode: "risk-on-disruption", base: 38, sensitivity: 0.82 },
      { label: "Consumer hardware drawdown", unit: "%", mode: "risk-on-disruption", base: 9, sensitivity: 0.5 }
    ],
    trades: [
      { ticker: "LMT", direction: "LONG", conviction: 4, sector: "Defense", horizon: "2-8 weeks", pairTrade: "Long LMT / Short AAPL", thesisBreaker: "Tensions cool before deterrence budgets move.", catalyst: "Missile and deterrence spending rise in Indo-Pacific stress.", riskLevel: "Medium", thesis: "High-end missiles, interceptors, and deterrence spending rise in Indo-Pacific stress." },
      { ticker: "RTX", direction: "LONG", conviction: 4, sector: "Defense", horizon: "2-8 weeks", pairTrade: "Long RTX / Short QQQ proxy", thesisBreaker: "Defense leadership lags broader market rotation.", catalyst: "Air and missile defense systems benefit from regional rearmament.", riskLevel: "Medium", thesis: "Air and missile defense systems benefit from regional rearmament." },
      { ticker: "NOC", direction: "LONG", conviction: 4, sector: "Defense", horizon: "1-6 months", pairTrade: "Long NOC / Short consumer electronics basket", thesisBreaker: "Procurement remains slow-moving despite rhetoric.", catalyst: "Radar, C2, and missile programs fit a higher-alert Pacific posture.", riskLevel: "Medium", thesis: "Missile, radar, and space programs fit a higher-alert Pacific posture." },
      { ticker: "INTC", direction: "LONG", conviction: 3, sector: "Semiconductor onshoring", horizon: "1-6 months", pairTrade: "Long INTC / Short TSM", thesisBreaker: "Domestic fab narrative fails to win marginal capital.", catalyst: "Onshoring and redundancy narrative improves if Taiwan concentration becomes a bigger market risk.", riskLevel: "High", thesis: "Domestic fab narrative improves if Taiwan concentration becomes a bigger market risk." },
      { ticker: "GFS", direction: "LONG", conviction: 3, sector: "Foundry alternatives", horizon: "1-3 months", pairTrade: "Long GFS / Short QCOM", thesisBreaker: "Customers delay diversification spend.", catalyst: "Alternative foundry capacity gets revalued on resilience demand.", riskLevel: "High", thesis: "Alternative foundry capacity gets revalued on supply-chain resilience demand." },
      { ticker: "AVAV", direction: "LONG", conviction: 3, sector: "Drones / ISR", horizon: "1-8 weeks", pairTrade: "Long AVAV / Short travel-tech proxy", thesisBreaker: "No procurement urgency follows the headlines.", catalyst: "ISR and drone demand often rerates in contested-maritime scenarios.", riskLevel: "High", thesis: "ISR and drone demand often re-rates in contested-maritime scenarios." },
      { ticker: "AAPL", direction: "SHORT", conviction: 4, sector: "Consumer hardware", horizon: "1-4 weeks", pairTrade: "Short AAPL / Long LMT", thesisBreaker: "Supply chain remains intact and risk premium fades.", catalyst: "Assembly concentration and consumer hardware exposure make it a direct shock absorber.", riskLevel: "High", thesis: "Assembly concentration and consumer hardware exposure make it a direct shock absorber." },
      { ticker: "NVDA", direction: "SHORT", conviction: 3, sector: "AI / Semis", horizon: "1-3 weeks", pairTrade: "Short NVDA / Long RTX", thesisBreaker: "AI demand strength overwhelms geopolitical de-rating.", catalyst: "Supply-chain fragility meets premium valuation risk.", riskLevel: "High", thesis: "AI supply chains and premium multiple create downside if hardware flow is impaired." },
      { ticker: "QCOM", direction: "SHORT", conviction: 3, sector: "Handsets", horizon: "1-4 weeks", pairTrade: "Short QCOM / Long GFS", thesisBreaker: "Smartphone demand proves resilient and logistics keep flowing.", catalyst: "Handset and Asia supply-chain dependence leave earnings sensitive to disruption.", riskLevel: "High", thesis: "Handset and Asia supply-chain dependence leave earnings sensitive to disruption." },
      { ticker: "TSM", direction: "SHORT", conviction: 5, sector: "Semiconductor manufacturing", horizon: "1-4 weeks", pairTrade: "Short TSM / Long INTC", thesisBreaker: "Cross-strait signals soften materially.", catalyst: "Direct center-of-gravity risk in any severe cross-strait escalation.", riskLevel: "Very high", thesis: "Direct center-of-gravity risk in any severe cross-strait escalation." }
    ]
  },
  europe: {
    key: "europe",
    title: "Russia / NATO / Western Europe",
    subtitle: "Drone waves, Baltic intercepts, rearmament and LNG repricing",
    color: "#c9ff66",
    query:
      "Russia Ukraine NATO Baltic Sea intercept drones missile defense European rearmament Russian LNG ban",
    newsFallbackQueries: [
      "Russia Ukraine NATO drones air defense",
      "Europe defense rearmament Russia Ukraine NATO",
      "EU Russian LNG ban Europe gas"
    ],
    heatBase: 66,
    summary:
      "Updated for renewed Russian drone waves, Baltic air-policing intercepts, European air-defense urgency, and the EU's staged Russian LNG exit.",
    secondOrderEffects: [
      "European rearmament can outlast the immediate headline cycle and support defense multiples longer than energy spikes do.",
      "Russian LNG restrictions can lift U.S. gas infrastructure and producers before spot gas fully rerates.",
      "Travel weakness often shows up through bookings and sentiment before official traffic data."
    ],
    indicatorBlueprints: [
      { label: "NATO procurement", unit: "%", mode: "risk-on-disruption", base: 100, sensitivity: 0.62 },
      { label: "European gas stress", unit: "pts", mode: "risk-on-disruption", base: 41, sensitivity: 0.66 },
      { label: "Transatlantic travel drag", unit: "%", mode: "risk-on-disruption", base: 8, sensitivity: 0.42 },
      { label: "Defense leadership", unit: "%", mode: "risk-on-disruption", base: 100, sensitivity: 0.44 }
    ],
    trades: [
      { ticker: "RTX", direction: "LONG", conviction: 5, sector: "Defense", horizon: "2-12 weeks", pairTrade: "Long RTX / Short UAL", thesisBreaker: "European response remains political, not procurement-driven.", catalyst: "Air-defense demand and replenishment remain the cleanest expression.", riskLevel: "Medium", thesis: "European air-defense demand and replenishment programs remain the cleanest expression." },
      { ticker: "LMT", direction: "LONG", conviction: 4, sector: "Defense", horizon: "1-6 months", pairTrade: "Long LMT / Short CCL", thesisBreaker: "Backlog upside is already fully priced.", catalyst: "Broad NATO procurement and missile demand support backlog expansion.", riskLevel: "Medium", thesis: "Broad NATO procurement and missile demand support backlog expansion." },
      { ticker: "NOC", direction: "LONG", conviction: 4, sector: "Defense", horizon: "1-6 months", pairTrade: "Long NOC / Short travel basket", thesisBreaker: "Spending emphasis shifts toward domestic European primes only.", catalyst: "Command, radar, and interceptors fit higher European readiness spending.", riskLevel: "Medium", thesis: "Command, radar, and interceptors fit higher European readiness spending." },
      { ticker: "GD", direction: "LONG", conviction: 4, sector: "Defense", horizon: "1-6 months", pairTrade: "Long GD / Short consumer cyclicals", thesisBreaker: "Rearmament rhetoric outruns actual contract cadence.", catalyst: "Ammunition, armored systems, and defense electronics benefit from rearmament.", riskLevel: "Medium", thesis: "Ammunition, armored systems, and defense electronics benefit from rearmament." },
      { ticker: "HII", direction: "LONG", conviction: 3, sector: "Naval defense", horizon: "1-6 months", pairTrade: "Long HII / Short airlines", thesisBreaker: "Atlantic naval posture does not shift materially.", catalyst: "Naval emphasis rises when the Atlantic and northern flank look less secure.", riskLevel: "High", thesis: "Naval emphasis rises when the Atlantic and northern flank look less secure." },
      { ticker: "LNG", direction: "LONG", conviction: 4, sector: "Gas / LNG", horizon: "2-8 weeks", pairTrade: "Long LNG / Short CCL", thesisBreaker: "European storage and weather mute the gas response.", catalyst: "Europe often leans harder on LNG when pipeline and security risk rises.", riskLevel: "High", thesis: "Europe often leans harder on LNG when pipeline and security risk rises." },
      { ticker: "KMI", direction: "LONG", conviction: 3, sector: "Midstream", horizon: "1-3 months", pairTrade: "Long KMI / Short UAL", thesisBreaker: "Feedgas demand fails to accelerate.", catalyst: "US gas infrastructure gains if LNG feedgas demand persists.", riskLevel: "Medium", thesis: "US gas infrastructure gains if LNG feedgas demand persists." },
      { ticker: "EQT", direction: "LONG", conviction: 3, sector: "Natural gas", horizon: "1-8 weeks", pairTrade: "Long EQT / Short travel ETF proxy", thesisBreaker: "Gas market stays well supplied despite Europe headlines.", catalyst: "Appalachian gas names can rerate if Europe drives another gas bid.", riskLevel: "High", thesis: "Appalachian gas names can re-rate if Europe drives another gas bid." },
      { ticker: "UAL", direction: "SHORT", conviction: 3, sector: "Airlines", horizon: "1-4 weeks", pairTrade: "Short UAL / Long RTX", thesisBreaker: "Security shock fades without demand damage.", catalyst: "Transatlantic travel demand and costs get hit in a Europe security shock.", riskLevel: "High", thesis: "Transatlantic travel demand and costs get hit in a Europe security shock." },
      { ticker: "CCL", direction: "SHORT", conviction: 3, sector: "Leisure travel", horizon: "1-4 weeks", pairTrade: "Short CCL / Long LNG", thesisBreaker: "Consumer travel remains robust despite headlines.", catalyst: "Travel-discretionary exposure is vulnerable to European headline risk.", riskLevel: "High", thesis: "Travel-discretionary exposure is vulnerable to European headline risk." }
    ]
  }
};

const HEADLINE_LIMIT = 10;

const fallbackQuotes = {
  XOM: { price: 153.76, annualizedVol: 0.284 },
  CVX: { price: 192.1, annualizedVol: 0.235 },
  COP: { price: 124.51, annualizedVol: 0.311 },
  LNG: { price: 271.83, annualizedVol: 0.323 },
  FRO: { price: 36.82, annualizedVol: 0.463 },
  TNK: { price: 80.78, annualizedVol: 0.386 },
  LMT: { price: 520.84, annualizedVol: 0.291 },
  NOC: { price: 572.97, annualizedVol: 0.313 },
  HAL: { price: 41.82, annualizedVol: 0.309 },
  UAL: { price: 90.43, annualizedVol: 0.547 },
  RTX: { price: 173.46, annualizedVol: 0.268 },
  INTC: { price: 96.88, annualizedVol: 0.854 },
  GFS: { price: 66.97, annualizedVol: 0.59 },
  AVAV: { price: 178.74, annualizedVol: 0.807 },
  AAPL: { price: 276.11, annualizedVol: 0.255 },
  NVDA: { price: 195.37, annualizedVol: 0.368 },
  QCOM: { price: 167.71, annualizedVol: 0.444 },
  TSM: { price: 396.45, annualizedVol: 0.403 },
  GD: { price: 351.54, annualizedVol: 0.259 },
  HII: { price: 364.35, annualizedVol: 0.4 },
  KMI: { price: 32.33, annualizedVol: 0.203 },
  EQT: { price: 59.47, annualizedVol: 0.315 },
  CCL: { price: 25.49, annualizedVol: 0.57 }
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "http:" ? http : https;
    const request = client.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 Codex Scenario Dashboard"
        }
      },
      (response) => {
        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`Request failed: ${response.statusCode}`));
          response.resume();
          return;
        }

        let data = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => resolve(data));
      }
    );

    request.on("error", reject);
  });
}

function formatDateForSearch(date) {
  return date.toISOString().slice(0, 10);
}

function parseRssItems(xml) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  return items.map((match) => {
    const item = match[1];
    const title = decodeEntities(
      (
        item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
        item.match(/<title>(.*?)<\/title>/) || [null, "Untitled"]
      )[1]
    );
    const link = decodeEntities((item.match(/<link>(.*?)<\/link>/) || [null, ""])[1]);
    const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/) || [null, ""])[1];
    const publishedMs = Date.parse(pubDate);
    return {
      title,
      link,
      publishedAt: pubDate,
      publishedMs: Number.isFinite(publishedMs) ? publishedMs : null
    };
  });
}

function dedupeHeadlines(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.title}|${item.link}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function fetchGoogleNews(query, recentDays = 14, limit = HEADLINE_LIMIT) {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - recentDays);

  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", `${query} after:${formatDateForSearch(cutoff)}`);
  url.searchParams.set("hl", "en-US");
  url.searchParams.set("gl", "US");
  url.searchParams.set("ceid", "US:en");

  const xml = await fetchText(url.toString());
  const cutoffMs = cutoff.getTime();
  let items = parseRssItems(xml)
    .filter((item) => item.publishedMs && item.publishedMs >= cutoffMs)
    .sort((left, right) => right.publishedMs - left.publishedMs);

  if (items.length < Math.min(4, limit)) {
    const fallbackUrl = new URL("https://news.google.com/rss/search");
    fallbackUrl.searchParams.set("q", query);
    fallbackUrl.searchParams.set("hl", "en-US");
    fallbackUrl.searchParams.set("gl", "US");
    fallbackUrl.searchParams.set("ceid", "US:en");

    const fallbackXml = await fetchText(fallbackUrl.toString());
    const fallbackItems = parseRssItems(fallbackXml)
      .filter((item) => item.publishedMs && item.publishedMs >= cutoffMs)
      .sort((left, right) => right.publishedMs - left.publishedMs);

    items = dedupeHeadlines([...items, ...fallbackItems]).sort(
      (left, right) => right.publishedMs - left.publishedMs
    );
  }

  return items.slice(0, limit).map(({ publishedMs, ...item }) => item);
}

function decodeEntities(text) {
  return (text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchJson(url) {
  const text = await fetchText(url);
  return JSON.parse(text);
}

async function fetchYahooHistory(ticker) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`);
  url.searchParams.set("range", "6mo");
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
      errors.push(error.message);
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

function buildTrade(trade, price, annualizedVol, scenarioHeat) {
  const convictionBoost = trade.conviction * 0.0175;
  const heatBoost = scenarioHeat / 900;
  const volBoost = annualizedVol * 0.28;
  const rawUpside = 0.04 + convictionBoost + heatBoost + volBoost;
  const rawDownside = 0.025 + trade.conviction * 0.01 + annualizedVol * 0.12;

  const upsidePct = clamp(rawUpside, 0.06, 0.28);
  const downsidePct = clamp(rawDownside, 0.04, 0.16);

  const targetPrice =
    trade.direction === "LONG"
      ? price * (1 + upsidePct)
      : price * (1 - upsidePct);
  const stopPrice =
    trade.direction === "LONG"
      ? price * (1 - downsidePct)
      : price * (1 + downsidePct);

  return {
    ...trade,
    price,
    annualizedVol,
    upsidePct,
    downsidePct,
    targetPrice,
    stopPrice,
    rewardToRisk: Number((upsidePct / downsidePct).toFixed(2))
  };
}

function computeSubScores(config, headlines, liveHeat) {
  const text = headlines.map((item) => `${item.title} ${item.link}`.toLowerCase()).join(" ");
  const has = (keyword) => (text.includes(keyword) ? 1 : 0);

  if (config.key === "iran") {
    return [
      { label: "Military escalation", value: clamp(Math.round(liveHeat + has("missile") * 6 + has("iran") * 4), 35, 98) },
      { label: "Shipping disruption", value: clamp(Math.round(liveHeat + has("shipping") * 8 + has("hormuz") * 10 + has("mandeb") * 8), 35, 98) },
      { label: "Energy shock", value: clamp(Math.round(liveHeat + has("oil") * 7 + has("energy") * 6), 35, 98) },
      { label: "Defense demand", value: clamp(Math.round(liveHeat - 6 + has("missile") * 8), 30, 95) }
    ];
  }

  if (config.key === "taiwan") {
    return [
      { label: "Military escalation", value: clamp(Math.round(liveHeat + has("drill") * 8 + has("warship") * 7), 35, 98) },
      { label: "Semiconductor disruption", value: clamp(Math.round(liveHeat + has("semiconductor") * 10 + has("chip") * 8), 35, 98) },
      { label: "Shipping disruption", value: clamp(Math.round(liveHeat + has("strait") * 9 + has("shipping") * 6), 35, 98) },
      { label: "Onshoring tailwind", value: clamp(Math.round(liveHeat - 4 + has("supply chain") * 8), 30, 95) }
    ];
  }

  return [
    { label: "Military escalation", value: clamp(Math.round(liveHeat + has("nato") * 8 + has("russia") * 8), 35, 98) },
    { label: "Gas / power stress", value: clamp(Math.round(liveHeat + has("lng") * 9 + has("gas") * 8), 35, 98) },
    { label: "Defense replenishment", value: clamp(Math.round(liveHeat + has("missile") * 6 + has("defense") * 6), 35, 98) },
    { label: "Travel drag", value: clamp(Math.round(liveHeat - 3 + has("travel") * 8), 30, 95) }
  ];
}

function computeIndicators(config, liveHeat, subScores) {
  const averageScore =
    subScores.reduce((sum, item) => sum + item.value, 0) / Math.max(subScores.length, 1);

  return (config.indicatorBlueprints || []).map((item) => {
    const delta = Number((((averageScore - 50) / 10) * item.sensitivity).toFixed(1));
    const value = item.unit === "%"
      ? Number((item.base + delta).toFixed(1))
      : Number((item.base + delta).toFixed(1));
    return {
      label: item.label,
      value,
      unit: item.unit,
      delta,
      tone: delta >= 0 ? "up" : "down"
    };
  });
}

async function buildScenario(config) {
  let headlines = await fetchGoogleNews(config.query, 14, HEADLINE_LIMIT).catch(() => []);
  const fallbackQueries = Array.isArray(config.newsFallbackQueries)
    ? config.newsFallbackQueries
    : config.newsFallbackQuery
      ? [config.newsFallbackQuery]
      : [];

  for (const query of fallbackQueries) {
    if (headlines.length >= HEADLINE_LIMIT) {
      break;
    }

    const fallbackHeadlines = await fetchGoogleNews(query, 14, HEADLINE_LIMIT).catch(() => []);
    headlines = dedupeHeadlines([...headlines, ...fallbackHeadlines])
      .sort((left, right) => (Date.parse(right.publishedAt) || 0) - (Date.parse(left.publishedAt) || 0))
      .slice(0, HEADLINE_LIMIT);
  }

  const keywordHits = headlines.reduce((score, item) => {
    const text = `${item.title} ${item.link}`.toLowerCase();
    const weights = [
      ["strait", 2],
      ["hormuz", 3],
      ["yemen", 2],
      ["taiwan", 3],
      ["nato", 2],
      ["russia", 2],
      ["missile", 1],
      ["drill", 1],
      ["shipping", 2],
      ["energy", 1]
    ];
    return (
      score +
      weights.reduce(
        (sum, [keyword, weight]) => sum + (text.includes(keyword) ? weight : 0),
        0
      )
    );
  }, 0);

  const liveHeat = clamp(config.heatBase + keywordHits, 35, 96);
  const subScores = computeSubScores(config, headlines, liveHeat);
  const indicators = computeIndicators(config, liveHeat, subScores);

  const quoteMap = {};
  await Promise.all(
    config.trades.map(async (trade) => {
      try {
        const history = await fetchQuoteHistory(trade.ticker);
        const latest = history[history.length - 1];
        quoteMap[trade.ticker] = {
          price: latest.close,
          annualizedVol: computeVolatility(history),
          lastDate: latest.date
        };
      } catch (error) {
        quoteMap[trade.ticker] = {
          price: null,
          annualizedVol: 0.2,
          lastDate: null,
          error: error.message
        };
      }
    })
  );

  const trades = config.trades.map((trade) => {
    const quote = quoteMap[trade.ticker];
    if (!quote || !quote.price) {
      const fallback = fallbackQuotes[trade.ticker];
      if (fallback) {
        return {
          ...buildTrade(
            trade,
            fallback.price,
            fallback.annualizedVol,
            liveHeat
          ),
          priceSource: "Fallback baseline",
          quoteError: quote?.error || "Live quote unavailable"
        };
      }

      return {
        ...trade,
        price: null,
        annualizedVol: quote?.annualizedVol || 0.2,
        upsidePct: null,
        downsidePct: null,
        targetPrice: null,
        stopPrice: null,
        rewardToRisk: null,
        quoteError: quote?.error || "Quote unavailable"
      };
    }

    return {
      ...buildTrade(trade, quote.price, quote.annualizedVol, liveHeat),
      lastQuoteDate: quote.lastDate,
      priceSource: "Live quote"
    };
  });

  return {
    key: config.key,
    title: config.title,
    subtitle: config.subtitle,
    color: config.color,
    summary: config.summary,
    heat: liveHeat,
    subScores,
    indicators,
    secondOrderEffects: config.secondOrderEffects || [],
    topPairTrade: config.trades[0]?.pairTrade || null,
    refreshedAt: new Date().toISOString(),
    headlines,
    trades
  };
}

async function buildPayload() {
  const scenarios = {};
  const entries = await Promise.all(
    Object.values(scenarioConfig).map(async (config) => [config.key, await buildScenario(config)])
  );

  entries.forEach(([key, scenario]) => {
    scenarios[key] = scenario;
  });

  return {
    generatedAt: new Date().toISOString(),
    appVersion: "2026-05-04-current-refresh",
    disclaimer:
      "Scenario dashboard only. Not personalized investment advice. Use as a research workflow and validate every trade independently.",
    methodology:
      "Upside and downside are scenario-based risk bands derived from conviction score, live headline heat, and trailing realized volatility from recent Stooq or Yahoo Finance price history.",
    scenarios
  };
}

function serveStatic(req, res) {
  const safePath = path.normalize(req.url === "/" ? "/index.html" : req.url).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500);
      res.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  if (req.url.startsWith("/api/refresh")) {
    try {
      const payload = await buildPayload();
      getJson(res, 200, payload);
    } catch (error) {
      getJson(res, 500, {
        error: "Failed to refresh live data.",
        detail: error.message
      });
    }
    return;
  }

  serveStatic(req, res);
});

module.exports = {
  buildPayload,
  server
};

if (require.main === module) {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Scenario dashboard running at http://127.0.0.1:${PORT}`);
  });
}
