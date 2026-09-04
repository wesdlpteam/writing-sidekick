import { test } from "node:test";
import assert from "node:assert/strict";
import { getYearGuide, getGenreGuide, FEEDBACK_RULES, readingLevel } from "../api/_curriculum.js";

test("the reading level steps up in three bands and names the year", () => {
  assert.match(readingLevel(1), /Year 1\. .*under 12 words/);
  assert.match(readingLevel(2), /six or seven year old/);
  assert.match(readingLevel(3), /Year 3\. .*under 16 words/);
  assert.match(readingLevel(4), /eight or nine year old/);
  assert.match(readingLevel(5), /Year 5\. .*proper names of writing strategies/);
  assert.match(readingLevel(6), /ten or eleven year old/);
  assert.doesNotMatch(readingLevel(6), /under 1[26] words/, "older writers get natural sentences, not a word cap");
});

test("years 1-6 return non-empty summaries", () => {
  for (let year = 1; year <= 6; year++) {
    const guide = getYearGuide(year);
    assert.ok(guide.summary.length > 200, `year ${year} summary too short`);
  }
});

test("summaries are year-distinctive", () => {
  assert.match(getYearGuide(1).summary, /simple sentences/i);
  assert.match(getYearGuide(2).summary, /compound sentences/i);
  assert.match(getYearGuide(3).summary, /paragraph/i);
  assert.match(getYearGuide(4).summary, /complex sentences/i);
  assert.match(getYearGuide(5).summary, /noun group|figurative/i);
  assert.match(getYearGuide(6).summary, /embedded/i);
});

test("invalid years throw", () => {
  assert.throws(() => getYearGuide(0));
  assert.throws(() => getYearGuide(7));
  assert.throws(() => getYearGuide("x"));
});

test("known genres return guidance, unknown returns empty string", () => {
  for (const genre of ["narrative", "recount", "persuasive", "report"]) {
    assert.ok(getGenreGuide(genre).length > 50, `${genre} guidance too short`);
  }
  assert.equal(getGenreGuide("unknown"), "");
  assert.equal(getGenreGuide(undefined), "");
});

test("feedback rules cover the non-negotiables", () => {
  assert.match(FEEDBACK_RULES, /never.*name/i);
  assert.match(FEEDBACK_RULES, /power-ups/i);
  assert.match(FEEDBACK_RULES, /generic praise .* banned|banned/i);
  assert.match(FEEDBACK_RULES, /year level/i);
  assert.match(FEEDBACK_RULES, /improvement comes first/i);
});
