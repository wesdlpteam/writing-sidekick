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
  assert.equal(Object.keys(MOVES).length, 16);
  for (const [key, m] of Object.entries(MOVES)) {
    assert.ok(m.name && m.rule.length > 30 && m.example.length > 8, key);
    assert.ok(m.minYear >= 1 && m.minYear <= 6, key);
    assert.doesNotMatch(m.name, /\b(T\.S\.|C\.S\.|SPO|MPO|GST|TSG)\b/, `${key}: no classroom shorthand`);
    assert.doesNotMatch(`${m.name} ${m.rule}`, /signpost|connective|linking word|joining word|opener/i, `${key}: uses the school's names`);
  }
  assert.match(MOVES.transition.rule, /transition word or phrase/);
  assert.match(MOVES.subordinating_conjunction.rule, /Begin with a subordinating conjunction/);
  assert.deepEqual(movesFor(1).map((m) => m.key), ["sentence_types", "fragment_fix", "run_on_fix", "because_but_so", "sentence_expansion", "subordinating_conjunction", "elaborate", "paragraph_focus"]);
  assert.ok(movesFor(2).some((m) => m.key === "sentence_combining"));
  assert.ok(!movesFor(3).some((m) => m.key === "appositive"), "appositives wait until Year 4");
  assert.ok(!movesFor(4).some((m) => m.key === "general_to_specific_intro"), "introductions wait until Year 5");
  assert.equal(movesFor(6).length, 16);
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
  assert.match(year3, /"example_after" clearly shows/, "the strategy is named from the worked example");
  assert.doesNotMatch(year3, /try_this/);
  assert.match(year3, /say "transition word" \(never signpost word/, "naming rule keeps the classroom vocabulary");
  assert.match(year3, /insert a transition, begin it with a subordinating conjunction, vary vocabulary, give an example/, "tasks use the school's feedback phrasing");
  assert.match(MOVES.transition.rule, /time and sequence.*illustrate.*change direction.*conclude.*emphasise/, "all five transition types");
  assert.match(MOVES.topic_sentence.rule, /short and concise/);
  assert.match(MOVES.topic_sentence.rule, /supporting sentences after it/);
  assert.match(movesPrompt(5), /- appositive: Appositive\./);
});

test("run-on repair is a strategy of its own from Year 1, kept apart from combining", () => {
  assert.equal(MOVES.run_on_fix.minYear, 1);
  assert.equal(MOVES.run_on_fix.name, "Run-on sentences");
  assert.match(MOVES.run_on_fix.rule, /full stop/);
  assert.match(MOVES.run_on_fix.rule, /capital letter/);
  // Two complete sentences, so the example itself shows the split it asks for.
  assert.equal(MOVES.run_on_fix.example.match(/[.!?]/g).length, 2);
  assert.match(movesPrompt(1), /- run_on_fix: Run-on sentences\./);
  assert.match(movesPrompt(1), /run_on_fix is its opposite, splitting ONE over-long chained sentence/);
  assert.match(movesPrompt(1), /never call that combining/);
  assert.match(movesPrompt(3), /split your long sentence where the first whole idea ends/);
});

test("the book terms reach the child only with their meaning", () => {
  const FRAGMENT = /fragment \(a half sentence that is only part of an idea\)/;
  const KERNEL = /kernel sentence \(a short sentence that makes sense on its own\)/;
  for (const [key, m] of Object.entries(MOVES)) {
    const uses = `${m.name} ${m.rule} ${m.example}`.match(/\b(kernel|fragment)s?\b/gi) || [];
    for (const term of uses) assert.ok(FRAGMENT.test(m.rule) || KERNEL.test(m.rule), `${key}: ${term} comes with its meaning`);
  }
  assert.match(MOVES.sentence_expansion.rule, KERNEL);
  assert.match(MOVES.sentence_expansion.rule, /a short sentence that makes sense on its own/);
  assert.match(MOVES.sentence_expansion.rule, /Keep the words you started with/);
  // The book's term, with a missing-subject example (the book holds dependent clauses back).
  assert.equal(MOVES.fragment_fix.name, "Sentences and fragments");
  assert.match(MOVES.fragment_fix.rule, FRAGMENT);
  assert.doesNotMatch(MOVES.fragment_fix.rule, /Because it was raining/);
  assert.match(MOVES.fragment_fix.rule, /Ran down the hill/);
  assert.equal(MOVES.run_on_fix.name, "Run-on sentences");
  const prompt = movesPrompt(3);
  assert.doesNotMatch(prompt, /staffroom words/);
  assert.match(prompt, /"fragment" and "kernel sentence" are allowed/);
  assert.match(prompt, /fragment \(a half sentence that is only part of an idea\), kernel sentence \(a short sentence that makes sense on its own\)/);
  assert.match(prompt, /Never write "kernel" on its own/);
});

