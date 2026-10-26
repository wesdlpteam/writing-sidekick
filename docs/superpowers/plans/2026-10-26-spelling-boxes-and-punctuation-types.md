# Spelling boxes and punctuation types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare spelling and punctuation counts on the Editing card with up to 5 (Years 1-2: 3) of the child's own misspelt words, each with a try-it box and Sounds-Write style hints, and year-appropriate punctuation counts broken down by type.

**Architecture:** The existing editing audit (`api/_editing.js`) already returns verified spelling and punctuation evidence. We classify each punctuation place by type and filter by year there, pick spelling words in a new `api/_spelling.js`, add a `spellingCheck` route to `api/feedback.js` (AI only for wrong attempts, guarded against leaking the answer), and render it in the Editing card like the synonym challenge.

**Tech Stack:** Vanilla JS ES modules (iPad Safari), Node serverless function on Vercel, `node --test`, OpenAI chat completions via the existing `callModel`.

**Spec:** `docs/superpowers/specs/2026-10-26-spelling-boxes-and-punctuation-types-design.md` (read it first; it holds every product rule).

## Global Constraints

- Repo is PUBLIC: fixtures are invented sentences, never real student writing.
- The correct spelling must never appear on screen, in read-aloud, print, saved picture or an AI hint before the third wrong try.
- No spelling total and no "and N more" line anywhere the child sees.
- Punctuation types by year: Y1 `full_stops` (sentence endings . ? !); Y2 + `list_commas`; Y3 + `apostrophes`; Y4-6 + `speech`.
- Spelling word cap: 3 for Years 1-2, 5 for Years 3-6.
- Banned in hints: "magic e", "silent letter", "blend", "digraph", "phoneme", "grapheme".
- Sounds-Write: own words only; never a feature name; no materials copied.
- Child-facing copy follows `readingLevel(year)` (`api/_curriculum.js`); no em dashes in copy.
- Keep the existing `errorTotals` keys (`spelling`, `punctuation`, `capital_letters`, `full_stops`); `full_stops` IS the "sentence endings" count. New keys are added beside them.
- Bump every `?v=20261019-tick` cache tag (index.html, js/app.js, js/share-image.js, js/spoken.js) to `?v=20261026-spell`.
- UI work invokes `impeccable:impeccable` first; brand stays the existing Neo City purple/gold theme.

## Review Focus

- Sentence-start misspelling ("Becos we..." -> "Because") must still be picked (capitalised correction at a sentence start is not a name). Test in Task 2.
- A child typing their attempt with a capital or trailing space ("Because ") is right. Test in Task 3.
- Missing-letter attempts give an empty differing range in the attempt ("becaus" vs "because"); highlight must still show a position, not crash. Test in Task 2 (`differingPart`) and handled in Task 5.
- The same misspelling appearing 4 times becomes one word, ranked first. Test in Task 2.
- A Year 2 piece full of missing speech marks shows no speech row and its capital-after-speech-mark errors are not counted. Test in Task 1.

---

### Task 1: Punctuation types and year filtering in the audit

**Files:**
- Modify: `api/_editing.js` (`changesIn`, `inspectEditing`, `unavailableTotals`)
- Test: `tests/editing.test.mjs`

