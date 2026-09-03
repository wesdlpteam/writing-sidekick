import { test } from "node:test";
import assert from "node:assert/strict";
import { handleFeedback } from "../api/feedback.js";

const area = (status, strength, next_step) => ({ status, strength, next_step });

const AREAS = {
  audience: area("steady", "'It was a sunny day.' sets the scene so your reader can picture it.", "Start with the dog moving so your reader is hooked from the first word."),
  text_structure: area("next_step", "", "Add an ending sentence that tells us what happened to the dog."),
  ideas: area("steady", "Two clear ideas: the dog and the weather.", "Tell us why the dog was running."),
  character_setting: area("next_step", "", "Give the dog a name and one detail, like floppy ears."),
  vocabulary: area("next_step", "'fast' works.", "Swap 'ran fast' for one strong verb like 'zoomed'."),
  cohesion: area("steady", "Both sentences are about the same moment.", "Join them with 'because' or 'while'."),
  paragraphing: area("steady", "", "One paragraph is fine for a piece this short."),
  sentence_structure: area("steady", "'The dog ran fast.' is a complete simple sentence.", "Start one sentence with a W word like 'When'."),
  punctuation: area("strength", "Capital letters and full stops are in place on both sentences.", "Try an exclamation mark when the dog does something exciting."),
  spelling: area("strength", "Every word is spelt correctly.", "Keep having a go at longer words."),
};

const GOOD_PAYLOAD = {
  headline: "'The dog ran fast.' is a clear, complete sentence. A strong verb and a W-start would make it fly.",
  areas: AREAS,
  power_ups: [
    {
      area: "sentence_structure",
      skill: "Start with a W word",
      why: "Both of your sentences start with 'The' and 'It'. A W-start makes the reader lean in.",
      your_line: "The dog ran fast.",
      try_this: "When the gate swung open, the dog ran fast.",
      sentence_type: "w_start",
      now_you: "Find your other sentence and start it with 'While' or 'When'.",
    },
    {
      area: "vocabulary",
      skill: "Show how fast with a strong verb",
      why: "'ran fast' tells us; a strong verb shows us.",
      your_line: "The dog ran fast.",
      try_this: "The dog zoomed across the grass.",
      sentence_type: null,
      now_you: "Find 'ran fast' and swap it for one strong verb.",
    },
  ],
  practice_words: [
    { correct: "family", wrote: "famly" },
    { correct: "because", wrote: "becos" },
  ],
  spelling_tip: "Say tricky words in syllables: fam-i-ly.",
  word_boost: {
    swaps: [{ from: "fast", to: ["speedy", "lightning-quick"] }],
    before: "The dog ran fast.",
    after: "The dog ran lightning-quick.",
  },
};

const TEXT = "The dog ran fast.\nIt was a sunny day.";

function mockFetch(modelContent, { capture } = {}) {
  return async (url, options) => {
    if (capture) {
      capture.url = url;
      capture.body = JSON.parse(options.body);
      capture.headers = options.headers;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: modelContent } }] }),
    };
  };
}

const ENV = { OPENAI_API_KEY: "sk-test", OPENAI_MODEL: "gpt-5.4-mini" };
const IMG = "data:image/jpeg;base64,/9j/AAAA";

const feedbackFor = (payload, body = { transcript: TEXT, yearLevel: 3, genre: "narrative" }, capture) =>
  handleFeedback(body, { fetchImpl: mockFetch(JSON.stringify(payload), { capture }), env: ENV });

// ---- shared validation -----------------------------------------------------

test("rejects invalid year level", async () => {
  const r = await handleFeedback({ image: IMG, yearLevel: 9 }, { fetchImpl: mockFetch("{}"), env: ENV });
  assert.equal(r.status, 400);
});

test("rejects missing image and transcript", async () => {
  const r = await handleFeedback({ yearLevel: 3 }, { fetchImpl: mockFetch("{}"), env: ENV });
  assert.equal(r.status, 400);
});

