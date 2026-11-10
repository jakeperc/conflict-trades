// The heatBase scorer in .claude/scripts/refresh-headlines.js. Requiring it
// no longer runs the refresh (main runs only when invoked directly), so
// these tests touch no network and no data/config.json.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { SCENARIO_KEYWORDS, scoreHeadlines, countSeverityHits } = require(path.join(__dirname, "..", ".claude", "scripts", "refresh-headlines.js"));

const NOISY = "https://news.google.com/rss/articles/CBMi-xi_pla-lng-hormuz?oc=5";
const h = (title, description = "") => ({ title, description, link: NOISY });

test("requiring the script does not start a refresh", () => {
  assert.equal(typeof scoreHeadlines, "function");
});

test("keyword weights add per headline, once per keyword", () => {
  // taiwan: taiwan 5 + strait 3 + pla 4 + drill 3
  assert.equal(scoreHeadlines([h("PLA drills in the Taiwan Strait")], "taiwan"), 15);
  assert.equal(scoreHeadlines([h("PLA drills, more PLA drills in the Taiwan Strait")], "taiwan"), 15);
});

test("the link and description HTML never score", () => {
  assert.equal(scoreHeadlines([h("Quiet day for markets", `<a href="${NOISY}">Quiet day</a>`)], "taiwan"), 0);
  assert.equal(scoreHeadlines([h("Quiet day for markets")], "iran"), 0);
});

test("plan, downplaying and Xi-less text do not count as PLA or Xi", () => {
  assert.equal(scoreHeadlines([h("Failing to plan; downplaying risks in Mexico")], "taiwan"), 0);
  assert.equal(scoreHeadlines([h("Xi meets Biden")], "taiwan"), 2);
});

test("severity terms count kinetic words, not words that contain them", () => {
  // strike, killed, wounded, and "civilians" matches both listed terms, civilian and civilians
  assert.equal(countSeverityHits([h("Drone strike killed two; civilians wounded")]), 5);
  assert.equal(countSeverityHits([h("Deadline passes; cyberattacks reported")]), 0); // not dead, not attack
});

test("every scenario keyword is matchable", () => {
  const { mentions } = require("../lib/keywords.js");
  for (const [key, list] of Object.entries(SCENARIO_KEYWORDS)) {
    for (const [k] of list) assert.equal(mentions(`news of ${k} today`, k), true, `${key}: ${k}`);
  }
});
