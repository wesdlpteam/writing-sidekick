import { test } from "node:test";
import assert from "node:assert/strict";
import { handleFeedback } from "../api/feedback.js";

const GOOD_PAYLOAD = {
  transcript: "The dog ran fast.\nIt was a sunny day.",
  stars: ["You used a capital letter to start 'The dog ran fast.'", "Your full stops are in the right places."],
  wish: "Try adding a describing word, like 'The brown dog ran fast.'",
  detail: {
    ideas: "Clear little scene.",
    structure: "Two complete sentences.",
    vocabulary: "'fast' works well.",
    spelling: "All words spelled correctly.",
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
  const r = await handleFeedback({ image: big, yearLevel: 3 }, { fetchImpl: mockFetch("{}"), env: ENV });
  assert.equal(r.status, 413);
});

test("rejects missing api key", async () => {
  const r = await handleFeedback({ image: IMG, yearLevel: 3 }, { fetchImpl: mockFetch("{}"), env: {} });
  assert.equal(r.status, 500);
});

test("happy path: prompt has year guide + rules, response validated", async () => {
  const capture = {};
  const r = await handleFeedback(
    { image: IMG, yearLevel: 3, genre: "narrative" },
    { fetchImpl: mockFetch(JSON.stringify(GOOD_PAYLOAD), { capture }), env: ENV },
  );
  assert.equal(r.status, 200);
  assert.equal(r.payload.transcript, GOOD_PAYLOAD.transcript);
  assert.equal(r.payload.stars.length, 2);
  assert.ok(r.payload.detail.spelling);
  const sys = capture.body.messages[0].content;
  assert.match(sys, /end of Year 3/);
  assert.match(sys, /NEVER use, repeat or guess/);
  assert.match(sys, /narrative/i);
  assert.equal(capture.body.model, "gpt-5.4-mini");
  const userParts = capture.body.messages[1].content;
  assert.ok(userParts.some((p) => p.type === "image_url"));
});

test("defaults to gpt-5.4-mini when no model configured", async () => {
  const capture = {};
  const r = await handleFeedback(
    { image: IMG, yearLevel: 3 },
    { fetchImpl: mockFetch(JSON.stringify(GOOD_PAYLOAD), { capture }), env: { OPENAI_API_KEY: "sk-test" } },
  );
  assert.equal(r.status, 200);
  assert.equal(capture.body.model, "gpt-5.4-mini");
});

test("parses fenced json from model", async () => {
  const fenced = "```json\n" + JSON.stringify(GOOD_PAYLOAD) + "\n```";
  const r = await handleFeedback({ image: IMG, yearLevel: 2 }, { fetchImpl: mockFetch(fenced), env: ENV });
  assert.equal(r.status, 200);
});

test("unparseable model output -> 502 child-safe error", async () => {
  const r = await handleFeedback({ image: IMG, yearLevel: 2 }, { fetchImpl: mockFetch("sorry no"), env: ENV });
  assert.equal(r.status, 502);
  assert.ok(r.payload.error.length > 10);
  assert.doesNotMatch(r.payload.error, /json|parse|model/i);
});

test("bad shape (missing wish) -> 502", async () => {
  const bad = JSON.stringify({ ...GOOD_PAYLOAD, wish: "" });
  const r = await handleFeedback({ image: IMG, yearLevel: 2 }, { fetchImpl: mockFetch(bad), env: ENV });
  assert.equal(r.status, 502);
});

test("regeneration path sends transcript, no image part", async () => {
  const capture = {};
  const r = await handleFeedback(
    { transcript: "my cat is fluffy", yearLevel: 4 },
    { fetchImpl: mockFetch(JSON.stringify(GOOD_PAYLOAD), { capture }), env: ENV },
  );
  assert.equal(r.status, 200);
  const userParts = capture.body.messages[1].content;
  assert.ok(!userParts.some((p) => p.type === "image_url"));
  assert.ok(userParts.some((p) => p.type === "text" && p.text.includes("my cat is fluffy")));
});

test("practice words pass through, prompt asks for them", async () => {
  const capture = {};
  const r = await handleFeedback(
    { image: IMG, yearLevel: 3 },
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
  const r = await handleFeedback({ image: IMG, yearLevel: 4 }, { fetchImpl: mockFetch(JSON.stringify(many)), env: ENV });
  assert.equal(r.status, 200);
  assert.equal(r.payload.practiceWords.length, 5);
  assert.ok(r.payload.practiceWords.every((w) => w.correct && w.wrote));
});

test("missing practice fields default to empty, not an error", async () => {
  const bare = { ...GOOD_PAYLOAD };
  delete bare.practice_words;
  delete bare.spelling_tip;
  const r = await handleFeedback({ image: IMG, yearLevel: 2 }, { fetchImpl: mockFetch(JSON.stringify(bare)), env: ENV });
  assert.equal(r.status, 200);
  assert.deepEqual(r.payload.practiceWords, []);
  assert.equal(r.payload.spellingTip, "");
});

test("word boost passes through, prompt asks for it and demands specificity", async () => {
  const capture = {};
  const r = await handleFeedback(
    { image: IMG, yearLevel: 3 },
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
  const r1 = await handleFeedback({ image: IMG, yearLevel: 4 }, { fetchImpl: mockFetch(JSON.stringify(messy)), env: ENV });
  assert.equal(r1.status, 200);
  assert.equal(r1.payload.wordBoost.swaps.length, 3);
  assert.equal(r1.payload.wordBoost.swaps[0].to.length, 3);

  const bare = { ...GOOD_PAYLOAD };
  delete bare.word_boost;
  const r2 = await handleFeedback({ image: IMG, yearLevel: 2 }, { fetchImpl: mockFetch(JSON.stringify(bare)), env: ENV });
  assert.equal(r2.status, 200);
  assert.equal(r2.payload.wordBoost, null);
});

test("upstream error -> 502 without leaking details", async () => {
  const failFetch = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: "rate limited" } }) });
  const r = await handleFeedback({ image: IMG, yearLevel: 3 }, { fetchImpl: failFetch, env: ENV });
  assert.equal(r.status, 502);
  assert.doesNotMatch(r.payload.error, /429|rate/i);
});