test("rejects oversized image", async () => {
  const big = "data:image/jpeg;base64," + "A".repeat(6_100_000);
  const r = await handleFeedback({ images: [IMG, big], yearLevel: 3 }, { fetchImpl: mockFetch("{}"), env: ENV });
  assert.equal(r.status, 413);
});

test("rejects more than four pages", async () => {
  const r = await handleFeedback({ images: [IMG, IMG, IMG, IMG, IMG], yearLevel: 3 }, { fetchImpl: mockFetch("{}"), env: ENV });
  assert.equal(r.status, 400);
  assert.match(r.payload.error, /four/i);
});

test("rejects a non-image data url", async () => {
  const r = await handleFeedback({ images: ["data:text/plain;base64,QUJD"], yearLevel: 3 }, { fetchImpl: mockFetch("{}"), env: ENV });
  assert.equal(r.status, 400);
});

test("rejects missing api key", async () => {
  const r = await handleFeedback({ image: IMG, yearLevel: 3 }, { fetchImpl: mockFetch("{}"), env: {} });
  assert.equal(r.status, 500);
});

// ---- step 1: photos -> transcript ------------------------------------------

test("photos go to a transcription-only call and return just the transcript", async () => {
  const capture = {};
  const r = await handleFeedback(
    { images: [IMG, IMG, IMG], yearLevel: 3, genre: "narrative" },
    { fetchImpl: mockFetch(JSON.stringify({ transcript: "I dont like peas.\nThey are green." }), { capture }), env: ENV },
  );
  assert.equal(r.status, 200);
  assert.deepEqual(r.payload, { transcript: "I dont like peas.\nThey are green." });
  const userParts = capture.body.messages[1].content;
  assert.equal(userParts.filter((p) => p.type === "image_url").length, 3, "every page is sent, in order");
  assert.ok(userParts.every((p) => p.type !== "image_url" || p.image_url.detail === "original"), "original detail keeps small marks");
  assert.equal(capture.body.verbosity, "high");
  assert.equal(capture.body.model, "gpt-5.4", "transcription uses the stronger model by default");
});

test("transcription rules cover apostrophes, crossed-out words and page order", async () => {
  const capture = {};
  await handleFeedback({ image: IMG, yearLevel: 2 }, { fetchImpl: mockFetch(JSON.stringify({ transcript: "x" }), { capture }), env: ENV });
  const sys = capture.body.messages[0].content;
  assert.match(sys, /apostrophe/i);
  assert.match(sys, /crossed out|crossed-out/i);
  assert.match(sys, /caret|inserted|added above/i);
  assert.match(sys, /page 1, then page 2|in order/i);
  assert.match(sys, /misspell/i);
  assert.doesNotMatch(sys, /power-up|power_ups/i, "the transcription call is not asked for feedback");
});

test("OPENAI_TRANSCRIBE_MODEL overrides the transcription model", async () => {
  const capture = {};
  await handleFeedback(
    { image: IMG, yearLevel: 2 },
    { fetchImpl: mockFetch(JSON.stringify({ transcript: "x" }), { capture }), env: { ...ENV, OPENAI_TRANSCRIBE_MODEL: "gpt-5.4-mini" } },
  );
  assert.equal(capture.body.model, "gpt-5.4-mini");
});

test("a 400 from the model retries once without the optional settings", async () => {
  const bodies = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    bodies.push(body);
    if (bodies.length === 1) return { ok: false, status: 400, json: async () => ({ error: { message: "Unsupported parameter: verbosity" } }) };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ transcript: "ok" }) } }] }) };
  };
  const r = await handleFeedback({ image: IMG, yearLevel: 2 }, { fetchImpl, env: ENV });
  assert.equal(r.status, 200);
  assert.equal(r.payload.transcript, "ok");
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].verbosity, undefined);
  assert.equal(bodies[1].messages[1].content.find((p) => p.type === "image_url").image_url.detail, "high");
});

test("unreadable pages come back as an empty transcript, not an error", async () => {
  const r = await handleFeedback({ image: IMG, yearLevel: 1 }, { fetchImpl: mockFetch(JSON.stringify({ transcript: "" })), env: ENV });
  assert.equal(r.status, 200);
  assert.equal(r.payload.transcript, "");
});

