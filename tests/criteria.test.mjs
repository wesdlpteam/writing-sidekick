import { test } from "node:test";
import assert from "node:assert/strict";
import { CRITERIA, criteriaFor, criteriaPrompt, MOVES, movesFor, movesPrompt, describeMove } from "../api/_criteria.js";

const SHARED = ["audience", "text_structure", "ideas", "vocabulary", "cohesion", "paragraphing", "sentence_structure", "punctuation", "spelling"];

test("every area has a label, a child-facing subtitle and marker guidance", () => {
  assert.equal(Object.keys(CRITERIA).length, 11);
  for (const [key, c] of Object.entries(CRITERIA)) {
    assert.ok(c.label && c.sub && c.guide.length > 60, key);
    assert.doesNotMatch(c.guide, /NAPLAN|ACARA/, `${key} guidance is in our own words`);
  }
});

test("stories and recounts judge characters and setting, in marker order", () => {
  for (const genre of ["narrative", "recount"]) {
    const keys = criteriaFor(genre).map((c) => c.key);
    assert.deepEqual(keys, ["audience", "text_structure", "ideas", "character_setting", "vocabulary", "cohesion", "paragraphing", "sentence_structure", "punctuation", "spelling"], genre);
    assert.ok(criteriaFor(genre).every((c) => !c.choice));
  }
});

test("persuasive judges persuasive devices; reports and poems use the nine shared areas", () => {
  assert.equal(criteriaFor("persuasive").map((c) => c.key)[3], "persuasive_devices");
  assert.equal(criteriaFor("persuasive").length, 10);
  for (const genre of ["report", "poetry"]) {
    assert.deepEqual(criteriaFor(genre).map((c) => c.key), SHARED, genre);
  }
});

test("no kind chosen (or an unknown kind) offers both genre areas as a choice", () => {
  for (const genre of ["", "mystery", undefined]) {
    const list = criteriaFor(genre);
    assert.equal(list.length, 11, String(genre));
    const choices = list.filter((c) => c.choice).map((c) => c.key);
    assert.deepEqual(choices, ["character_setting", "persuasive_devices"], String(genre));
  }
  assert.match(criteriaPrompt(""), /EITHER character_setting/);
  assert.doesNotMatch(criteriaPrompt("narrative"), /EITHER/);
  assert.match(criteriaPrompt("narrative"), /"next_step": missing or weak/);
});

test("the writing moves are named in full, explained, and staged by year", () => {
  assert.equal(Object.keys(MOVES).length, 14);
  for (const [key, m] of Object.entries(MOVES)) {
    assert.ok(m.name && m.rule.length > 30 && m.example.length > 8, key);
    assert.ok(m.minYear >= 1 && m.minYear <= 6, key);
    assert.doesNotMatch(m.name, /\b(T\.S\.|C\.S\.|SPO|MPO|GST|TSG)\b/, `${key}: no classroom shorthand`);
    assert.doesNotMatch(`${m.name} ${m.rule}`, /signpost|connective|linking word|joining word|opener/i, `${key}: uses the school's names`);
  }
  assert.match(MOVES.transition.rule, /transition word or phrase/);
  assert.match(MOVES.subordinating_conjunction.rule, /Begin with a subordinating conjunction/);
  assert.deepEqual(movesFor(1).map((m) => m.key), ["sentence_types", "fragment_fix", "because_but_so"]);
  assert.ok(movesFor(3).some((m) => m.key === "sentence_combining"));
  assert.ok(!movesFor(3).some((m) => m.key === "appositive"), "appositives wait until Year 4");
  assert.ok(!movesFor(4).some((m) => m.key === "general_to_specific_intro"), "introductions wait until Year 5");
  assert.equal(movesFor(6).length, 14);
  assert.ok(movesFor(2).some((m) => m.key === "elaborate"));
});

test("the moves prompt lists only the moves for the year and says revise before edit", () => {
  const year3 = movesPrompt(3);
  assert.match(year3, /- sentence_expansion: Sentence expansion\./);
  assert.match(year3, /- because_but_so: Because, but, so\./);
  assert.doesNotMatch(year3, /appositive/);
  assert.match(year3, /Revising comes before editing/);
  assert.match(year3, /sentence_combining joins two or more/);
  assert.match(year3, /elaborate adds a NEW sentence/);
  assert.match(year3, /"now_you"/);
  assert.match(year3, /say "transition word" \(never signpost word/, "naming rule keeps the classroom vocabulary");
  assert.match(movesPrompt(5), /- appositive: Appositive\./);
});

test("describeMove respects the year and rejects unknown keys", () => {
  assert.equal(describeMove("nope", 6), null);
  assert.equal(describeMove(null, 6), null);
  assert.equal(describeMove("appositive", 3), null);
  assert.deepEqual(describeMove("because_but_so", 1), {
    key: "because_but_so",
    name: "Because, but, so",
    rule: "Finish a thin sentence with because (the reason), but (a change of direction) or so (what happened next). Each one pushes you to say more.",
    example: "The dog barked because a possum was on the fence.",
  });
});
