# Say it simpler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A **Say it simpler** button on each power-up card fetches easier wording with a smaller job, and a **Show the first version** link switches back.

**Architecture:** A new `simplify` request on `/api/feedback`, built like `synonymCheck`: the request is read and bounded, the quick model is called once, and the reply is validated. The browser keeps the simpler cards in `state.simpler`. A pure helper, `shownFeedback()`, merges in whichever version is on screen, and read-aloud, the mission check and level-up use that merged feedback. The print-out keeps reading `state.feedback`, so it always shows the first version.

**Tech Stack:** Vanilla ES modules, Vercel function, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-04-say-it-simpler-design.md`

## Global Constraints

- Never change `yourLine`, the strategy (`move`), `skill`, `area` or `areaLabel`. Change only `why`, `rule`, `example` and `nowYou`.
- The example must never be the child's line rewritten. Reuse `copiesLine()` and `containsRun()` from `api/feedback.js`.
- Wording is one year easier: `readingLevel(Math.max(1, yearLevel - 1))`.
- Model: `env.OPENAI_MODEL || DEFAULT_FEEDBACK_MODEL`, `reasoning_effort: "none"`, `response_format: json_object`.
- The child's line goes through `minimiseContactDetails` before it's sent. Nothing is stored.
- The print-out always shows the first version.
- The words a child sees: button `Say it simpler`, waiting `Making it simpler…`, switch back `Show the first version`, switch again `Show the simpler version`, failure `Hmm, I couldn't make it simpler just now. Please try again.`

## Review Focus

1. **Double tap:** a second tap while waiting must not send a second request (the button is disabled while waiting).
2. **Stale reply:** if the child taps "Snap my writing again" (new feedback) before a reply arrives, the reply must be dropped and must not appear on the new cards.
3. **The model copies the child's line into the example:** the example is dropped, and the rest of the simpler card is still shown.
4. **Read-aloud after switching:** Listen reads the version on screen, and any speech already playing stops when the child switches.
5. **Offline or a server error:** the card stays as it was, the failure line appears, and tapping again retries.

---

### Task 1: Server `simplify` request

**Files:**
- Modify: `api/feedback.js` (new `SIMPLIFY_SPEC`, `readSimplify`, `validateSimplify`, `simplifyCard`, plus a branch in `handleFeedback` next to `synonymCheck`)
- Test: `tests/feedback.test.mjs`

**Interfaces:**
- Produces: a request body `{ yearLevel, simplify: { skill, why, yourLine, rule, example: { before, after } | null, nowYou, move } }`, where `move` is the strategy name or `""`. The reply is `200 { why, rule, example: { before, after } | null, nowYou }`. Bad input gets `400 { error }`, an unusable model reply gets `502 { error }`, and a missing key gets `500`.

- [ ] **Step 1: Write the failing tests**

```js
const CARD = { skill: "Expand a sentence", why: "Your line is clear. Adding when helps.", yourLine: "The dog ran.",
  rule: "Add when, where or why.", example: { before: "The cat slept.", after: "The cat slept on the warm mat after lunch." },
  nowYou: "Expand your line with when, where and why.", move: "Sentence expansion" };

test("simplify: one card goes to a small call pitched a year lower; a simpler card comes back", async () => {
  const capture = {};
  const reply = { why: "Your line is good.", rule: "Add when it happened.", example_before: "The cat slept.", example_after: "The cat slept after lunch.", now_you: "Add when to your line." };
  const r = await handleFeedback({ yearLevel: 4, simplify: CARD }, { fetchImpl: mockFetch(JSON.stringify(reply), { capture }), env: ENV });
  assert.equal(r.status, 200);
  assert.deepEqual(r.payload, { why: "Your line is good.", rule: "Add when it happened.", example: { before: "The cat slept.", after: "The cat slept after lunch." }, nowYou: "Add when to your line." });
  const sys = systemText(capture.body);
  assert.match(sys, /This writer is in Year 3/);
  assert.match(sys, /smaller/i);
  assert.doesNotMatch(sys, /power_ups|areas/);
  const user = capture.body.messages[1].content[0].text;
  assert.match(user, /The dog ran\./);
  assert.match(user, /Sentence expansion/);
  assert.equal(capture.body.reasoning_effort, "none");
});

test("simplify: Year 1 stays Year 1; an example copying the child's line is dropped, the rest kept", async () => {
  const capture = {};
  const reply = { why: "Good line.", rule: "Add when.", example_before: "The dog ran.", example_after: "The dog ran after lunch.", now_you: "Add when." };
  const r = await handleFeedback({ yearLevel: 1, simplify: CARD }, { fetchImpl: mockFetch(JSON.stringify(reply), { capture }), env: ENV });
  assert.equal(r.status, 200);
  assert.equal(r.payload.example, null);
  assert.equal(r.payload.nowYou, "Add when.");
  assert.match(systemText(capture.body), /This writer is in Year 1/);
});

test("simplify: junk -> 400 without the model; no job back -> 502; no key -> 500", async () => {
  for (const bad of ["nope", {}, { ...CARD, nowYou: "", rule: "" }, { ...CARD, yourLine: "x".repeat(401) }]) {
    const capture = {};
    const r = await handleFeedback({ yearLevel: 3, simplify: bad }, { fetchImpl: mockFetch("{}", { capture }), env: ENV });
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.equal(capture.chatCalls, undefined);
  }
  const empty = await handleFeedback({ yearLevel: 3, simplify: CARD }, { fetchImpl: mockFetch(JSON.stringify({ why: "x", now_you: "" })), env: ENV });
  assert.equal(empty.status, 502);
  assert.doesNotMatch(empty.payload.error, /json|parse|model/i);
  const noKey = await handleFeedback({ yearLevel: 3, simplify: CARD }, { fetchImpl: mockFetch("{}"), env: {} });
  assert.equal(noKey.status, 500);
});
```

