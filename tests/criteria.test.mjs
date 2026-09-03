import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CRITERIA,
  criteriaFor,
  criteriaPrompt,
  SENTENCE_TYPES,
  sentenceTypesFor,
  sentenceTypesPrompt,
  describeSentenceType,
} from "../api/_criteria.js";

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

test("twelve sentence types, each explained with a primary-age example", () => {
  assert.equal(Object.keys(SENTENCE_TYPES).length, 12);
  for (const [key, t] of Object.entries(SENTENCE_TYPES)) {
    assert.ok(t.name && t.rule.length > 30 && t.example.length > 8, key);
    assert.ok(t.minYear >= 1 && t.minYear <= 6, key);
  }
  assert.equal(sentenceTypesFor(6).length, 12);
  const year1 = sentenceTypesFor(1).map((t) => t.key);
  assert.deepEqual(year1, ["simple", "very_short"]);
  assert.ok(!sentenceTypesFor(4).some((t) => t.key === "semicolon"));
  assert.match(sentenceTypesPrompt(3), /- w_start: W-start sentence/);
  assert.doesNotMatch(sentenceTypesPrompt(3), /em_dash/);
});

test("describeSentenceType respects the year and rejects unknown keys", () => {
  assert.equal(describeSentenceType("nope", 6), null);
  assert.equal(describeSentenceType(null, 6), null);
  assert.equal(describeSentenceType("ed_start", 3), null);
  assert.deepEqual(describeSentenceType("very_short", 1), {
    key: "very_short",
    name: "Very short sentence",
    rule: "Five words or fewer. It grabs attention, especially after a long sentence.",
    example: "Nobody moved.",
  });
});