**Interfaces:**
- Produces: `inspectEditing(audit, transcript, { yearLevel } = {})` -> `{ totals, issues, retryable, spelling }` where `totals` gains `list_commas`, `apostrophes`, `speech` (each `number|null`, null whenever `punctuation` is null), and `spelling` is the array of verified spelling evidence `[{ quote, correction, start }]` (`start` = transcript offset of the quote) for Task 2. `unavailableTotals()` includes the three new keys as null. `editingTotals(audit, transcript, opts)` passes opts through.
- Type of a punctuation place (one type each, first match wins): end-mark count differs -> `full_stops`; a double-quote mark differs -> `speech`; an apostrophe differs -> `apostrophes`; a comma differs -> `speech` if the entry's quote or correction contains a double-quote mark, else `list_commas`; anything else -> untyped (still in `punctuation`).
- Year filter: when `yearLevel < 4`, a capital error on a word directly after an opening speech mark (in the transcript or the correction) is not counted in `capital_letters`. Types above the year are still computed (filtering is the display's job), so totals stay honest for later teacher use.

- [ ] **Step 1: Write failing tests** `punctuation places are typed`: `'we ran home'`+`home.` -> `full_stops:1`; `'dont stop'`+`don't` -> `apostrophes:1`; `'eggs milk bread'`+`eggs, milk, bread` -> `list_commas:2`; `'Yes said Max'`+`"Yes," said Max` -> `speech:3` (two marks and one comma, zero list_commas); `'lets go'` with `Let's` split into capital and punctuation entries -> `apostrophes:1`. `types are unknown whenever punctuation is unknown` (reuse the 'famly dont' null case: all three new keys null). `below Year 4 a capital after a speech mark is not counted`: `'she said "yes"'` + capital entry `"yes"`->`"Yes"`: yearLevel 2 -> `capital_letters:0`, yearLevel 4 -> `1`. `spelling evidence is returned with offsets`: `'My famly is big'` + `famly`->`family` -> `spelling` equals `[{quote:'famly', correction:'family', start:3}]`.
- [ ] **Step 2: Run** `node --test tests/editing.test.mjs` - Expected: the new tests FAIL, old ones pass.
- [ ] **Step 3: Implement.** In `changesIn`, return `types: Map(placeKey -> type)` alongside `endMarks`; in `inspectEditing` count typed places into per-type Sets keyed exactly like `found.punctuation`; collect verified spelling entries (those that added to `found.spelling`) with their `start`.
- [ ] **Step 4: Run** `npm test` - Expected: all pass (211 + new).
- [ ] **Step 5: Commit** `git commit -m "editing audit: type each punctuation place, drop speech capitals below Y4"`

### Task 2: Picking spelling words

**Files:**
- Create: `api/_spelling.js`
- Test: `tests/spelling.test.mjs`

**Interfaces:**
- Consumes: `inspectEditing(...).spelling` and `.totals.spelling` from Task 1.
- Produces:
  - `pickSpellingWords(evidence, transcript, { yearLevel, totalSpelling }) -> { status: "words"|"clear"|"none_to_practise"|"unavailable", words: [{ wrote, correct, sentence, kind: "sounds"|"sound_alike", tricky: [start, end] }] }`. `tricky` is the differing range inside `correct`.
  - `differingPart(attempt, target) -> { attempt: [s, e], target: [s, e] }` via case-insensitive common prefix then common suffix (suffix may not overlap prefix). Empty range allowed (`s === e`).
  - `isSoundAlike(wrote, correct) -> boolean` from a built-in `SOUND_ALIKES` list of groups (the spec's list; e.g. `["there","their","they're"]`, `["to","too","two"]`, `["your","you're"]`, `["where","were","wear"]`, `["no","know"]`, `["here","hear"]`, `["right","write"]`, `["one","won"]`, `["for","four"]`, `["new","knew"]`, `["by","buy"]`, `["see","sea"]`, `["our","hour"]`, `["wood","would"]`, `["whole","hole"]`, `["which","witch"]`, `["piece","peace"]`, `["meet","meat"]`, `["tail","tale"]`).
- Rules (from spec): split a multi-word quote/correction into word pairs by index when word counts match (skip otherwise); strip edge punctuation; skip pairs equal ignoring case, or equal ignoring apostrophes; skip a capitalised correction unless it is at a sentence start (previous non-space char in transcript is `.`, `!`, `?`, a newline, or nothing) or is "I"; dedupe case-insensitively; rank: count of occurrences desc, then `correct.length` asc, then first `start`; cap 3 (yearLevel <= 2) else 5. `sentence`: first transcript sentence (split on newlines and after . ! ?) holding `wrote` as a whole word, max 200 chars. Status: `totalSpelling === null` -> `unavailable`; `0` -> `clear`; words empty -> `none_to_practise`; else `words`.

- [ ] **Step 1: Write failing tests**: `differingPart('skool','school')` -> `{attempt:[1,2], target:[1,3]}`; `differingPart('thort','thought')` -> `{attempt:[2,4], target:[2,6]}`; `differingPart('becaus','because')` -> `{attempt:[6,6], target:[6,7]}`; picks `Becos` at sentence start (`'Becos it rained. We hid.'`); skips `sam`->`Sam` mid-sentence and `dont`->`don't`; four `becos` + one `wen` ranks `becos` first and returns one `becos`; Year 2 caps at 3 and Year 5 at 5 from 7 distinct words; `there`->`their` has `kind:"sound_alike"`; statuses for null / 0 / all-skipped / normal.
- [ ] **Step 2: Run** `node --test tests/spelling.test.mjs` - Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `api/_spelling.js` with the three exports above.
- [ ] **Step 4: Run** `npm test` - Expected: all pass.
- [ ] **Step 5: Commit** `git commit -m "spelling: pick up to 5 of the child's own misspelt words"`

### Task 3: Payload wiring and the spelling check route

**Files:**
- Modify: `api/feedback.js` (feedback route near line 877; new route beside `synonymCheck` near 1071)
- Modify: `dev-server.mjs` (MOCK_PAYLOAD + mock `spellingCheck`)
- Test: `tests/feedback.test.mjs` (or a new `tests/spelling-check.test.mjs`)

**Interfaces:**
- Consumes: Task 1 `inspectEditing(audit, transcript, { yearLevel })`, Task 2 `pickSpellingWords`, `differingPart`.
- Produces: feedback payload gains `spellingStatus` and `spellingWords` (shape from Task 2). New request `{ yearLevel, spellingCheck: { wrote, correct, attempt, sentence, kind, tryNumber } }` -> `{ verdict: "right"|"same"|"try_again", hint: string, highlight: [s, e] }` (`highlight` is inside `attempt`; absent for "right").
- Bounds (`readSpellingCheck`): each of wrote/correct/attempt one word matching `/^[\p{L}][\p{L}'\-]*$/u`, max 30 chars; `tryNumber` integer 1-3 (default 1); `kind` one of the two; sentence trimmed to 200 chars and passed through `minimiseContactDetails`. Bad input -> 400 with a child-friendly message.
- No-AI paths: attempt equals correct (case-insensitive, trimmed) -> `right`; attempt equals wrote -> `same` with hint "That's the same spelling as before. Try a different spelling for the highlighted part."; `kind === "sound_alike"` and `tryNumber === 1` -> `try_again` with the spec's fixed sound-alike hint.
- AI path: `SPELLING_HINT_SPEC` (own words, spec's rules), user text holds year, sentence, attempt, correct word, differing parts; `reasoning_effort: "none"`, `max_completion_tokens: 150`, JSON `{ hint }`. `hintLeaks(hint, correct, correctPart) -> boolean` (exported): true if the hint contains `correct` as a whole word (case-insensitive), or `correctPart.length >= 2` and the hint contains it as a standalone letter group, or any banned term. Leak or model failure -> fallback "Most of your sounds are right. Look at the highlighted part. Which other spelling could make that sound?" (sound_alike fallback: the fixed sound-alike hint). Never 502 a child for a hint.

- [ ] **Step 1: Write failing tests** using the existing fake `fetchImpl` pattern in `tests/editing.test.mjs`: payload of `'My famly is big'` with a `famly` audit entry has `spellingStatus:'words'` and `spellingWords[0]` `{wrote:'famly', correct:'family', kind:'sounds'}`; check route: `'Family '` -> `right` with no fetch call; attempt == wrote -> `same`, no fetch; sound_alike try 1 -> fixed hint, no fetch; model hint `"Try spelling it family"` -> fallback hint; model hint containing `"digraph"` -> fallback; good hint passes through with `highlight`; `attempt:'fam ly'` -> 400.
- [ ] **Step 2: Run** `npm test` - Expected: new tests FAIL.
- [ ] **Step 3: Implement** the wiring, `readSpellingCheck`, `spellingCheck`, `hintLeaks`; add the mock (right when attempt matches, else a fixed hint and `differingPart` highlight) and mock payload fields (`spellingStatus:'words'`, two invented words, one sound_alike; totals with the three new keys).
- [ ] **Step 4: Run** `npm test` - Expected: all pass.
- [ ] **Step 5: Commit** `git commit -m "spelling check route: instant right, guarded Sounds-Write hints"`

### Task 4: Shared visuals, read-aloud and mission wording

**Files:**
- Modify: `js/feedback-visuals.js` (`editingItems`, `editingLines`, `editingAdvice` callers, `missionRows` edit row)
- Modify: `js/spoken.js` (`editingSpoken`, new `spellingSpoken`)
- Test: `tests/feedback-visuals.test.mjs`, `tests/spoken.test.mjs`

**Interfaces:**
- Produces: `editingItems(yearLevel)` -> capitals row then the year's punctuation type rows, each `{ key, short, plain, errorLabel, symbol, tip }`, keys from `full_stops`, `list_commas`, `apostrophes`, `speech` (no `spelling`, no `punctuation`); short labels "Sentence endings", "Commas in lists", "Apostrophes", "Speech marks"; every row has a short how-to-hunt tip (all years). `editingLines(errorTotals, yearLevel, opts)` follows `editingItems` order. `spellingLines(spellingStatus, spellingWords) -> string[]` for print/picture: one line per word, `"<wrote>  ____________"`, or the status sentence. `spellingStatusText(status)` -> the spec's exact sentences ("We couldn't check spelling this time. Read it with your teacher." / "No spelling words to practise this time." / an all-clear line). `spellingSpoken(status, count)` -> instructions only, never any word.

- [ ] **Step 1: Write failing tests**: `editingItems(1)` keys `['capital_letters','full_stops']`; `(2)` adds `list_commas`; `(3)` adds `apostrophes`; `(5)` adds `speech`; every item has a non-empty tip; `spellingLines('words', [{wrote:'becos', correct:'because'}])` contains `becos` and not `because`; `spellingSpoken('words', 2)` contains neither word; status texts exact. Update the existing Year 1/2 `editingItems` assertions only where keys change.
- [ ] **Step 2: Run** `npm test` - Expected: new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` - Expected: all pass.
- [ ] **Step 5: Commit** `git commit -m "editing card wording: punctuation types by year, spelling lines"`

### Task 5: Editing card UI, print, picture, cache tags

**Files:**
- Modify: `index.html` (Editing card `#practice-card`: new `<ul id="spelling-list">` block above `#practice-words`, keep `.practice-note`), `js/app.js` (`renderPractice`, new `renderSpelling`, print block near 1260, reset id list near 1321), `js/api.js` (`checkSpelling`), `js/share-image.js`, `app.css`
- Test: browser check (below) plus `npm test`

**Interfaces:**
- Consumes: Task 3 payload + route, Task 4 helpers. `checkSpelling({ yearLevel, wrote, correct, attempt, sentence, kind, tryNumber })` in `js/api.js` posts `spellingCheck`.
- Behaviour: per word, the child's spelling in bold, "In your writing:" sentence via `sentenceWithWord`, input (`autocapitalize="none"`, `spellcheck=false`, `autocorrect="off"`, maxLength 30) + Check. Right -> cheer, input locked. Wrong (tries 1-2) -> hint and the attempt shown with `highlight` marked (empty range: mark the letter before, or the first letter). Third wrong -> reveal `correct` with `tricky` marked + "Say each sound as you write it in your book." Never put `correct` in the DOM before the reveal (keep it in the closure). Status other than `words` -> the status sentence in place of the list. Read-aloud uses `spellingSpoken`. Print and saved picture use `spellingLines` and `editingLines`.

- [ ] **Step 1: Invoke `impeccable:impeccable`**, then build the UI, matching `.challenge-item` patterns and the existing theme.
- [ ] **Step 2: Bump** all `?v=20261019-tick` to `?v=20261026-spell`.
- [ ] **Step 3: Run** `npm test` - Expected: all pass.
- [ ] **Step 4: Browser check** with the mock server (see the project memory note: mock server on port 4174 from the scratchpad, iPad viewport 820x1180): reach the Word lab slide, screenshot the Editing card; type a right answer (cheer), a wrong one twice (hint + highlight), a third wrong (reveal); confirm by DOM search that the correct word is absent before the reveal; Year 2 run shows no Apostrophes/Speech rows; print preview lists words as written. Save screenshots to the scratchpad.
- [ ] **Step 5: Commit** `git commit -m "editing card: spelling boxes with hints, punctuation by type"`

### Task 6: Docs, live check, ship

**Files:**
- Modify: `README.md` (feature notes; Sounds-Write attribution line only)

- [ ] **Step 1:** Update README.
- [ ] **Step 2:** One live run with the real model via `scripts/quality-eval.mjs` or a scratchpad script on an invented fixture: payload has `spellingWords`; one wrong attempt gets a non-leaking hint.
- [ ] **Step 3:** Whole-branch review (fresh reviewer), fix findings, `npm test` green.
- [ ] **Step 4:** Commit and push to main (push = deploy), then load the live Pages URL once to confirm the new assets load.
