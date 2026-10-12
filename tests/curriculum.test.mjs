import { test } from "node:test";
import assert from "node:assert/strict";
import { getYearGuide, getGenreGuide, FEEDBACK_RULES, readingLevel } from "../api/_curriculum.js";

test("the reading level steps up in three bands and names the year", () => {
  assert.match(readingLevel(1), /Year 1\. .*under 12 words/);
  assert.match(readingLevel(2), /COACHING ONLY/);
  assert.match(readingLevel(2), /does NOT apply to example_before, example_after/);
  assert.match(readingLevel(3), /Year 3\. .*under 16 words/);
  assert.match(readingLevel(4), /Exclude worked examples and quotations/);
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

test("plain-words limits cover every child-facing field for Years 1-4, with the terms to avoid or explain", () => {
  for (const year of [1, 2, 3, 4]) {
    assert.match(readingLevel(year), /strength, next_step and assessment_note/, `Year ${year}`);
    assert.match(readingLevel(year), /\bskill\b/, `Year ${year}`);
  }
  for (const year of [1, 2]) {
    assert.match(readingLevel(year), /Avoid these grammar words: noun, verb, adjective/);
    assert.match(readingLevel(year), /The only school terms to keep are the strategy names/);
    assert.doesNotMatch(readingLevel(year), /joining word/, "no clash with the strategy names");
  }
  for (const year of [3, 4]) assert.match(readingLevel(year), /noun, verb, pronoun, clause, tense/);
  assert.doesNotMatch(readingLevel(5), /strength, next_step/, "older writers keep the natural-sentences guidance");
});

test("persuasive guidance: Years 1-4 opinion, reasons over devices, other side from Year 5", () => {
  const guide = getGenreGuide("persuasive");
  assert.match(guide, /in Years 1 to 4 a reason from the child's own experience counts/);
  assert.match(guide, /outside evidence or answering the other side is a stretch, never a must/);
  assert.match(guide, /From Year 5 the writer may answer the other side in one/);
  assert.match(guide, /never raising and rebutting in the same paragraph/);
  assert.match(guide, /strongest reason last is a good structure from Year 3/i);
  assert.match(guide, /call to action is a strength/);
  assert.match(guide, /not how many devices are used/);
});

test("the rules never let the model supply facts about the child's own topic", () => {
  assert.match(FEEDBACK_RULES, /Never supply facts, sources or numbers about the child's own topic/);
});