test("per-year rule text: conjunction order, transition kinds, expansion questions, because/but/so", () => {
  // subordinating conjunctions: the book's order, four words in Years 1-3 and ten from Year 4
  for (const year of [1, 2, 3]) {
    const rule = describeMove("subordinating_conjunction", year).rule;
    assert.match(rule, /\(After, Before, If or When\)/, `Year ${year}`);
    assert.doesNotMatch(rule, /Although|Since|Unless|Even though/, `Year ${year}`);
  }
  for (const year of [4, 5, 6]) {
    assert.match(describeMove("subordinating_conjunction", year).rule, /\(After, Before, If, When, Even though, Although, Whenever, Since, While or Unless\)/, `Year ${year}`);
  }
  assert.equal(MOVES.subordinating_conjunction.minYear, 1);
  assert.ok(describeMove("subordinating_conjunction", 1), "offered from Year 1");
  // transitions: time/sequence, conclusion, illustration in Years 2-3; direction and emphasis from Year 4
  for (const year of [2, 3]) {
    const rule = describeMove("transition", year).rule;
    assert.match(rule, /time and sequence.*conclude.*illustrate/, `Year ${year}`);
    assert.doesNotMatch(rule, /However|On the other hand|change direction|emphasise|In addition/, `Year ${year}`);
  }
  const year4 = describeMove("transition", 4).rule;
  assert.match(year4, /time and sequence.*illustrate.*change direction.*conclude.*emphasise/);
  assert.match(year4, /In addition, Most importantly or In particular to emphasise/);
  assert.doesNotMatch(year4, /In fact|Most of all/);
  assert.match(year4, /sentence or paragraph/, "transitions link paragraphs too");
  // expansion questions: when, where, why in Years 1-2; how joins in Year 3
  for (const year of [1, 2]) assert.match(describeMove("sentence_expansion", year).rule, /\(when, where or why\)/);
  for (const year of [3, 4, 5, 6]) assert.match(describeMove("sentence_expansion", year).rule, /\(when, where, why or how\)/);
  // because, but, so: so arrives in Year 2
  assert.doesNotMatch(describeMove("because_but_so", 1).rule, /\bso\b/);
  assert.match(describeMove("because_but_so", 1).rule, /because \(the reason\) or but/);
  assert.match(describeMove("because_but_so", 2).rule, /or so \(the result/);
  // the same text reaches the model through movesFor and movesPrompt
  assert.equal(movesFor(1).find((m) => m.key === "subordinating_conjunction").rule, describeMove("subordinating_conjunction", 1).rule);
  assert.match(movesPrompt(1), /- subordinating_conjunction: .*\(After, Before, If or When\)/);
  assert.match(movesPrompt(5), /- subordinating_conjunction: .*Even though, Although, Whenever, Since, While or Unless/);
  assert.doesNotMatch(movesPrompt(2), /Whenever|Unless/);
  assert.match(movesPrompt(2), /never mark down a child's own correct use of a later conjunction or transition/i);
});

test("genre gate: stories and poems are not offered the paragraph-structure strategies", () => {
  const gated = ["topic_sentence", "concluding_sentence", "general_to_specific_intro", "specific_to_general_conclusion"];
  for (const genre of ["narrative", "poetry"]) {
    const keys = movesFor(6, genre).map((m) => m.key);
    for (const key of gated) {
      assert.ok(!keys.includes(key), `${genre}: ${key} not offered`);
      assert.equal(describeMove(key, 6, genre), null, `${genre}: ${key} has no explanation`);
      assert.doesNotMatch(movesPrompt(6, genre), new RegExp(`- ${key}:`));
    }
    assert.match(movesPrompt(6, genre), /do not ask for a topic sentence, a concluding sentence/);
    assert.ok(keys.includes("sentence_expansion") && keys.includes("paragraph_focus"), "the other strategies stay");
  }
  for (const genre of ["persuasive", "report", "recount", ""]) {
    const keys = movesFor(6, genre).map((m) => m.key);
    for (const key of gated) assert.ok(keys.includes(key), `${genre || "unchosen"}: ${key} offered`);
    assert.ok(describeMove("topic_sentence", 6, genre));
  }
  assert.equal(movesFor(6).length, 16, "no genre given offers everything");
  assert.match(movesPrompt(5, "persuasive"), /General to specific introduction\. .*Offer this only when the piece is already several paragraphs/);
});

test("paragraph teaching rules follow the chapters: one concluding statement, short topic sentences", () => {
  assert.match(movesPrompt(4, "persuasive"), /ONE final concluding statement/);
  assert.match(MOVES.concluding_sentence.rule, /new words, never word for word/);
  assert.match(MOVES.topic_sentence.rule, /A question or an exclamation can be a topic sentence too/);
  assert.match(MOVES.paragraph_focus.rule, /only says the same thing as another sentence/);
  assert.match(CRITERIA.paragraphing.guide, /ONE concluding statement/);
  assert.match(CRITERIA.paragraphing.guide, /two main ideas should be split/);
  assert.match(CRITERIA.persuasive_devices.guide, /Years 1 to 4 this is an opinion piece/);
  assert.match(CRITERIA.persuasive_devices.guide, /never just how many are used/);
});

test("describeMove respects the year and rejects unknown keys", () => {
  assert.equal(describeMove("nope", 6), null);
  assert.equal(describeMove(null, 6), null);
  assert.equal(describeMove("appositive", 3), null);
  assert.deepEqual(describeMove("because_but_so", 2), {
    key: "because_but_so",
    name: "Because, but, so",
    rule: "Finish a thin sentence with because (the reason), but (a change of direction) or so (the result of that reason or event). Each one pushes you to say more.",
    example: "The dog barked because a possum was on the fence.",
  });
});