test("garbled transcription output -> 502 child-safe error", async () => {
  const r = await handleFeedback({ image: IMG, yearLevel: 2 }, { fetchImpl: mockFetch("sorry no"), env: ENV });
  assert.equal(r.status, 502);
  assert.doesNotMatch(r.payload.error, /json|parse|model/i);
});

// ---- step 2: checked transcript -> feedback --------------------------------

test("feedback prompt: year guide, rules, the ten areas, skill bank, sentence types, output spec", async () => {
  const capture = {};
  const r = await feedbackFor(GOOD_PAYLOAD, { transcript: TEXT, yearLevel: 3, genre: "narrative" }, capture);
  assert.equal(r.status, 200);
  const sys = capture.body.messages[0].content;
  assert.match(sys, /end of Year 3/);
  assert.match(sys, /NEVER use, repeat or guess/);
  assert.match(sys, /narrative/i);
  assert.match(sys, /generic praise .* banned|banned/i);
  assert.match(sys, /where to next/i, "feedback principles are in the prompt");
  assert.match(sys, /sensory details/i);
  assert.match(sys, /sentence openers/i);
  assert.match(sys, /show, don't tell/i);
  for (const key of ["audience", "text_structure", "ideas", "character_setting", "vocabulary", "cohesion", "paragraphing", "sentence_structure", "punctuation", "spelling"]) {
    assert.match(sys, new RegExp(`- ${key} \\(`), `area ${key} is described`);
  }
  assert.doesNotMatch(sys, /persuasive_devices/, "a story is not judged on persuasive devices");
  assert.match(sys, /"strength": done well/);
  assert.match(sys, /w_start: W-start sentence/);
  assert.match(sys, /ing_start/);
  assert.doesNotMatch(sys, /semicolon:/, "semi-colons are not offered to Year 3");
  assert.match(sys, /"areas"/);
  assert.match(sys, /power_ups/);
  assert.match(sys, /sentence_type/);
  assert.match(sys, /now_you/);
  assert.match(sys, /never use a power-up for spelling/i);
  assert.match(sys, /different line/i);
  assert.match(sys, /practice_words/);
  assert.match(sys, /spelling_tip/);
  assert.match(sys, /word_boost/);
  assert.match(sys, /not just a one-word swap/i);
  assert.doesNotMatch(sys, /NAPLAN/, "the marking guide itself is not in the prompt");
  assert.equal(capture.body.model, "gpt-5.4-mini", "OPENAI_MODEL still picks the feedback model");
  const userParts = capture.body.messages[1].content;
  assert.ok(!userParts.some((p) => p.type === "image_url"));
  assert.ok(userParts.some((p) => p.type === "text" && p.text.includes(TEXT)));
});

test("feedback response is normalised: headline, ten areas in marker order, power-ups with sentence types", async () => {
  const r = await feedbackFor(GOOD_PAYLOAD);
  assert.equal(r.status, 200);
  assert.equal(r.payload.transcript, TEXT);
  assert.equal(r.payload.headline, GOOD_PAYLOAD.headline);
  assert.deepEqual(
    r.payload.criteria.map((c) => c.key),
    ["audience", "text_structure", "ideas", "character_setting", "vocabulary", "cohesion", "paragraphing", "sentence_structure", "punctuation", "spelling"],
  );
  const punct = r.payload.criteria.find((c) => c.key === "punctuation");
  assert.deepEqual(punct, {
    key: "punctuation",
    label: "Punctuation",
    sub: "capitals, full stops and more",
    status: "strength",
    strength: "Capital letters and full stops are in place on both sentences.",
    nextStep: "Try an exclamation mark when the dog does something exciting.",
    powerUp: null,
  });
  assert.equal(r.payload.criteria.find((c) => c.key === "sentence_structure").powerUp, 1, "area points at its power-up");
  assert.equal(r.payload.criteria.find((c) => c.key === "vocabulary").powerUp, 2);
  assert.equal(r.payload.powerUps.length, 2);
  assert.deepEqual(r.payload.powerUps[0], {
    area: "sentence_structure",
    areaLabel: "Sentence structure",
    skill: "Start with a W word",
    why: "Both of your sentences start with 'The' and 'It'. A W-start makes the reader lean in.",
    yourLine: "The dog ran fast.",
    tryThis: "When the gate swung open, the dog ran fast.",
    sentenceType: {
      key: "w_start",
      name: "W-start sentence",
      rule: "Begins with a W word (When, While, Where, Who, What, With), then a comma after the first part, then the rest.",
      example: "When the bell rang, we sprinted to the oval.",
    },
    nowYou: "Find your other sentence and start it with 'While' or 'When'.",
  });
  assert.equal(r.payload.powerUps[1].sentenceType, null);
  assert.equal(r.payload.stars, undefined, "old shape is gone");
  assert.equal(r.payload.detail, undefined);
});

test("persuasive writing swaps characters and setting for persuasive devices", async () => {
  const capture = {};
  const areas = { ...AREAS };
  delete areas.character_setting;
  areas.persuasive_devices = area("next_step", "", "Ask your reader a question they cannot say no to.");
  const r = await feedbackFor({ ...GOOD_PAYLOAD, areas }, { transcript: TEXT, yearLevel: 5, genre: "persuasive" }, capture);
  assert.equal(r.status, 200);
  const keys = r.payload.criteria.map((c) => c.key);
  assert.equal(keys[3], "persuasive_devices");
  assert.ok(!keys.includes("character_setting"));
  assert.match(capture.body.messages[0].content, /- persuasive_devices \(/);
  assert.doesNotMatch(capture.body.messages[0].content, /- character_setting \(/);
  assert.match(capture.body.messages[0].content, /semicolon: Semi-colon sentence/, "Year 5 may be offered semi-colons");
});

test("reports and poems use the nine shared areas", async () => {
  for (const genre of ["report", "poetry"]) {
    const capture = {};
    const r = await feedbackFor(GOOD_PAYLOAD, { transcript: TEXT, yearLevel: 4, genre }, capture);
    assert.equal(r.status, 200, genre);
    const keys = r.payload.criteria.map((c) => c.key);
    assert.equal(keys.length, 9, genre);
    assert.ok(!keys.includes("character_setting") && !keys.includes("persuasive_devices"), genre);
    assert.doesNotMatch(capture.body.messages[0].content, /- (character_setting|persuasive_devices) \(/);
  }
});

test("kind of writing not chosen: model picks one of the two genre areas", async () => {
  const capture = {};
  const both = { ...AREAS, persuasive_devices: area("steady", "x", "y") };
  const r1 = await feedbackFor({ ...GOOD_PAYLOAD, areas: both }, { transcript: TEXT, yearLevel: 3, genre: "" }, capture);
  assert.equal(r1.status, 200);
  assert.match(capture.body.messages[0].content, /EITHER character_setting/);
  const keys1 = r1.payload.criteria.map((c) => c.key);
  assert.equal(keys1.length, 10, "only one of the two is kept when both come back");
  assert.equal(keys1[3], "character_setting");

  const onlyPersuasive = { ...AREAS };
  delete onlyPersuasive.character_setting;
  onlyPersuasive.persuasive_devices = area("steady", "x", "y");
  const r2 = await feedbackFor({ ...GOOD_PAYLOAD, areas: onlyPersuasive }, { transcript: TEXT, yearLevel: 3 });
  assert.equal(r2.status, 200);
  assert.equal(r2.payload.criteria.map((c) => c.key)[3], "persuasive_devices");
});

test("areas: one missing is tolerated, most missing -> 502, unknown status becomes steady, junk skipped", async () => {
  const nine = { ...AREAS };
  delete nine.cohesion;
  const r1 = await feedbackFor({ ...GOOD_PAYLOAD, areas: nine });
  assert.equal(r1.status, 200);
  assert.equal(r1.payload.criteria.length, 9);

  const few = { audience: AREAS.audience, ideas: AREAS.ideas, spelling: AREAS.spelling };
  const r2 = await feedbackFor({ ...GOOD_PAYLOAD, areas: few });
  assert.equal(r2.status, 502);

  const odd = { ...AREAS, ideas: area("amazing", "x", "y"), audience: "junk", paragraphing: area("steady", "", "") };
  const r3 = await feedbackFor({ ...GOOD_PAYLOAD, areas: odd });
  assert.equal(r3.status, 200);
  assert.equal(r3.payload.criteria.find((c) => c.key === "ideas").status, "steady");
  assert.ok(!r3.payload.criteria.some((c) => c.key === "audience"));
  assert.ok(!r3.payload.criteria.some((c) => c.key === "paragraphing"), "an area with no text at all is dropped");
});

test("sentence types: unknown or too advanced for the year -> null", async () => {
  const withOdd = {
    ...GOOD_PAYLOAD,
    power_ups: [
      { ...GOOD_PAYLOAD.power_ups[0], sentence_type: "haiku" },
      { ...GOOD_PAYLOAD.power_ups[1], sentence_type: "semicolon" },
    ],
  };
  const r = await feedbackFor(withOdd, { transcript: TEXT, yearLevel: 2, genre: "narrative" });
  assert.equal(r.status, 200);
  assert.equal(r.payload.powerUps[0].sentenceType, null);
  assert.equal(r.payload.powerUps[1].sentenceType, null, "semi-colons are not explained to a Year 2");

  const r6 = await feedbackFor(withOdd, { transcript: TEXT, yearLevel: 6, genre: "narrative" });
  assert.equal(r6.payload.powerUps[1].sentenceType.name, "Semi-colon sentence");
});

test("power-ups: unknown area kept unlinked, junk dropped, capped at three, none -> 502", async () => {
  const messy = {
    ...GOOD_PAYLOAD,
    power_ups: [
      { ...GOOD_PAYLOAD.power_ups[0], area: "handwriting" },
      GOOD_PAYLOAD.power_ups[1],
      { area: "ideas", skill: "Third", why: "Because.", your_line: "x", try_this: "y" },
      { area: "cohesion", skill: "Fourth", why: "Because.", your_line: "x", try_this: "y", now_you: "z" },
      { skill: "", why: "no skill", try_this: "y" },
      "junk",
    ],
  };
  const r = await feedbackFor(messy);
  assert.equal(r.status, 200);
  assert.equal(r.payload.powerUps.length, 3);
  assert.equal(r.payload.powerUps[0].area, "");
  assert.equal(r.payload.powerUps[0].areaLabel, "");
  assert.equal(r.payload.powerUps[2].skill, "Third");
  assert.equal(r.payload.powerUps[2].nowYou, "");
  assert.equal(r.payload.criteria.find((c) => c.key === "ideas").powerUp, 3);
  assert.equal(r.payload.criteria.find((c) => c.key === "sentence_structure").powerUp, null);

  const none = await feedbackFor({ ...GOOD_PAYLOAD, power_ups: [] });
  assert.equal(none.status, 502, "feedback without next steps is useless");
});

test("missing headline falls back to the first power-up", async () => {
  const bare = { ...GOOD_PAYLOAD };
  delete bare.headline;
  const r = await feedbackFor(bare);
  assert.equal(r.status, 200);
  assert.equal(r.payload.headline, "Start with a W word. Both of your sentences start with 'The' and 'It'. A W-start makes the reader lean in.");
});

test("feedback defaults to gpt-5.4 when no model configured", async () => {
  const capture = {};
  const r = await handleFeedback(
    { transcript: TEXT, yearLevel: 3 },
    { fetchImpl: mockFetch(JSON.stringify(GOOD_PAYLOAD), { capture }), env: { OPENAI_API_KEY: "sk-test" } },
  );
  assert.equal(r.status, 200);
  assert.equal(capture.body.model, "gpt-5.4");
});

test("parses fenced json from model", async () => {
  const fenced = "```json\n" + JSON.stringify(GOOD_PAYLOAD) + "\n```";
  const r = await handleFeedback({ transcript: TEXT, yearLevel: 2 }, { fetchImpl: mockFetch(fenced), env: ENV });
  assert.equal(r.status, 200);
});

test("unparseable feedback output -> 502 child-safe error", async () => {
  const r = await handleFeedback({ transcript: TEXT, yearLevel: 2 }, { fetchImpl: mockFetch("sorry no"), env: ENV });
  assert.equal(r.status, 502);
  assert.ok(r.payload.error.length > 10);
  assert.doesNotMatch(r.payload.error, /json|parse|model/i);
});

test("practice words pass through", async () => {
  const r = await feedbackFor(GOOD_PAYLOAD);
  assert.equal(r.status, 200);
  assert.deepEqual(r.payload.practiceWords, [
    { correct: "family", wrote: "famly" },
    { correct: "because", wrote: "becos" },
  ]);
  assert.equal(r.payload.spellingTip, "Say tricky words in syllables: fam-i-ly.");
});

test("practice words capped at 5, junk entries filtered", async () => {
  const many = {
    ...GOOD_PAYLOAD,
    practice_words: [
      { correct: "one", wrote: "wun" },
      { correct: "two", wrote: "too" },
      { correct: "three", wrote: "thre" },
      { correct: "four", wrote: "for" },
      { correct: "five", wrote: "fiv" },
      { correct: "six", wrote: "siks" },
      { correct: "", wrote: "bad" },
      { correct: 7, wrote: "seven" },
      "not-an-object",
    ],
  };
  const r = await feedbackFor(many);
  assert.equal(r.status, 200);
  assert.equal(r.payload.practiceWords.length, 5);
  assert.ok(r.payload.practiceWords.every((w) => w.correct && w.wrote));
});

test("missing practice fields default to empty, not an error", async () => {
  const bare = { ...GOOD_PAYLOAD };
  delete bare.practice_words;
  delete bare.spelling_tip;
  const r = await feedbackFor(bare);
  assert.equal(r.status, 200);
  assert.deepEqual(r.payload.practiceWords, []);
  assert.equal(r.payload.spellingTip, "");
});

test("word boost passes through", async () => {
  const r = await feedbackFor(GOOD_PAYLOAD);
  assert.equal(r.status, 200);
  assert.deepEqual(r.payload.wordBoost, {
    swaps: [{ from: "fast", to: ["speedy", "lightning-quick"] }],
    before: "The dog ran fast.",
    after: "The dog ran lightning-quick.",
  });
});

test("word boost junk filtered: caps, bad entries, missing -> null", async () => {
  const messy = {
    ...GOOD_PAYLOAD,
    word_boost: {
      swaps: [
        { from: "big", to: ["huge", "enormous", "gigantic", "massive", "towering"] },
        { from: "nice", to: ["lovely"] },
        { from: "good", to: ["great"] },
        { from: "bad", to: ["awful"] },
        { from: "", to: ["x"] },
        { from: "ok", to: [] },
        "junk",
      ],
      before: "It was big.",
      after: "It was enormous.",
    },
  };
  const r1 = await feedbackFor(messy);
  assert.equal(r1.status, 200);
  assert.equal(r1.payload.wordBoost.swaps.length, 3);
  assert.equal(r1.payload.wordBoost.swaps[0].to.length, 3);

  const bare = { ...GOOD_PAYLOAD };
  delete bare.word_boost;
  const r2 = await feedbackFor(bare);
  assert.equal(r2.status, 200);
  assert.equal(r2.payload.wordBoost, null);
});

test("upstream error -> 502 without leaking details", async () => {
  const failFetch = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: "rate limited" } }) });
  const r = await handleFeedback({ transcript: TEXT, yearLevel: 3 }, { fetchImpl: failFetch, env: ENV });
  assert.equal(r.status, 502);
  assert.doesNotMatch(r.payload.error, /429|rate/i);
});
