// Cloudflare Worker: live quote proxy for the static site.
// GitHub Pages can't call Yahoo directly (no CORS), so the browser asks this worker instead.
//   GET /?symbols=BNO,USO,HAL  ->  { fetchedAt, quotes: { BNO: { price, prevClose, time }, ... } }
// Responses are cached at the edge for CACHE_SECONDS, so many viewers cost one upstream call.

const CACHE_SECONDS = 20;
const MAX_SYMBOLS = 30;
const SYMBOL_RE = /^[A-Z0-9.^=-]{1,12}$/;
const ALLOWED_ORIGINS = [
  "https://conflict-trades.jakepercy.com",
  "https://jakeperc.github.io"
];
const LOCAL_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function corsHeaders(origin) {
  const ok = origin && (ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN_RE.test(origin));
  return ok
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, OPTIONS", Vary: "Origin" }
    : { Vary: "Origin" };
}

function json(body, status, origin, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin), ...extra }
  });
}

async function yahooQuote(symbol) {
  const hosts = ["query2.finance.yahoo.com", "query1.finance.yahoo.com"];
  for (const host of hosts) {
    try {
      const res = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; conflict-trades-quotes/1.0)", Accept: "application/json" }
      });
      if (!res.ok) continue;
      const meta = (await res.json())?.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice;
      if (!Number.isFinite(price)) continue;
      return {
        price,
        prevClose: Number.isFinite(meta.chartPreviousClose) ? meta.chartPreviousClose : null,
        time: Number.isFinite(meta.regularMarketTime) ? new Date(meta.regularMarketTime * 1000).toISOString() : null
      };
    } catch {
      // try the next host
    }
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== "GET") return json({ error: "GET only" }, 405, origin);

    const url = new URL(request.url);
    const symbols = [...new Set((url.searchParams.get("symbols") || "").toUpperCase().split(",").map((s) => s.trim()).filter(Boolean))].sort();
    if (!symbols.length || symbols.length > MAX_SYMBOLS || !symbols.every((s) => SYMBOL_RE.test(s))) {
      return json({ error: `symbols must be 1-${MAX_SYMBOLS} comma-separated tickers` }, 400, origin);
    }

    // Cache key ignores Origin and symbol order; CORS headers are added per request.
    const cache = caches.default;
    const key = new Request(`${url.origin}/?symbols=${symbols.join(",")}`);
    let cached = await cache.match(key);
    if (!cached) {
      const quotes = {};
      await Promise.all(
        symbols.map(async (s) => {
          quotes[s] = await yahooQuote(s);
        })
      );
      cached = new Response(JSON.stringify({ fetchedAt: new Date().toISOString(), quotes }), {
        headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${CACHE_SECONDS}` }
      });
      ctx.waitUntil(cache.put(key, cached.clone()));
    }
    return new Response(cached.body, {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${CACHE_SECONDS}`, ...corsHeaders(origin) }
    });
  }
};
