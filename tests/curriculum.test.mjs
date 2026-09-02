import { test } from "node:test";
import assert from "node:assert/strict";
import { getYearGuide, getGenreGuide, FEEDBACK_RULES } from "../api/_curriculum.js";

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
  assert.match(FEEDBACK_RULES, /exactly.*(wrote|written)|transcribe/i);
  assert.match(FEEDBACK_RULES, /wish/i);
});
