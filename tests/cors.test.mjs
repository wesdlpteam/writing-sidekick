import { test } from "node:test";
import assert from "node:assert/strict";
import handler from "../api/feedback.js";

const PAGES_ORIGIN = "https://wesdlpteam.github.io";

function fakeRes() {
  const res = { headers: {}, statusCode: 200, body: undefined, ended: false };
  res.setHeader = (name, value) => {
    res.headers[name.toLowerCase()] = value;
  };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    res.ended = true;
    return res;
  };
  res.end = () => {
    res.ended = true;
    return res;
  };
  return res;
}

test("preflight from the GitHub Pages site is allowed", async () => {
  const res = fakeRes();
  await handler({ method: "OPTIONS", headers: { origin: PAGES_ORIGIN } }, res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers["access-control-allow-origin"], PAGES_ORIGIN);
  assert.match(res.headers["access-control-allow-methods"], /POST/);
  assert.match(res.headers["access-control-allow-headers"], /Content-Type/);
  assert.ok(res.ended);
});

test("unknown origins get no CORS headers", async () => {
  const res = fakeRes();
  await handler({ method: "OPTIONS", headers: { origin: "https://evil.example" } }, res);
  assert.equal(res.headers["access-control-allow-origin"], undefined);
});

const JSON_HEADERS = { "content-type": "application/json" };

// Requests that the guard refuses must never reach the AI provider.
function withFetchTrap(run) {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("provider must not be called");
  };
  return run()
    .then(() => calls)
    .finally(() => {
      globalThis.fetch = real;
    });
}

test("a POST with no Origin at all is refused before validation and never reaches the provider", async () => {
  const res = fakeRes();
  const calls = await withFetchTrap(() => handler({ method: "POST", headers: { ...JSON_HEADERS }, body: { image: "data:image/jpeg;base64,/9j/AAAA", yearLevel: 3 } }, res));
  assert.equal(res.statusCode, 403);
  assert.equal(calls, 0);
  assert.doesNotMatch(res.body.error, /origin|cors|header/i, "no hints for tuning requests");
});

test("a POST from an unapproved origin is refused, not just left without CORS headers", async () => {
  const res = fakeRes();
  const calls = await withFetchTrap(() => handler({ method: "POST", headers: { origin: "https://evil.example", ...JSON_HEADERS }, body: { yearLevel: 3, transcript: "Hi" } }, res));
  assert.equal(res.statusCode, 403);
  assert.equal(res.headers["access-control-allow-origin"], undefined);
  assert.equal(calls, 0);
});

test("the Vercel site itself and the Pages site are both allowed; extra origins come from ALLOWED_ORIGINS", async () => {
  for (const origin of ["https://writing-sidekick.vercel.app", PAGES_ORIGIN]) {
    const res = fakeRes();
    await handler({ method: "POST", headers: { origin, ...JSON_HEADERS }, body: { yearLevel: 9 } }, res);
    assert.equal(res.statusCode, 400, origin);
  }
  process.env.ALLOWED_ORIGINS = "https://preview.example, https://other.example";
  try {
    const res = fakeRes();
    await handler({ method: "POST", headers: { origin: "https://other.example", ...JSON_HEADERS }, body: { yearLevel: 9 } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.headers["access-control-allow-origin"], "https://other.example");
  } finally {
    delete process.env.ALLOWED_ORIGINS;
  }
});

test("POST from the Pages site carries the allow-origin header", async () => {
  const res = fakeRes();
  await handler({ method: "POST", headers: { origin: PAGES_ORIGIN, ...JSON_HEADERS }, body: { yearLevel: 9 } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.headers["access-control-allow-origin"], PAGES_ORIGIN);
  assert.equal(res.headers["cache-control"], "no-store");
});

test("a POST that is not JSON is refused", async () => {
  const res = fakeRes();
  await handler({ method: "POST", headers: { origin: PAGES_ORIGIN, "content-type": "text/plain" }, body: "hello" }, res);
  assert.equal(res.statusCode, 415);
});

test("APP_PAUSED switches every call off with a child-safe message", async () => {
  process.env.APP_PAUSED = "1";
  try {
    const res = fakeRes();
    const calls = await withFetchTrap(() => handler({ method: "POST", headers: { origin: PAGES_ORIGIN, ...JSON_HEADERS }, body: { yearLevel: 3, transcript: "Hi" } }, res));
    assert.equal(res.statusCode, 503);
    assert.equal(calls, 0);
    assert.match(res.body.error, /teacher/i);
    assert.doesNotMatch(res.body.error, /paused|env|switch/i);
  } finally {
    delete process.env.APP_PAUSED;
  }
});
