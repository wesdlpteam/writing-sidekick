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

test("same-origin requests get no CORS headers and still work", async () => {
  const res = fakeRes();
  await handler({ method: "POST", headers: {}, body: { yearLevel: 9 } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.headers["access-control-allow-origin"], undefined);
});

test("POST from the Pages site carries the allow-origin header", async () => {
  const res = fakeRes();
  await handler({ method: "POST", headers: { origin: PAGES_ORIGIN }, body: { yearLevel: 9 } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.headers["access-control-allow-origin"], PAGES_ORIGIN);
  assert.equal(res.headers["cache-control"], "no-store");
});
