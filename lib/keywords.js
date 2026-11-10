// Keyword matching for headline scoring.
//
// The scorers used to test `text.includes(keyword)` over title + URL. That
// counted words inside other words ("nato" in "senator", "pla" in "explain",
// "xi" in "Mexico", "dead" in "deadline") and, worse, letters inside Google
// News article URLs, which are long encoded tokens: "lng" or "xi" turn up in
// them by chance, so a scenario's heat moved with the URL encoding.
//
// A keyword now matches only in the headline's words (title and description,
// never the link), starting at a word boundary, with an optional common
// inflection so plurals and tenses still count: "missile" matches "missiles",
// "launch" matches "launched", "drill" matches "drills" and "drilling", and
// a country matches its demonym ("russia" matches "Russian").
// Three-letter keywords take only a plural ("uav" matches "UAVs", "gas" "gases") and
// shorter ones nothing, so "us" matches neither "used" nor "USS", and "won"
// does not match "wonder".
//
// A keyword ending in "*" is a deliberate stem and matches any word that
// starts with it: "de-escalat*" matches "de-escalation" and "de-escalating".

// plural, tense, demonym and agent endings: Russia -> Russian(s), Iran ->
// Iranian, Taiwan -> Taiwanese, Yemen -> Yemeni, Israel -> Israeli, intercept
// -> interceptor / interception, withdraw -> withdrawal, chip -> chipmaker(s)
const SUFFIX =
  "(?:s|es|ed|d|ing|n|ns|an|ans|ian|ians|ese|i|is|er|ers|or|ors|ion|ions|al|maker|makers|making)?";
// a model letter after a designation that ends in a digit: F-35 -> F-35A
const VARIANT = "[a-z]?";

const cache = new Map();

function patternFor(keyword) {
  let re = cache.get(keyword);
  if (!re) {
    const raw = keyword.toLowerCase().trim();
    const stem = raw.endsWith("*");
    const escaped = (stem ? raw.slice(0, -1) : raw)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+");
    // \b on the left; on the right, the inflection then a non-letter (or end)
    const suffix = stem
      ? ""
      : /\d$/.test(raw)
        ? VARIANT
        : raw.length > 3
          ? SUFFIX
          : raw.length === 3
            ? "(?:s|es)?"
            : "";
    const right = stem ? "" : "(?![\\p{L}\\p{N}])";
    re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}${suffix}${right}`, "u");
    cache.set(keyword, re);
  }
  return re;
}

/** Lower-cases and spells dotted country abbreviations the way the keyword lists do. */
function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\bu\.s\.(?:a\.)?/g, "us")
    .replace(/\bu\.k\./g, "uk");
}

/** The words of a headline that keywords are matched against: never the link. */
function headlineText(item) {
  // Google News descriptions are HTML whose href carries the same encoded
  // article token as the link, split by "-" and "_" into word-like pieces;
  // keep only the visible text.
  const description = String(item?.description || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/&nbsp;/g, " ");
  return normalize(`${item?.title || ""} ${description}`);
}

/** The title alone, for scorers that have always read only the title. */
function titleText(item) {
  return normalize(item?.title || "");
}

/**
 * Up to `n` characters before `idx`, starting at a word boundary: a word cut
 * by the window's edge is dropped rather than read as a whole word (the tail
 * of "increased" would otherwise read as "eased").
 */
function windowBefore(text, idx, n) {
  const start = Math.max(0, idx - n);
  let ctx = text.slice(start, idx);
  if (start > 0 && /[\p{L}\p{N}]/u.test(text[start - 1] || "")) ctx = ctx.replace(/^[\p{L}\p{N}]+/u, "");
  return ctx;
}

/** True when `keyword` appears in `text` as a word (or an inflection of one). */
function mentions(text, keyword) {
  return patternFor(keyword).test(normalize(text));
}

/** Index of the first word-match of `keyword` in `text`, or -1. */
function findMention(text, keyword) {
  const m = patternFor(keyword).exec(normalize(text));
  if (!m) return -1;
  // the pattern may have consumed one boundary character before the word
  return m[0].length && !/[\p{L}\p{N}]/u.test(m[0][0]) ? m.index + 1 : m.index;
}

/** True when a word in `text` starts with `stem` ("normaliz" matches "normalized"). */
function startsWord(text, stem) {
  const escaped = stem.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}`, "u").test(String(text || "").toLowerCase());
}

module.exports = { headlineText, titleText, normalize, windowBefore, mentions, findMention, startsWord };
