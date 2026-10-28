import { timingSafeEqual } from "node:crypto";

// Trial survey (docs/superpowers/specs/2026-10-28-trial-survey-design.md): three one-tap answers
// from trial classes, kept as one anonymous row (day, year level, answers) in Neon Postgres, the
// same service Springboard uses. Neon is called over its SQL-over-HTTP endpoint with plain fetch,
// so the app keeps zero npm dependencies. Table: db/survey.sql.

const QUESTIONS = ["understood", "liked", "stronger"];
const ANSWERS = new Set(["yes", "bit", "no"]);
const TIMEOUT_MS = 8_000;
const SAVE_LIMIT = 100; // saves per minute per server instance: several whole classes finishing at once
const QUIET_FAIL = { status: 503, payload: { error: "Survey not saved." } };

// Only a year level and the three answers survive; anything else in the body is dropped.
export function cleanAnswers(body) {
  const yearLevel = body?.yearLevel;
  if (!Number.isInteger(yearLevel) || yearLevel < 1 || yearLevel > 6) return null;
  const row = { yearLevel };
  for (const q of QUESTIONS) {
    const a = body[q] ?? null;
    if (a !== null && !ANSWERS.has(a)) return null;
    row[q] = a;
  }
  return QUESTIONS.some((q) => row[q]) ? row : null;
}

// Neon's own driver swaps the host's first label for "api.".
export function neonEndpoint(databaseUrl) {
  return `https://${new URL(databaseUrl).hostname.replace(/^[^.]+\./, "api.")}/sql`;
}

// Rows come back as arrays of text (array mode, raw text output).
async function neonQuery(env, fetchImpl, query, params = []) {
  const response = await fetchImpl(neonEndpoint(env.DATABASE_URL), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Neon-Connection-String": env.DATABASE_URL,
      "Neon-Raw-Text-Output": "true",
      "Neon-Array-Mode": "true",
    },
    body: JSON.stringify({ query, params }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`neon ${response.status}`);
  return (await response.json()).rows || [];
}

function passwordMatches(given, expected) {
  if (!expected || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

let windowStart = 0;
let saves = 0;
function tooMany(now) {
  if (now < windowStart || now - windowStart > 60_000) {
    windowStart = now;
    saves = 0;
  }
  return ++saves > SAVE_LIMIT;
}

const zero = () => ({ yes: 0, bit: 0, no: 0 });

async function readStats(env, fetchImpl) {
  const [answers, children] = await Promise.all([
    neonQuery(env, fetchImpl, `SELECT year_level, q, a, count(*) FROM (
      SELECT year_level, 'understood' AS q, understood AS a FROM survey
      UNION ALL SELECT year_level, 'liked', liked FROM survey
      UNION ALL SELECT year_level, 'stronger', stronger FROM survey
    ) t WHERE a IS NOT NULL GROUP BY year_level, q, a`),
    neonQuery(env, fetchImpl, "SELECT year_level, count(*) FROM survey GROUP BY year_level ORDER BY year_level"),
  ]);
  const years = {};
  let total = 0;
  for (const [year, n] of children) {
    years[year] = { children: Number(n), understood: zero(), liked: zero(), stronger: zero() };
    total += Number(n);
  }
  for (const [year, q, a, n] of answers) {
    if (years[year]?.[q] && ANSWERS.has(a)) years[year][q][a] = Number(n);
  }
  return { years, total };
}

export async function handleSurvey(body, { env, fetchImpl, now = Date.now() }) {
  if (body?.stats === true) {
    if (!passwordMatches(body.password, env?.ADMIN_PASSWORD)) {
      return { status: 401, payload: { error: "That password didn't work." } };
    }
    if (!env.DATABASE_URL) return QUIET_FAIL;
    try {
      return { status: 200, payload: await readStats(env, fetchImpl) };
    } catch (error) {
      console.warn(`[survey] stats failed: ${error.message}`);
      return QUIET_FAIL;
    }
  }
  const row = cleanAnswers(body);
  if (!row) return { status: 400, payload: { error: "Survey answers not understood." } };
  if (!env?.DATABASE_URL) return QUIET_FAIL;
  if (tooMany(now)) return { status: 429, payload: { error: "Too many answers at once." } };
  try {
    await neonQuery(env, fetchImpl, "INSERT INTO survey (year_level, understood, liked, stronger) VALUES ($1, $2, $3, $4)",
      [row.yearLevel, row.understood, row.liked, row.stronger]);
    return { status: 200, payload: { ok: true } };
  } catch (error) {
    console.warn(`[survey] save failed: ${error.message}`);
    return QUIET_FAIL;
  }
}
