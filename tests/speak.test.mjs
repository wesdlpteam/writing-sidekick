import { test } from "node:test";
import assert from "node:assert/strict";
import handler, { handleSpeak } from "../api/speak.js";

const ENV = { OPENAI_API_KEY: "sk-test" };
const AUDIO = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0]); // looks like an mp3 header

function mockFetch({ capture, ok = true, status = 200, bytes = AUDIO } = {}) {
  return async (url, options) => {
    if (capture) {
      capture.url = url;
      capture.body = JSON.parse(options.body);
      capture.headers = options.headers;
    }
    return { ok, status, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), json: async () => ({ error: { message: "nope" } }) };
  };
}

test("empty or missing text -> 400", async () => {
  for (const body of [{}, { text: "" }, { text: "   " }, { text: 7 }, null]) {
    const r = await handleSpeak(body, { fetchImpl: mockFetch(), env: ENV });
    assert.equal(r.status, 400, JSON.stringify(body));
  }
});

test("too much text -> 400, no key -> 500", async () => {
  const long = await handleSpeak({ text: "a".repeat(1501) }, { fetchImpl: mockFetch(), env: ENV });
  assert.equal(long.status, 400);
  const noKey = await handleSpeak({ text: "Hello" }, { fetchImpl: mockFetch(), env: {} });
  assert.equal(noKey.status, 500);
  assert.match(noKey.payload.error, /teacher/i);
});

test("speech request uses the marin voice with the sincere style and returns mp3 bytes", async () => {
  const capture = {};
  const r = await handleSpeak(
    { text: "Power-up 1:   Start with a W word. ✅ Your line: 'The dog ran fast.'" },
    { fetchImpl: mockFetch({ capture }), env: ENV },
  );
  assert.equal(r.status, 200);
  assert.equal(r.contentType, "audio/mpeg");
  assert.deepEqual([...r.audio], [...AUDIO]);
  assert.equal(capture.url, "https://api.openai.com/v1/audio/speech");
  assert.equal(capture.headers.Authorization, "Bearer sk-test");
  assert.equal(capture.body.model, "gpt-4o-mini-tts");
  assert.equal(capture.body.voice, "marin");
  assert.equal(capture.body.response_format, "mp3");
  assert.equal(capture.body.input, "Power-up 1: Start with a W word. Your line: 'The dog ran fast.'", "spaces collapsed, emoji dropped");
  assert.match(capture.body.instructions, /sincere/i);
  assert.match(capture.body.instructions, /child/i);
  assert.match(capture.body.instructions, /Australian/);
});

test("OPENAI_TTS_VOICE and OPENAI_TTS_MODEL override the defaults", async () => {
  const capture = {};
  await handleSpeak({ text: "Hi" }, { fetchImpl: mockFetch({ capture }), env: { ...ENV, OPENAI_TTS_VOICE: "cedar", OPENAI_TTS_MODEL: "tts-1" } });
  assert.equal(capture.body.voice, "cedar");
  assert.equal(capture.body.model, "tts-1");
});

test("upstream failure or empty audio -> 502 child-safe error", async () => {
  const bad = await handleSpeak({ text: "Hi" }, { fetchImpl: mockFetch({ ok: false, status: 429 }), env: ENV });
  assert.equal(bad.status, 502);
  assert.doesNotMatch(bad.payload.error, /429|rate|json|model/i);
  const empty = await handleSpeak({ text: "Hi" }, { fetchImpl: mockFetch({ bytes: new Uint8Array(0) }), env: ENV });
  assert.equal(empty.status, 502);
  const thrown = await handleSpeak({ text: "Hi" }, { fetchImpl: async () => { throw new Error("offline"); }, env: ENV });
  assert.equal(thrown.status, 502);
});

function fakeRes() {
  const res = { headers: {}, statusCode: 200, body: undefined, ended: false };
  res.setHeader = (name, value) => { res.headers[name.toLowerCase()] = value; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; res.ended = true; return res; };
  res.send = (body) => { res.body = body; res.ended = true; return res; };
  res.end = () => { res.ended = true; return res; };
  return res;
}

test("handler: preflight from the Pages site is allowed, other origins get nothing", async () => {
  const ok = fakeRes();
  await handler({ method: "OPTIONS", headers: { origin: "https://wesdlpteam.github.io" } }, ok);
  assert.equal(ok.statusCode, 204);
  assert.equal(ok.headers["access-control-allow-origin"], "https://wesdlpteam.github.io");
  const other = fakeRes();
  await handler({ method: "OPTIONS", headers: { origin: "https://evil.example" } }, other);
  assert.equal(other.headers["access-control-allow-origin"], undefined);
});

test("handler: bad request answers json with no-store and the allow-origin header", async () => {
  const res = fakeRes();
  await handler({ method: "POST", headers: { origin: "https://wesdlpteam.github.io" }, body: { text: "" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.headers["access-control-allow-origin"], "https://wesdlpteam.github.io");
  assert.match(res.body.error, /nothing to read/i);
});
