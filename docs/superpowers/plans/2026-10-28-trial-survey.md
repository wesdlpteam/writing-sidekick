# Trial Survey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trial-class students answer three one-tap questions on "Mission complete"; answers are counted by year level in a Neon table and shown on a password page.

**Architecture:** Copies Springboard: a Vercel function writes one anonymous row per child to Neon Postgres and serves aggregate counts to a password-protected `stats.html`. No new npm dependency: Neon is called through its SQL-over-HTTP endpoint with plain `fetch` (this repo has zero dependencies). The survey only appears when the app was opened with `?trial=1`.

**Tech Stack:** Vanilla JS modules, Vercel serverless (Node), Neon Postgres over HTTP, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-28-trial-survey-design.md`

## Global Constraints

- Questions, verbatim: "Did you understand your feedback?", "Did you like using Sidekick?", "Did Sidekick help make your writing stronger?"
- Buttons, verbatim: 😀 Yes · 😐 A bit · 🙁 No. Stored values: `yes`, `bit`, `no`, or null.
- Row kept: day (date only), year level 1-6, three answers. Nothing else (no time, IP, device, class, writing).
- Shown only when the page URL has `trial=1`. Asked once per session (not again after "Snap my writing again"); a new session starts after "Finish and clear".
- Sent when the third answer is tapped, or on "Finish and clear" if at least one is answered. Never blocks or delays finishing.
- Years 1-3 get a Listen button reading the questions (existing `mountListen`).
- Stats page needs `ADMIN_PASSWORD` (Vercel env). Secrets only in Vercel env, never in the public repo.
- Every function goes through `handlePreamble` (api/_cors.js). Bump `?v=` cache tags for changed CSS/JS.
- Child copy: plain, no em dashes, humanizer-clean.

## Review Focus

1. A child taps all three then taps one again: only ONE row is ever sent (the first complete set); later changes are ignored.
2. Network or database down: the card still says thank you and finishing works; no error shown to the child.
3. Forged request (year 9, answer "maybe", extra fields like a name): rejected 400 or extra fields dropped, never stored.
4. Wrong or missing admin password on stats: 401, no counts leaked; `ADMIN_PASSWORD` unset means stats are always refused.
5. `DATABASE_URL` missing: save answers 503 quietly, app unaffected.

---

### Task 1: Survey function (save + stats)

**Files:**
- Create: `api/_survey.js` (validation, Neon HTTP call, queries)
- Create: `api/survey.js` (Vercel handler)
- Create: `db/survey.sql` (table)
- Modify: `dev-server.mjs` (route `/api/survey`; `--mock` answers `{ ok: true }` and canned stats)
- Test: `tests/survey.test.mjs`

**Interfaces:**
- Produces: `POST /api/survey` with `{ yearLevel, understood, liked, stronger }` -> `{ ok: true }`; with `{ stats: true, password }` -> `{ years: { "1": { understood: { yes, bit, no }, liked: {...}, stronger: {...}, children }, ... }, total }`.
- Produces: `handleSurvey(body, { env, fetchImpl, now? })` -> `{ status, payload }`; `cleanAnswers(body)` -> `{ yearLevel, understood, liked, stronger } | null`; `neonQuery(env, fetchImpl, query, params)` -> rows.

Table (`db/survey.sql`):
```sql
CREATE TABLE IF NOT EXISTS survey (
  id SERIAL PRIMARY KEY,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  year_level SMALLINT NOT NULL CHECK (year_level BETWEEN 1 AND 6),
  understood TEXT CHECK (understood IN ('yes','bit','no')),
  liked TEXT CHECK (liked IN ('yes','bit','no')),
  stronger TEXT CHECK (stronger IN ('yes','bit','no'))
);
```

- [ ] **Step 1: Write failing tests** in `tests/survey.test.mjs`:
  - `cleanAnswers` accepts `{yearLevel:2, understood:'yes', liked:'bit', stronger:null}`; rejects yearLevel 0/7/"2x", answer `'maybe'`, all-three-null; drops unknown fields (`name`).
  - save with fake fetch: one call to `https://<host>/sql`, header `Neon-Connection-String` = DATABASE_URL, body `{query, params}` with params `[2,'yes','bit',null]` and an INSERT that names only `year_level, understood, liked, stronger`.
  - save without `DATABASE_URL` -> 503; Neon fetch throws -> 503; bad body -> 400.
  - stats: no `ADMIN_PASSWORD` env -> 401; wrong password -> 401 and fetch never called; right password -> grouped counts shape above from fake rows `[{year_level:1,question:'understood',answer:'yes',n:3}, ...]` plus `children` per year.
