# Writing Feedback PYP App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iPad web app where a Year 1–6 student photographs handwritten writing and receives ACARA-anchored stars-and-a-wish feedback, storing nothing.

**Architecture:** Static single-page frontend (vanilla HTML/CSS/JS, no framework, no build step) plus one Vercel serverless function that holds the OpenAI key and makes a single vision call returning JSON (transcript + feedback). A local dev server (`node dev-server.mjs`) serves the same files and API for browser testing, with a mock mode so the UI can be verified without an API key.

**Tech Stack:** Vanilla JS (ES modules), Canvas API for scan clean-up, Node 18+ built-ins only (zero npm dependencies), `node --test` for tests, OpenAI Chat Completions (model from env `OPENAI_MODEL`, default `gpt-5-mini`), Vercel hosting.

**Spec:** `docs/superpowers/specs/2026-08-31-writing-feedback-design.md`

## Global Constraints

- Store nothing: no DB, no server-side persistence, response header `Cache-Control: no-store` on API; frontend keeps data in memory only (teacher settings in localStorage are the sole exception).
- OpenAI key only in server env (`OPENAI_API_KEY`); `.gitignore` covers `.env` (already created).
- AI must transcribe exactly what the child wrote (including errors) and never repeat/guess names.
- All student-facing copy: warm, plain, age-appropriate, humanizer-clean, no em-dashes.
- Curriculum source of truth: `curriculum/english-curriculum-f-6-v9.md` (in project). Prompts use distilled summaries in `api/_curriculum.js`.
- No git repo yet (guard hook does not allow `git init`); no commit steps in this plan. OneDrive provides file version history as interim safety net.
- Zero npm dependencies anywhere; use fetch + built-ins.

## File Structure

- `index.html` — app shell, all screens as sections, loads `js/app.js` as module
- `css/app.css` — layout, screens, iPad-first responsive, print stylesheet for the export document
- `js/app.js` — screen state machine + event wiring
- `js/scan.js` — image load, downscale, enhance (grayscale + contrast stretch), rotate; exports pure helper `computeLevels(histogram)` for node testing
- `js/api.js` — `getFeedback({imageDataUrl, yearLevel, genre})` and `regenerateFeedback({transcript, yearLevel, genre})`
- `js/settings.js` — teacher defaults in localStorage
- `api/_curriculum.js` — per-year distilled ACARA writing expectations + genre notes (shared by serverless fn and tests)
- `api/feedback.js` — Vercel serverless function; also exports `handleFeedback(body, deps)` for tests
- `dev-server.mjs` — local static + API server with `MOCK=1` mode
- `tests/curriculum.test.mjs`, `tests/feedback.test.mjs`, `tests/scan.test.mjs`

---

### Task 1: Curriculum module

**Files:** Create `api/_curriculum.js`, `tests/curriculum.test.mjs`

**Produces:** `getYearGuide(year)` → `{summary: string}` for year 1–6 (throws otherwise); `getGenreGuide(genre)` → string ('' for unknown/absent); `FEEDBACK_RULES` string.

- [ ] Write test: years 1–6 return non-empty summary containing year-distinctive markers (e.g. Y1 "simple sentences", Y4 "complex sentences", Y6 "embedded"); year 0/7 throw; genres narrative/recount/persuasive/report return guidance; unknown genre returns ''.
- [ ] Run `node --test tests/curriculum.test.mjs` → FAIL (module missing)
- [ ] Implement module with summaries distilled from `curriculum/english-curriculum-f-6-v9.md` (achievement standards + Creating texts + Language sub-strands, writing-relevant only)
- [ ] Run test → PASS

### Task 2: Feedback serverless function

**Files:** Create `api/feedback.js`, `tests/feedback.test.mjs`

**Produces:** `handleFeedback(body, {fetchImpl, env})` → `{status, payload}` where success payload is `{transcript, stars[2-3], wish, detail{ideas,structure,vocabulary,spelling}}`. Default export: Vercel handler `(req,res)` wiring JSON body, POST-only, `no-store`, key from env. Accepts `{image, yearLevel, genre}` (image = data URL) OR `{transcript, yearLevel, genre}` for regeneration (text-only, no image sent).

