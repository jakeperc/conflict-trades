// Intel scoring (lib/intel.js): a negation in the 60 characters before a
// keyword flips its sign, so a false negation turns an escalation into a
// de-escalation. No network.

const test = require("node:test");
const assert = require("node:assert/strict");
const { scoreText, isNegated, targetHeatFromScore, sourceCredibilityMultiplier } = require("../lib/intel.js");

const SEIZE = [["seize", 5, "kinetic"]]; // kinetic doubles the weight

test("words that merely contain a negation do not flip the sign", () => {
  for (const t of [
    "Iran increases pressure; tanker seized", // "ease" inside "increases"
    "Released crew say a second tanker was seized", // "ease" inside "released"
    "Navy moves to defend shipping as tanker seized", // "end" inside "defend"
    "After weekend talks, tanker seized", // "end" inside "weekend"
    "Casino town hit; tanker seized", // "no" inside "casino"
  ]) {
    assert.equal(scoreText(t, SEIZE), 10, t);
  }
});

test("real negations still flip the sign", () => {
  for (const t of [
    "Iran denies tanker seized",
    "Officials say no tanker seized",
    "Navy says tanker was not seized",
    "Talks ease tension; tanker reportedly seized",
    "De-escalation talks continue after tanker seized",
    "Shipping normalized, tanker seized claim dismissed",
  ]) {
    assert.equal(scoreText(t, SEIZE), -10, t);
  }
});

test("only a negation before the keyword counts", () => {
  assert.equal(scoreText("Tanker seized; Tehran denies involvement", SEIZE), 10);
});

test("a keyword inside another word does not score", () => {
  assert.equal(scoreText("Seizure of assets debated", [["seize", 5, "kinetic"]]), 0);
  assert.equal(scoreText("A ceasefire holds", [["fire", 3, "kinetic"]]), 0);
});

test("isNegated reads words and word beginnings", () => {
  assert.equal(isNegated("the non-binding"), true);
  assert.equal(isNegated("deescalation"), true);
  assert.equal(isNegated("an increase in"), false);
  assert.equal(isNegated("they defend the"), false);
});

test("heat bands pick the highest band the score reaches", () => {
  const bands = { high: [20, 85], mid: [10, 70], low: [3, 55], baseline: 40 };
  assert.equal(targetHeatFromScore(25, bands), 85);
  assert.equal(targetHeatFromScore(10, bands), 70);
  assert.equal(targetHeatFromScore(3, bands), 55);
  assert.equal(targetHeatFromScore(-4, bands), 40);
});

test("source credibility reads the publisher's host, without www", () => {
  assert.equal(sourceCredibilityMultiplier("https://www.reuters.com/world/x"), 1.5);
  assert.equal(sourceCredibilityMultiplier("https://www.understandingwar.org/a"), 2.0);
  assert.equal(sourceCredibilityMultiplier("not a url"), 1.0);
  // Google News links carry Google's host, so credibility never applies to them
  assert.equal(sourceCredibilityMultiplier("https://news.google.com/rss/articles/CBMi"), 1.0);
});

// ---- the keyword lists the intel commands ship with -------------------

const fs = require("fs");
const path = require("path");
const { mentions } = require("../lib/keywords.js");
const TEMPLATES = path.join(__dirname, "..", ".claude", "templates", "intel");

test("every intel template keyword matches its own words", () => {
  // catches a keyword the matcher can never find (stray punctuation, a
  // malformed stem). It cannot tell an unmarked stem from a word: a
  // deliberate stem must be written with a trailing "*", as "de-escalat*" is
  for (const f of fs.readdirSync(TEMPLATES)) {
    const cfg = JSON.parse(fs.readFileSync(path.join(TEMPLATES, f), "utf8"));
    for (const [k] of cfg.weights) {
      const sample = k.endsWith("*") ? `${k.slice(0, -1)}ion talks` : `reports of ${k} today`;
      assert.equal(mentions(sample, k), true, `${f}: ${k}`);
    }
  }
});

test("stems and short plurals used by the templates still match", () => {
  assert.equal(mentions("de-escalation in the strait", "de-escalat*"), true);
  assert.equal(mentions("de-escalating", "de-escalat*"), true);
  assert.equal(mentions("two UAVs downed", "uav"), true);
  assert.equal(mentions("OPEC+ agrees cut", "opec+"), true);
  assert.equal(mentions("USS Carney", "us"), false);
});

// ---- independent review, 2026-11-10 -----------------------------------

test("a word cut by the 60-character window edge is not read as a negation", () => {
  // the tail of "increased", "cannot", "weekend" sits right at the edge
  for (const t of [
    "Oil prices increased zzzzzzzzzzzzz and markets watched closely as a tanker seized",
    "Traders cannot zzzzzzzzzzzzzzz and markets watched closely as a tanker seized",
    "Ships spend a long weekend  and markets watched closely as a tanker seized",
  ]) {
    assert.equal(scoreText(t, SEIZE), 10, t);
  }
  // a whole negation word at the edge still counts
  assert.equal(scoreText("Iran denies zzzzzzzzzz and markets watched closely as a tanker seized", SEIZE), -10);
});

test("longer negation forms count", () => {
  assert.equal(scoreText("Cancellation of the report: tanker seized", SEIZE), -10);
  assert.equal(scoreText("Falsely reported that a tanker was seized", SEIZE), -10);
});

test("intel scores the visible description, never its href", () => {
  const { headlineText } = require("../lib/keywords.js");
  const text = headlineText({ title: "Quiet", description: '<a href="https://news.google.com/rss/articles/CBMi-uav_fms-sdn">Quiet</a>' });
  assert.equal(scoreText(text, [["uav", 3], ["fms", 3], ["sdn", 3]]), 0);
});

test("variants, demonyms and agent nouns the templates rely on", () => {
  const yes = [
    ["F-35A sale approved", "f-35"],
    ["Taiwanese navy", "taiwan"],
    ["Japanese destroyer", "japan"],
    ["Israeli request", "israel"],
    ["Yemeni coast", "yemen"],
    ["Iraqi output", "iraq"],
    ["interceptors launched", "intercept"],
    ["interception confirmed", "intercept"],
    ["troop withdrawal", "withdraw"],
    ["defense contractor wins", "contract"],
    ["top LNG exporter", "lng export"],
    ["chipmakers slide", "chip"],
    ["greenhouse gases", "gas"],
    ["U.S., Japan and South Korea hold drills", "us"],
    ["U.S.-led patrol", "us"],
  ];
  for (const [t, k] of yes) assert.equal(mentions(t, k), true, `${k} in "${t}"`);
  // and the earlier false positives stay out
  for (const [t, k] of [["the senator", "nato"], ["a plan", "pla"], ["the miner", "mine"], ["F-350 truck", "f-35"], ["USS Carney", "us"]]) {
    assert.equal(mentions(t, k), false, `${k} in "${t}"`);
  }
});