- [ ] **Step 2:** `node --test tests/survey.test.mjs` -> FAIL (module missing).
- [ ] **Step 3: Implement.** Host comes from `new URL(DATABASE_URL).hostname`. Compare password with `crypto.timingSafeEqual` on equal-length buffers. Stats query: one `SELECT year_level, q, a, count(*)` over a `UNION ALL` of the three columns, plus `SELECT year_level, count(*) FROM survey GROUP BY year_level`. Simple in-memory rate limit: 20 saves per minute per instance. Handler mirrors `api/speak.js` (handlePreamble, then `res.status().json()`).
- [ ] **Step 4:** `npm test` -> all pass.
- [ ] **Step 5:** Commit `survey: anonymous trial answers to Neon + password stats`.

### Task 2: Survey card in the app

**Files:**
- Create: `js/survey.js` (pure state helpers)
- Modify: `index.html` (card markup inside the Mission complete slide; cache tags), `js/app.js` (render, taps, send, reset on finish), `js/api.js` (`sendSurvey`), `css/app.css` (card)
- Test: `tests/survey-client.test.mjs`

**Interfaces:**
- Consumes: `POST /api/survey` from Task 1.
- Produces: `SURVEY_QUESTIONS` (array of `{ key: 'understood'|'liked'|'stronger', text }`), `SURVEY_CHOICES` (`[{value:'yes',emoji:'😀',label:'Yes'},{value:'bit',emoji:'😐',label:'A bit'},{value:'no',emoji:'🙁',label:'No'}]`), `isTrial(search: string) -> boolean`, `surveyPayload(answers, yearLevel) -> object | null` (null when nothing answered), `isComplete(answers) -> boolean`; `sendSurvey(payload) -> Promise<void>` in js/api.js that never throws.

- [ ] **Step 1: Failing tests:** `isTrial('?trial=1')` true, `''`/`'?trial=0'` false; `surveyPayload({}, 3)` null; `surveyPayload({liked:'yes'}, 3)` -> `{yearLevel:3, understood:null, liked:'yes', stronger:null}`; `isComplete` only with all three; question texts equal the Global Constraints copy.
- [ ] **Step 2:** run -> FAIL.
- [ ] **Step 3: Implement.** `state.survey = { answers: {}, sent: false }`, reset in the same place Finish and clear resets state. Card hidden unless trial. Each choice is a 44px+ button with `aria-pressed`; group per question with a visible question label. On the third answer: send once, set `sent`, show "Thank you!". `.btn-finish` handler sends the partial payload first if not sent (fire and forget, no await before clearing). Round 2 does not re-show the card once `sent`. Listen button for Years 1-3 reads the three questions via `mountListen`. Card style follows `.job-check` / mission card, Neo City theme; invoke impeccable for the card.
- [ ] **Step 4:** `npm test` pass; browser check with mock server at iPad 834x1194 and phone 390x844: card hidden without `?trial=1`, shown with it, three taps -> one `/api/survey` request (check network), Finish works; screenshot.
- [ ] **Step 5:** Commit `survey: trial card on Mission complete`.

### Task 3: Stats page

**Files:**
- Create: `stats.html` (plain JS, own small inline style using app tokens)

**Interfaces:**
- Consumes: stats response from Task 1.

- [ ] **Step 1:** Page: password box, "Show results" button posts `{stats:true,password}` to `API_BASE/api/survey` (same API_BASE rule as js/api.js). Per year level: children count and, for each question, Yes / A bit / No counts with a simple bar; a "Download for Excel" button builds a CSV (`year,question,yes,a_bit,no`). Wrong password shows "That password didn't work." Password kept in memory only.
- [ ] **Step 2:** Browser check against mock server (canned stats) and wrong-password path; screenshot.
- [ ] **Step 3:** Commit `survey: stats page`.

### Task 4: Privacy line, database, go live

**Files:**
- Modify: `privacy.html` (one line: trial classes count anonymous survey taps, year level, date and three answers; nothing that identifies a child)

- [ ] **Step 1:** Add privacy line; commit and push.
- [ ] **Step 2:** Nathan connects Neon to the `writing-sidekick` Vercel project (Claude gives click-by-click steps) and sets `ADMIN_PASSWORD`. Claude pulls nothing secret into chat.
- [ ] **Step 3:** Run `db/survey.sql` against Neon through a scratchpad Node script reading `DATABASE_URL` from `vercel env pull` into a git-ignored file.
- [ ] **Step 4:** Live check: open `https://wesdlpteam.github.io/writing-sidekick/?trial=1`, use a typed test piece, answer three taps; stats page shows 1 child for that year. Then delete that one test row with Nathan's OK.