- [ ] Write tests with mocked `fetchImpl`: rejects non-1–6 year (400); rejects missing image AND transcript (400); rejects >6MB image (413); builds prompt containing year guide text and FEEDBACK_RULES; parses model JSON (including ```json fences); on unparseable model output returns 502 with child-safe error message; response includes all four detail areas; regeneration path sends no image part.
- [ ] Run → FAIL
- [ ] Implement: system prompt = feedback rules + year guide + genre guide; user content = image part (or transcript); `response_format: {type:"json_object"}`; `max_completion_tokens: 1400`; robust JSON extraction; validation of shape with 502 on failure; never log body content.
- [ ] Run → PASS

### Task 3: Dev server with mock mode

**Files:** Create `dev-server.mjs`

**Produces:** `node dev-server.mjs` serves `/` static files and POST `/api/feedback` through the real handler; `MOCK=1` env returns a canned realistic payload (no OpenAI call) so UI is testable keyless. Port 4173.

- [ ] Implement (static MIME map, path traversal guard, JSON body collect, mock branch)
- [ ] Verify: start server, `curl http://localhost:4173/` returns HTML; mock POST returns canned JSON

### Task 4: Frontend shell, styles, settings

**Files:** Create `index.html`, `css/app.css`, `js/settings.js`, `js/app.js` (skeleton)

**Produces:** Screens: `#screen-start` (year buttons 1–6, genre chips, Start), `#screen-camera` (name reminder + take-photo via `<input type="file" accept="image/*" capture="environment">`), `#screen-review` (scan img + editable transcript + rotate/re-enhance + "Get my feedback"), `#screen-feedback` (stars list, wish, More detail disclosure, Save/Print, Start again), loading + error states. Settings gear → default year, allow-detail toggle (localStorage `wf-settings`).

- [ ] Build shell + state machine (`show(screenId)`), iPad portrait/landscape layout, big touch targets, print CSS: print shows only a tidy document (scan, transcript, feedback, date), everything else `display:none`.
- [ ] Verify in browser (mock mode): all screens reachable, console clean.

### Task 5: Scan clean-up

**Files:** Create `js/scan.js`, `tests/scan.test.mjs`

**Produces:** `prepareScan(file)` → `{dataUrl, width, height}`: EXIF-respecting load via `createImageBitmap`, downscale longest edge ≤1600, grayscale, contrast stretch using 2nd/98th percentile levels, JPEG 0.85. `rotate90(dataUrl)` → dataUrl. Pure `computeLevels(histogram)` → `{lo, hi}` node-tested.

- [ ] Write node test for `computeLevels`: flat histogram → near 0/255 spread; narrow histogram (all mass 100–140) → lo≈100 hi≈140; degenerate single-bin histogram → returns lo<hi (no divide-by-zero).
- [ ] Run → FAIL, implement, run → PASS
- [ ] Wire into review screen; browser-verify with a sample photo in mock mode.

### Task 6: API client + full flow

**Files:** Create `js/api.js`; finish wiring in `js/app.js`

**Produces:** `getFeedback` / `regenerateFeedback` calling `/api/feedback`, 90s timeout, friendly child-facing error messages; edited-transcript regeneration path; feedback rendering (stars, wish, detail areas gated by teacher setting).

- [ ] Implement + browser-verify full journey in mock mode.

### Task 7: Real-browser verification (iPad sizes)

- [ ] Chrome DevTools MCP: emulate iPad portrait (~834×1194) and landscape; walk full flow with a sample image; screenshot every screen; check console for errors; verify print preview document.
- [ ] Fix any visible defects and re-screenshot.

### Task 8: Deployment prep (Nathan-gated)

- [ ] `README.md` with plain-English run/deploy instructions
- [ ] `.env.example` with `OPENAI_API_KEY=`, `OPENAI_MODEL=gpt-5-mini`
- [ ] Deploy to Vercel + set env vars — requires Nathan's OpenAI key; then real handwriting end-to-end test.

## Self-review notes

Spec coverage: year picker (T4), genre (T1/T4), name reminder (T4), scan clean-up (T5), transcript check/fix (T4/T6), stars+wish+detail (T2/T6), teacher settings (T4), store-nothing (T2 headers, no persistence anywhere), print/save (T4), cost (model default gpt-5-mini, single call), poor-read retake path (T2 502 → friendly retry UI in T6). Multi-page, accounts, grading: out of scope per spec.
