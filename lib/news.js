const { URL } = require("url");
const { fetchText } = require("./fetcher");

const HEADLINE_LIMIT = 10;

function decodeEntities(text) {
  return (text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
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
    const description = decodeEntities(
      (
        item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
        item.match(/<description>(.*?)<\/description>/) || [null, ""]
      )[1]
    );
    const publishedMs = Date.parse(pubDate);
    return {
      title,
      link,
      description,
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

function formatDateForSearch(date) {
  return date.toISOString().slice(0, 10);
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

  return items.slice(0, limit);
}

async function fetchRssFeed(url, limit = 20) {
  const xml = await fetchText(url);
  return parseRssItems(xml)
    .filter((item) => item.publishedMs)
    .sort((left, right) => right.publishedMs - left.publishedMs)
    .slice(0, limit);
}

module.exports = {
  HEADLINE_LIMIT,
  parseRssItems,
  dedupeHeadlines,
  fetchGoogleNews,
  fetchRssFeed,
  decodeEntities
};
