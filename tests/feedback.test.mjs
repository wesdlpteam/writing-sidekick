import { test } from "node:test";
import assert from "node:assert/strict";
import { handleFeedback } from "../api/feedback.js";

const GOOD_PAYLOAD = {
  stars: [
    { quote: "The dog ran fast.", skill: "You started with a capital letter and ended with a full stop, so it reads as one clear sentence." },
    { quote: "It was a sunny day.", skill: "You set the scene with the weather, which helps your reader picture it." },
  ],
  power_ups: [
    {
      skill: "Show how fast with a strong verb",
      why: "'ran fast' tells us; a strong verb shows us.",
      your_line: "The dog ran fast.",
      try_this: "The dog zoomed across the grass.",
      now_you: "Find 'ran fast' and swap it for one strong verb.",
    },
    {
      skill: "Add what you could hear",
      why: "Your sunny day has no sounds yet.",
      your_line: "It was a sunny day.",
      try_this: "It was a sunny day and the birds were chirping.",
      now_you: "Add one sound to your sunny day sentence.",
    },
  ],
  detail: {
    ideas: "Clear little scene. Try adding what happened next.",
    structure: "Two complete sentences. Join them with 'and'.",
    vocabulary: "'fast' works. 'zoomed' would be stronger.",
    spelling: "All words spelled correctly. Full stops in place.",
  },
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
  assert.doesNotMatch(sys, /stars|power-up/i, "the transcription call is not asked for feedback");
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

test("feedback path: prompt has year guide + rules + skill bank, response validated, transcript echoed", async () => {
  const capture = {};
  const r = await handleFeedback(
    { transcript: TEXT, yearLevel: 3, genre: "narrative" },
    { fetchImpl: mockFetch(JSON.stringify(GOOD_PAYLOAD), { capture }), env: ENV },
  );
  assert.equal(r.status, 200);
  assert.equal(r.payload.transcript, TEXT);
  assert.equal(r.payload.stars.length, 2);
  assert.equal(r.payload.stars[0].quote, "The dog ran fast.");
  assert.equal(r.payload.powerUps.length, 2);
  assert.deepEqual(r.payload.powerUps[0], {
    skill: "Show how fast with a strong verb",
    why: "'ran fast' tells us; a strong verb shows us.",
    yourLine: "The dog ran fast.",
    tryThis: "The dog zoomed across the grass.",
    nowYou: "Find 'ran fast' and swap it for one strong verb.",
  });
  assert.ok(r.payload.detail.spelling);
  const sys = capture.body.messages[0].content;
  assert.match(sys, /end of Year 3/);
  assert.match(sys, /NEVER use, repeat or guess/);
  assert.match(sys, /narrative/i);
  assert.match(sys, /where to next/i, "feedback principles are in the prompt");
  assert.match(sys, /sensory details/i);
  assert.match(sys, /sentence openers/i);
  assert.match(sys, /show, don't tell/i);
  assert.match(sys, /generic praise .* banned|banned/i);
  assert.match(sys, /power_ups/);
  assert.match(sys, /now_you/);
  assert.match(sys, /never use a power-up for spelling/i);
  assert.match(sys, /different line/i);
  assert.equal(capture.body.model, "gpt-5.4-mini", "OPENAI_MODEL still picks the feedback model");
  const userParts = capture.body.messages[1].content;
  assert.ok(!userParts.some((p) => p.type === "image_url"));
  assert.ok(userParts.some((p) => p.type === "text" && p.text.includes(TEXT)));
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

test("no power-ups at all -> 502 (feedback without next steps is useless)", async () => {
  const bad = JSON.stringify({ ...GOOD_PAYLOAD, power_ups: [] });
  const r = await handleFeedback({ transcript: TEXT, yearLevel: 2 }, { fetchImpl: mockFetch(bad), env: ENV });
  assert.equal(r.status, 502);
});

test("power-ups: junk entries dropped, capped at three, missing now_you tolerated", async () => {
  const messy = {
    ...GOOD_PAYLOAD,
    power_ups: [
      ...GOOD_PAYLOAD.power_ups,
      { skill: "Third", why: "Because.", your_line: "x", try_this: "y" },
      { skill: "Fourth", why: "Because.", your_line: "x", try_this: "y", now_you: "z" },
      { skill: "", why: "no skill", try_this: "y" },
      "junk",
    ],
  };
  const r = await handleFeedback({ transcript: TEXT, yearLevel: 4 }, { fetchImpl: mockFetch(JSON.stringify(messy)), env: ENV });
  assert.equal(r.status, 200);
  assert.equal(r.payload.powerUps.length, 3);
  assert.equal(r.payload.powerUps[2].skill, "Third");
  assert.equal(r.payload.powerUps[2].nowYou, "");
});

test("stars: junk dropped, capped at three, none at all -> 502", async () => {
  const messy = { ...GOOD_PAYLOAD, stars: [...GOOD_PAYLOAD.stars, { quote: "a", skill: "b" }, { quote: "c", skill: "d" }, { quote: "no skill" }, 7] };
  const r1 = await handleFeedback({ transcript: TEXT, yearLevel: 4 }, { fetchImpl: mockFetch(JSON.stringify(messy)), env: ENV });
  assert.equal(r1.status, 200);
  assert.equal(r1.payload.stars.length, 3);

  const none = { ...GOOD_PAYLOAD, stars: [] };
  const r2 = await handleFeedback({ transcript: TEXT, yearLevel: 4 }, { fetchImpl: mockFetch(JSON.stringify(none)), env: ENV });
  assert.equal(r2.status, 502);
});

test("bad shape (missing detail) -> 502", async () => {
  const bad = JSON.stringify({ ...GOOD_PAYLOAD, detail: { ideas: "x" } });
  const r = await handleFeedback({ transcript: TEXT, yearLevel: 2 }, { fetchImpl: mockFetch(bad), env: ENV });
  assert.equal(r.status, 502);
});

test("practice words pass through, prompt asks for them", async () => {
  const capture = {};
  const r = await handleFeedback(
    { transcript: TEXT, yearLevel: 3 },
    { fetchImpl: mockFetch(JSON.stringify(GOOD_PAYLOAD), { capture }), env: ENV },
  );
  assert.equal(r.status, 200);
  assert.deepEqual(r.payload.practiceWords, [
    { correct: "family", wrote: "famly" },
    { correct: "because", wrote: "becos" },
  ]);
  assert.equal(r.payload.spellingTip, "Say tricky words in syllables: fam-i-ly.");
  assert.match(capture.body.messages[0].content, /practice_words/);
  assert.match(capture.body.messages[0].content, /spelling_tip/);
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
  const r = await handleFeedback({ transcript: TEXT, yearLevel: 4 }, { fetchImpl: mockFetch(JSON.stringify(many)), env: ENV });
  assert.equal(r.status, 200);
  assert.equal(r.payload.practiceWords.length, 5);
  assert.ok(r.payload.practiceWords.every((w) => w.correct && w.wrote));
});

test("missing practice fields default to empty, not an error", async () => {
  const bare = { ...GOOD_PAYLOAD };
  delete bare.practice_words;
  delete bare.spelling_tip;
  const r = await handleFeedback({ transcript: TEXT, yearLevel: 2 }, { fetchImpl: mockFetch(JSON.stringify(bare)), env: ENV });
  assert.equal(r.status, 200);
  assert.deepEqual(r.payload.practiceWords, []);
  assert.equal(r.payload.spellingTip, "");
});

test("word boost passes through, prompt asks for it and demands specificity", async () => {
  const capture = {};
  const r = await handleFeedback(
    { transcript: TEXT, yearLevel: 3 },
    { fetchImpl: mockFetch(JSON.stringify(GOOD_PAYLOAD), { capture }), env: ENV },
  );
  assert.equal(r.status, 200);
  assert.deepEqual(r.payload.wordBoost, {
    swaps: [{ from: "fast", to: ["speedy", "lightning-quick"] }],
    before: "The dog ran fast.",
    after: "The dog ran lightning-quick.",
  });
  assert.match(capture.body.messages[0].content, /word_boost/);
  assert.match(capture.body.messages[0].content, /exact sentence/i);
  assert.match(capture.body.messages[0].content, /not just a one-word swap/i);
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
  const r1 = await handleFeedback({ transcript: TEXT, yearLevel: 4 }, { fetchImpl: mockFetch(JSON.stringify(messy)), env: ENV });
  assert.equal(r1.status, 200);
  assert.equal(r1.payload.wordBoost.swaps.length, 3);
  assert.equal(r1.payload.wordBoost.swaps[0].to.length, 3);

  const bare = { ...GOOD_PAYLOAD };
  delete bare.word_boost;
  const r2 = await handleFeedback({ transcript: TEXT, yearLevel: 2 }, { fetchImpl: mockFetch(JSON.stringify(bare)), env: ENV });
  assert.equal(r2.status, 200);
  assert.equal(r2.payload.wordBoost, null);
});

test("upstream error -> 502 without leaking details", async () => {
  const failFetch = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: "rate limited" } }) });
  const r = await handleFeedback({ transcript: TEXT, yearLevel: 3 }, { fetchImpl: failFetch, env: ENV });
  assert.equal(r.status, 502);
  assert.doesNotMatch(r.payload.error, /429|rate/i);
});