- [ ] **Step 2: Run `node --test tests/feedback.test.mjs`**. Expected: the three new tests FAIL, because `simplify` isn't handled yet.

- [ ] **Step 3: Implement in `api/feedback.js`**
  - `readSimplify(raw)`: return `{ error: "Something went wrong with that power-up. Please try again." }` unless `raw` is an object with a non-empty `yourLine` and a non-empty `nowYou` or `rule`. Apply these length limits (over a limit is an error, not a trim): skill 200, why 600, yourLine 400, rule 400, nowYou 400, move 80, and each example part 400. `example` is used only when it has both `before` and `after`.
  - `SIMPLIFY_SPEC`: tells the model that a child found this power-up hard to understand. It asks for the same strategy on the same line, in easier words, with ONE smaller first step in `now_you` (for example, only *when* instead of when, where and why). The example sentence must be new, never the child's line, and must show only that smaller step. The model must not rewrite the child's line or give them the answer, and must reply with JSON only: `{ "why", "rule", "example_before", "example_after", "now_you" }`.
  - `simplifyCard({ card, yearLevel, env, fetchImpl })`: the system prompt is `[`The child is in Year ${yearLevel}.`, readingLevel(Math.max(1, yearLevel - 1)), SIMPLIFY_SPEC]`. The user text lists each field of the card with a label. Use `max_completion_tokens: 500`. Validate the reply: `nowYou` must be non-empty, or return 502. Run every field through `childText(…, { yearLevel, readerYear: yearLevel })`. Set `example` to null unless both parts are present, neither `copiesLine(part, card.yourLine)` is true, and `after` isn't the child's line.
  - `handleFeedback`: add a `body?.simplify !== undefined` branch after `synonymCheck`. Order it read → error 400 → no key 500 → `simplifyCard` with `yourLine: minimiseContactDetails(card.yourLine)`.

- [ ] **Step 4: Run `node --test`**. Expected: all tests PASS.

- [ ] **Step 5: Commit**: `git add api/feedback.js tests/feedback.test.mjs` and `git commit -m "simplify: server request for an easier power-up"`.

### Task 2: Browser helpers (request, merge, stale guard)

**Files:**
- Modify: `js/api.js` (add `simplifyPowerUp`)
- Modify: `js/feedback-visuals.js` (add `simplifyRequest`, `shownFeedback`)
- Test: `tests/feedback-visuals.test.mjs`

**Interfaces:**
- Consumes: Task 1's request shape.
- Produces:
  - `simplifyPowerUp({ yearLevel, card }) -> Promise<{ why, rule, example, nowYou }>` in `js/api.js`, which posts `{ yearLevel, simplify: card }`.
  - `simplifyRequest(p) -> { skill, why, yourLine, rule, example, nowYou, move }`, where `move` is `p.move?.name || ""`.
  - `shownFeedback(feedback, simpler) -> feedback`. `simpler` is an array indexed like `powerUps`, and each entry is `{ card, showing: boolean }` or absent. Where `showing` is true, the power-up becomes `{ ...p, ...card }`, keeping `yourLine`, `move`, `skill`, `area` and `areaLabel` from `p`. If `simpler` is missing or nothing is showing, it returns the same object.

- [ ] **Step 1: Write the failing tests**

