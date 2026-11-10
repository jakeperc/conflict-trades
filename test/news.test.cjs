// RSS parsing (lib/news.js). No network: the XML is a literal in the shape
// Google News served on 2026-11-10.

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseRssItems, dedupeHeadlines } = require("../lib/news.js");
const { sourceCredibilityMultiplier } = require("../lib/intel.js");

const XML = `<rss><channel>
<item><title>Tanker seized near Hormuz - Reuters</title><link>https://news.google.com/rss/articles/CBMiAAA?oc=5</link><pubDate>Tue, 10 Nov 2026 14:00:00 GMT</pubDate><description>&lt;a href="x"&gt;Tanker&lt;/a&gt;</description><source url="https://www.reuters.com">Reuters</source></item>
<item><title><![CDATA[Oil &amp; gas jump]]></title><link>https://example.org/a</link><pubDate>not a date</pubDate></item>
</channel></rss>`;

test("Google News items keep the publisher's site from <source url>", () => {
  const [a, b] = parseRssItems(XML);
  assert.equal(a.source, "Reuters");
  assert.equal(a.sourceUrl, "https://www.reuters.com");
  assert.equal(a.publishedMs, Date.parse("Tue, 10 Nov 2026 14:00:00 GMT"));
  assert.equal(b.sourceUrl, "");
  assert.equal(b.publishedMs, null);
});

test("credibility applies to Google News items through sourceUrl", () => {
  const [a] = parseRssItems(XML);
  assert.equal(sourceCredibilityMultiplier(a.link), 1.0);
  assert.equal(sourceCredibilityMultiplier(a.sourceUrl || a.link), 1.5);
});

test("duplicates are dropped by title and link", () => {
  const items = parseRssItems(XML);
  assert.equal(dedupeHeadlines([...items, ...items]).length, 2);
});
