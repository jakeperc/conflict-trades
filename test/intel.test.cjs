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
