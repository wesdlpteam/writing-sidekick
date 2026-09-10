# Age and demonstrated writing quality

## QA inventory before browser testing

Use invented samples only. Compare the same foundational narrative, developing persuasive passage and fluent persuasive passage at each supported year (1–6). Inspect actual live responses for an attainable challenge, concise persuasive topic sentences, accurate strategy/task alignment, existing supporting evidence, honest strengths, exact quotes, useful models, editing counts and successful delivery. A successful HTTP response alone is not a quality pass.

Browser checks: exercise year selection, upload and feedback navigation over the normal local HTTP origin; inspect live-result fixtures for a fluent younger writer and foundational older writer. Desktop 1440x1000 and mobile 390x844, initial and post-interaction states. Check power-up model readability, target count, responsive layout and console errors. Save and open final screenshots. Browser fixtures verify presentation; direct live model tests verify generated content.

## Findings and changes

- Baseline strong Year 2 writing was told to add an example that already followed its topic sentence. Its model was below the demonstrated writing quality.
- Baseline foundational feedback sometimes described so as what happened next, or asked to join two actions with because without a causal reason.
- Conflicting requirements forced weakness-only power-ups and multiple targets regardless of the draft. Strong writing can now keep honest strength ratings and receive a stretch; older foundational writers can receive fewer manageable targets.
- The topic-sentence strategy definition still encouraged decorative complexity. It now preserves concise persuasive topic sentences and places support after them.
- Generation and review now distinguish age-based coaching language from attainment-based strategy/model selection. The reviewer records a brief private evidence check, including following context and existing support, before producing feedback. No ability labels are shown to children.

Live results and final browser evidence are recorded below after inspection. No claim of universal accuracy can follow from a finite sample suite.

## Final verification and practical limits

- `node --test`: 111 passed, 0 failed (`output/age-quality-tests.txt`). `git diff --check` passed, with line-ending warnings only.
- Complete paired live matrix: `output/age-quality-final`, 18/18 successful responses, no missing worked examples. All correctly spelt fixtures returned zero spelling errors. Calls took 45–67 seconds. These fixtures reuse three texts at six different years to distinguish age from attainment; they are 18 scenarios, not 18 independently written texts.
- Seven new-topic/genre cases in `output/age-quality-holdouts-final`: 7/7 successful responses. The deliberate `famly` fixture returned exactly one spelling error; the other six returned zero. Calls took 46–78 seconds. Poetry retained its intentional line breaks and nonstandard sentence presentation in the editing audit.
- Refinements were iterative, not one frozen-model benchmark. The complete matrix preceded the final poetry/context and coaching-only wording clarifications. Targeted reruns after those changes are in `output/age-quality-fluent-final`, `output/age-quality-younger-final`, and `output/age-quality-link-fix`.
- A targeted fluent-argument rerun exposed a false rejection of the valid opener “To make this work”. The structural guard now recognises inserted/replaced comma-delimited openers beyond a closed word list; unchanged models and mere added detail still fail. Meaning remains the teaching reviewer's responsibility. A regression test covers the exact failure; a fresh live request returned 200 after the fix.
- The final reviewer has the complete feedback schema and criteria keys, medium reasoning, and a private evidence assessment before its feedback. Generation has 30 seconds and review 80 seconds, beneath the client's overall 120-second timeout. Custom review models must support the documented API options. The larger reasoning allowance adds cost and latency; earlier two-call price estimates have been removed.
- The runner `scripts/quality-eval.mjs` is available through `npm run quality:live`. A new run gets a timestamped output folder; an explicit existing folder reuses saved results and says so. Non-success responses, missing models/quotes, and thrown errors produce a failing exit status. This checks delivery and structure, not educational correctness. The saved 18-case matrix was replayed through this result checker with zero delivery/structure failures; that replay made no provider requests.
- No student photo or student transcript was sent in this test round. No commit, push or deployment performed. Existing unrelated changes were preserved.

### Content inspection

| Case | Observed teaching decision |
| --- | --- |
| Foundational narrative, Years 1–6 | Short causal links or a specific place detail, rather than a compulsory advanced paragraph. Older writers can receive one or two manageable targets. |
| Developing persuasive, Years 1–6 | Develop a reason, improve an imprecise concluding sentence, or connect existing reasons; topic sentences remain concise. |
| Fluent persuasive, Years 1–6 | The final paired matrix targeted an unstated way of judging the trial, acknowledging the argument's existing evidence and organisation. Strength ratings were retained. |
| Fluent younger narrative | A local feeling/action detail at the pause; coaching remained short. Model ambition varies between runs, so this remains a teacher-review point. |
| Older fragmented narrative | Complete a dependent because clause before asking for more advanced craft. |
| Recount and report | Add an exact observed detail/explanation, or group/combine related facts rather than impose persuasive structure. |
| Poetry | Correctly omitted invented editing errors. An early task contradicted the sheltered setting; subsequent guidance protects physical context and deliberate restraint. Refinement choice is still subjective. |
| Fluent new persuasive argument | Reruns offered specific trial evaluation, paragraph linking, or a rhetorical question. These are not equally ambitious; generated advice still varies. Do not present the suite as proof that every response is excellent. |

The meaningful improvement is evidence-sensitive differentiation with stronger safeguards, not a guarantee. In particular, fluent younger model prose can still be more modest than ideal; classroom examples should continue to be reviewed for useful stretch. Do not reward complexity alone or force dramatic changes to already effective writing.

### Browser evidence

Tested normal upload, read, confirmation (Year 6), feedback navigation, year/genre selection and the two-tap clear action through `http://127.0.0.1:4173`. Saved live synthetic responses supplied the feedback; browser testing did not make live provider requests. Desktop 1440x1000 and mobile 390x844. No horizontal overflow in the inspected mobile state (390px document width), and no browser console errors or warnings. Browser and local server closed after testing.

Every screenshot below was opened with `view_image`. Power-up headings, examples and instructions were readable; cards wrapped without horizontal overflow. The full mobile older-writer page was captured to include complete cards without element-capture clipping. Initial-state screenshots are viewport captures; ordinary vertical page scrolling is expected.

Evidence directory: `C:/Users/BennN/.codex/visualizations/2026/09/09/01a0887b-e3be-7e32-9349-b3a0f96aace1/`.

| File | Viewport/state | Confirmed |
| --- | --- | --- |
| age-quality-desktop-start.png | 1440x1000, initial | Clear year controls and initial layout. |
| age-quality-mobile-start.png | 390x844, cleared start | Responsive year controls and legible introductory text. |
| age-quality-desktop-fluent.png | 1440x1000, fluent Year 1 power-up | One specific stretch task and its model, no duplicate strategy disclosure. |
| age-quality-mobile-fluent.png | 390x844, same power-up | Full card, quote, example and task wrap correctly. |
| age-quality-desktop-foundations.png | 1440x1000, foundational Year 6 | Two manageable strategies and readable worked models. |
| age-quality-mobile-foundations.png | 390x844, full feedback page | Strength panel, both cards and navigation remain usable without horizontal overflow. |