```js
test("shownFeedback: swaps in only the showing simpler cards and never their line or strategy", () => {
  const fb = { powerUps: [{ skill: "A", yourLine: "L1", nowYou: "big job", move: { name: "M" } }, { skill: "B", yourLine: "L2", nowYou: "job 2" }] };
  const out = shownFeedback(fb, [{ card: { nowYou: "small job", yourLine: "HACK", why: "w" }, showing: true }, { card: { nowYou: "x" }, showing: false }]);
  assert.equal(out.powerUps[0].nowYou, "small job");
  assert.equal(out.powerUps[0].yourLine, "L1");
  assert.equal(out.powerUps[0].move.name, "M");
  assert.equal(out.powerUps[1].nowYou, "job 2");
  assert.equal(fb.powerUps[0].nowYou, "big job", "the first version is untouched");
  assert.equal(shownFeedback(fb, []), fb);
});

test("simplifyRequest + levelUpRequest + missionRows use the version on screen", () => {
  const p = { skill: "A", why: "w", yourLine: "L", rule: "r", example: null, nowYou: "big", move: { name: "M" }, areaLabel: "Ideas" };
  assert.deepEqual(simplifyRequest(p), { skill: "A", why: "w", yourLine: "L", rule: "r", example: null, nowYou: "big", move: "M" });
  const shown = shownFeedback({ powerUps: [p] }, [{ card: { nowYou: "small" }, showing: true }]);
  assert.equal(levelUpRequest(shown, "a", "b").powerUps[0].nowYou, "small");
  assert.equal(missionRows(shown, 4)[0].job, "small");
});
```

- [ ] **Step 2: Run `node --test tests/feedback-visuals.test.mjs`**. Expected: FAIL, because the new helpers aren't exported yet.
- [ ] **Step 3: Implement the three functions** with the signatures above. The keys that are kept from `p` are a fixed list: `["yourLine", "move", "skill", "area", "areaLabel"]`.
- [ ] **Step 4: Run `node --test`**. Expected: all tests PASS.
- [ ] **Step 5: Commit**: `git commit -m "simplify: browser request and on-screen version helpers"`.

### Task 3: The button on the card

**Files:**
- Modify: `js/app.js` (`state.simpler`, `renderPowerUps`, the Listen text, the mission check, the level-up call, and the reset when feedback changes)
- Modify: `css/app.css` (`.simpler-row`, `.simpler-note`)
- Modify: `index.html` (bump the `?v=` on `app.js`, plus `api.js` and `feedback-visuals.js` in `app.js`'s imports, to `20261104-simpler`)

**Interfaces:**
- Consumes: `simplifyPowerUp`, `simplifyRequest` and `shownFeedback` from Task 2.

- [ ] **Step 1: State.** Add `simpler: []` to `state`. Reset it to `[]` wherever `state.feedback` is set or cleared (`js/app.js:394` and `:1507`).
- [ ] **Step 2: Card body.** In `renderPowerUps`, move everything from the `why` line through the steps into a `fillCard(card, p, index)` function. Call it on first render and again whenever the child switches versions, replacing only that card's `.power-body` wrapper. The eyebrow, the title and `jobCheck` stay outside the wrapper.
- [ ] **Step 3: Button row.** Under the Listen slot, add a `.simpler-row` with one `button.ghost`. The flow:
  - Tap with no simpler card yet: disable the button and set its label to `Making it simpler…`. Note `const asked = state.feedback`, then call `simplifyPowerUp({ yearLevel: state.yearLevel, card: simplifyRequest(p) })`.
  - Reply arrives: drop it if `state.feedback !== asked`. Otherwise store `state.simpler[index] = { card, showing: true }`, call `stopSpeaking()`, refill the body with the merged card, and set the label to `Show the first version`.
  - Request fails: re-enable the button with `Say it simpler`, and show the failure line in a `p.simpler-note[role=status]`. Tapping again retries.
  - Once a simpler card exists, the button switches `showing` instantly with no request and calls `stopSpeaking()`. Its label alternates between `Show the first version` and `Show the simpler version`.
- [ ] **Step 4: Use the version on screen.** The Listen callback becomes `powerUpSpoken(shownFeedback(state.feedback, state.simpler).powerUps?.[index], …)`. Wherever `missionRows(state.feedback…)` builds the mission check and Mission complete, and in `levelUpRequest(state.feedback, …)` at `js/app.js:416`, pass `shownFeedback(state.feedback, state.simpler)` instead. Leave the print-out (`js/app.js:1401`) on `state.feedback`. Because `jobCheck` is outside the body, rebuild that card's `jobCheck` when the child switches, so its job line matches.
- [ ] **Step 5: CSS.** `.simpler-row { margin: 0 0 10px; }` and `.simpler-note { margin: 6px 0 0; font-size: 0.95em; }`. The button uses the existing `ghost` style, so the Years 5–6 senior look needs nothing extra.
- [ ] **Step 6: Run `node --test`**. Expected: all tests PASS.
- [ ] **Step 7: Check it in the browser** with `npm run dev` and a stubbed or real key on a Year 3 sample. Check:
  - tapping shows the waiting label, then a simpler card with the same quoted line;
  - switching back and forth is instant;
  - Listen reads the version on screen;
  - the mission check job line matches;
  - turning the network off gives the failure line and the card stays as it was;
  - the print-out shows the first version.
- [ ] **Step 8: Commit**: `git commit -m "simplify: Say it simpler button on power-up cards"`.
