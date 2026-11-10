// Headline keyword matching (lib/keywords.js) and the scenario scorers that
// use it (lib/scenarios.js). No network: headlines are literals.

const test = require("node:test");
const assert = require("node:assert/strict");
const { mentions, headlineText } = require("../lib/keywords.js");
const { scoreHeadline, headlineRelevance, computeSubScores, buildTrade } = require("../lib/scenarios.js");

// A real-shaped Google News link: the article id is an encoded token whose
// letters spell keywords by chance ("lng", "xi", "pla", "us", "oil").
const NOISY_LINK = "https://news.google.com/rss/articles/CBMiS0FVX3lxTE5CM2xngXIplaUSoilWonNATOkoreaPLAxi?oc=5";

test("keywords match words, not letters inside other words", () => {
  const no = [
    ["the senator said", "nato"],
    ["failing to plan", "pla"],
    ["the risks of downplaying", "pla"],
    ["a taxi in Mexico", "xi"],
    ["before the deadline", "dead"],
    ["turmoil in markets", "oil"],
    ["business is using it", "us"],
    ["a wonder", "won"],
    ["examine the data", "mine"],
  ];
  for (const [text, k] of no) assert.equal(mentions(text, k), false, `${k} in "${text}"`);
});

test("keywords still match plurals, tenses, demonyms and possessives", () => {
  const yes = [
    ["missiles fired", "missile"],
    ["North Korea launched", "launch"],
    ["PLA drills near", "drill"],
    ["PLA drilling", "drill"],
    ["Russian drones hit border", "russia"],
    ["Iranian oil sales", "iran"],
    ["condemn North Korean missile barrage", "north korea"],
    ["Iran’s navy", "iran"],
    ["Iran's navy", "iran"],
    ["NATO allies", "nato"],
    ["Xi meets Trump", "xi"],
    ["US and Japan", "us"],
    ["new air  defense", "air defense"],
    ["Kim Jong Un visits", "kim jong un"],
  ];
  for (const [text, k] of yes) assert.equal(mentions(text, k), true, `${k} in "${text}"`);
});

test("the link is never scored", () => {
  assert.equal(headlineText({ title: "Quiet day", link: NOISY_LINK }).includes("news.google"), false);
  assert.equal(scoreHeadline({ title: "Quiet day for markets", link: NOISY_LINK }), 0);
  assert.equal(headlineRelevance({ title: "Quiet day for markets", link: NOISY_LINK }), 1);
});

test("a headline's keyword weights add up", () => {
  // hormuz 3 + shipping 2 + missile 1
  assert.equal(scoreHeadline({ title: "Missile threat halts shipping through Hormuz", link: NOISY_LINK }), 6);
  assert.equal(headlineRelevance({ title: "Missile threat halts shipping through Hormuz", link: NOISY_LINK }), 4);
});

test("sub-scores move with headline words only", () => {
  const quiet = [{ title: "Markets steady", link: NOISY_LINK }];
  const lng = [{ title: "LNG prices jump as gas flows fall", link: NOISY_LINK }];
  const base = computeSubScores({ key: "europe" }, quiet, 50);
  const hit = computeSubScores({ key: "europe" }, lng, 50);
  const gas = (s) => s.find((x) => x.label === "Gas / power stress").value;
  assert.equal(gas(base), 50);
  assert.equal(gas(hit), 50 + 9 + 8);
});

test("sub-scores stay within their clamps", () => {
  const loud = [{ title: "Missile strikes, Hormuz shipping halted, oil and energy spike as Iran escalates, Bab el-Mandeb mandeb closed" }];
  for (const key of ["iran", "taiwan", "korea", "europe"]) {
    for (const heat of [0, 100, 200]) {
      for (const s of computeSubScores({ key }, loud, heat)) {
        assert.ok(s.value >= 30 && s.value <= 98, `${key} ${s.label} ${s.value}`);
      }
    }
  }
});

test("buildTrade keeps upside within 7-40% and downside within 4-18%, which the trader's scorer relies on", () => {
  for (const conviction of [0, 1, 3, 5, 10]) {
    for (const vol of [0, 0.05, 0.3, 1, 4]) {
      for (const heat of [0, 50, 100, 300]) {
        for (const direction of ["LONG", "SHORT"]) {
          const t = buildTrade({ ticker: "X", conviction, direction }, 100, vol, heat);
          assert.ok(t.upsidePct >= 0.07 && t.upsidePct <= 0.4, `upside ${t.upsidePct}`);
          assert.ok(t.downsidePct >= 0.04 && t.downsidePct <= 0.18, `downside ${t.downsidePct}`);
          assert.ok(t.rewardToRisk > 0);
          if (direction === "LONG") assert.ok(t.targetPrice > 100 && t.stopPrice < 100);
          else assert.ok(t.targetPrice < 100 && t.stopPrice > 100);
        }
      }
    }
  }
});
