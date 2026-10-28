import test from "node:test";
import assert from "node:assert/strict";
import { cleanAnswers, handleSurvey, neonEndpoint } from "../api/_survey.js";

const DB = "postgresql://user:secret@ep-cool-name-123.ap-southeast-2.aws.neon.tech/neondb?sslmode=require";
const env = (extra = {}) => ({ DATABASE_URL: DB, ADMIN_PASSWORD: "letmein", ...extra });

// A fake Neon /sql endpoint: keeps each request and answers with the given rows (array mode).
function fakeNeon(answer = () => ({ rows: [] })) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, headers: options.headers, body });
    return { ok: true, status: 200, json: async () => answer(body) };
  };
  return { calls, fetchImpl };
}

test("cleanAnswers keeps only a year level and the three answers", () => {
  assert.deepEqual(cleanAnswers({ yearLevel: 2, understood: "yes", liked: "bit", stronger: null, name: "Sam" }),
    { yearLevel: 2, understood: "yes", liked: "bit", stronger: null });
  assert.deepEqual(cleanAnswers({ yearLevel: 6, liked: "no" }), { yearLevel: 6, understood: null, liked: "no", stronger: null });
  for (const yearLevel of [0, 7, "2x", 2.5, undefined]) assert.equal(cleanAnswers({ yearLevel, liked: "yes" }), null, `year ${yearLevel}`);
  assert.equal(cleanAnswers({ yearLevel: 3, liked: "maybe" }), null, "only yes, bit or no");
  assert.equal(cleanAnswers({ yearLevel: 3 }), null, "nothing answered");
});

test("the Neon endpoint swaps the host's first label for api., like Neon's own driver", () => {
  assert.equal(neonEndpoint(DB), "https://api.ap-southeast-2.aws.neon.tech/sql");
});

test("saving sends one INSERT of only the year level and answers", async () => {
  const neon = fakeNeon(() => ({ rows: [], rowCount: 1 }));
  const r = await handleSurvey({ yearLevel: 2, understood: "yes", liked: "bit", stronger: null, name: "Sam" }, { env: env(), fetchImpl: neon.fetchImpl });
  assert.equal(r.status, 200);
  assert.deepEqual(r.payload, { ok: true });
  assert.equal(neon.calls.length, 1);
  assert.equal(neon.calls[0].url, neonEndpoint(DB));
  assert.equal(neon.calls[0].headers["Neon-Connection-String"], DB);
  assert.match(neon.calls[0].body.query, /INSERT INTO survey \(year_level, understood, liked, stronger\) VALUES \(\$1, \$2, \$3, \$4\)/);
  assert.deepEqual(neon.calls[0].body.params, [2, "yes", "bit", null]);
});

test("saving fails quietly: bad body 400, no database 503, database down 503", async () => {
  const neon = fakeNeon();
  assert.equal((await handleSurvey({ yearLevel: 9, liked: "yes" }, { env: env(), fetchImpl: neon.fetchImpl })).status, 400);
  assert.equal((await handleSurvey({ yearLevel: 2, liked: "yes" }, { env: env({ DATABASE_URL: "" }), fetchImpl: neon.fetchImpl })).status, 503);
  assert.equal(neon.calls.length, 0);
  const down = async () => { throw new Error("offline"); };
  assert.equal((await handleSurvey({ yearLevel: 2, liked: "yes" }, { env: env(), fetchImpl: down })).status, 503);
  const refused = async () => ({ ok: false, status: 500, json: async () => ({ message: "boom" }) });
  assert.equal((await handleSurvey({ yearLevel: 2, liked: "yes" }, { env: env(), fetchImpl: refused })).status, 503);
});

test("stats need the admin password, and are refused when none is set", async () => {
  const neon = fakeNeon();
  assert.equal((await handleSurvey({ stats: true, password: "letmein" }, { env: env({ ADMIN_PASSWORD: "" }), fetchImpl: neon.fetchImpl })).status, 401);
  assert.equal((await handleSurvey({ stats: true, password: "wrong" }, { env: env(), fetchImpl: neon.fetchImpl })).status, 401);
  assert.equal((await handleSurvey({ stats: true }, { env: env(), fetchImpl: neon.fetchImpl })).status, 401);
  assert.equal(neon.calls.length, 0, "no query without the right password");
});

test("stats come back as yes, a bit and no counts per question per year", async () => {
  const neon = fakeNeon((body) => /GROUP BY year_level, q, a/.test(body.query)
    ? { rows: [["1", "understood", "yes", "3"], ["1", "understood", "no", "1"], ["1", "liked", "bit", "2"], ["4", "stronger", "yes", "5"]] }
    : { rows: [["1", "4"], ["4", "5"]] });
  const r = await handleSurvey({ stats: true, password: "letmein" }, { env: env(), fetchImpl: neon.fetchImpl });
  assert.equal(r.status, 200);
  assert.deepEqual(r.payload.years["1"], {
    children: 4,
    understood: { yes: 3, bit: 0, no: 1 },
    liked: { yes: 0, bit: 2, no: 0 },
    stronger: { yes: 0, bit: 0, no: 0 },
  });
  assert.equal(r.payload.years["4"].stronger.yes, 5);
  assert.equal(r.payload.total, 9);
  assert.deepEqual(Object.keys(r.payload.years), ["1", "4"]);
});
