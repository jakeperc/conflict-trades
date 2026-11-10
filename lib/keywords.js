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
// Keywords of three letters or fewer take no inflection, so "us" does not
// match "used" or "using", and "won" does not match "wonder".

// plural, tense, and demonym endings: Russia -> Russian(s), Iran -> Iranian(s)
const SUFFIX = "(?:s|es|ed|d|ing|n|ns|an|ans|ian|ians)?";

const cache = new Map();

function patternFor(keyword) {
  let re = cache.get(keyword);
  if (!re) {
    const escaped = keyword
      .toLowerCase()
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+");
    // \b on the left; on the right, the inflection then a non-letter (or end)
    const suffix = keyword.trim().length > 3 ? SUFFIX : "";
    re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}${suffix}(?![\\p{L}\\p{N}])`, "u");
    cache.set(keyword, re);
  }
  return re;
}

/** The words of a headline that keywords are matched against: never the link. */
function headlineText(item) {
  return `${item?.title || ""} ${item?.description || ""}`.toLowerCase();
}

/** True when `keyword` appears in `text` as a word (or an inflection of one). */
function mentions(text, keyword) {
  return patternFor(keyword).test(String(text || "").toLowerCase());
}

module.exports = { headlineText, mentions };
