# Transcription and feedback quality

Status: approved and implemented locally. Automated and synthetic live checks are complete; final browser evidence is in the QA audit. Live testing of the supplied student photo remains pending explicit authorization for transfer to OpenAI. Nathan also supplied TWR 2.0 Section I, integrated through api/_twr.js.

## Goal

Read student handwriting faithfully, count only evidenced editing errors, and provide ambitious, attainable year-level writing models using The Writing Revolution strategies. Use the supplied NAPLAN guides as assessment references, not instructions to execute or year-level scoring thresholds.

## Findings

- In the supplied screenshots, handwritten `really` becomes `realy`, and `hayfever` becomes `heyfever`. A full stop appears to have been added after `all the time`. Reinspect the original-resolution image before finalising a transcription fixture, especially Wednesdays and faint apostrophes. Do not declare an exact original spelling total from uncertain handwriting.
- `api/feedback.js` transcribes in one model call. Its rules require a best guess for unreadable words and contain an overly categorical rule that a mark before a capital is a full stop. These can introduce confident errors.
- `api/feedback.js` accepts model-provided non-negative error totals without evidence. No underlying list can explain the reported ten spelling errors.
- `api/_curriculum.js` applies the Year 3/4 instruction to keep sentences under 16 words to the entire response, including writing models. This conflicts with ambitious examples.
- Power-up rules insist on one line and one strategy even for paragraph-level work. Transition instruction lists connectives without sufficiently enforcing their logical relationship to surrounding ideas.
- `js/app.js` renders “What is this strategy?” as a details disclosure containing another rule/example after the main explanation.
- Existing unrelated changes: `.impeccable/hook.cache.json`, `docs/audits/2026-09-04-writing-sidekick-audit-and-fix-brief.md`, `.playwright-cli/`, and `output/`. Preserve them.

## Proposed behaviour

1. Transcription retains the student's actual spelling, punctuation, capitals and paragraph boundaries. Add a second image-grounded verification pass that compares the draft with the photo, focusing on joined/doubled letters, vowel shapes and faint marks. It must not proofread the child's language. Mark genuinely uncertain spans for checking rather than silently inventing words; unresolved spans do not contribute to editing counts. Preserve the student's ability to edit the transcript. Never overwrite their confirmed edits.
2. Keep power-ups as: find your line/passage; a short explanation with a strong before/after model; one clear task. Remove the redundant disclosure. Keep the strategy name and explanation visible.
3. Separate easy-to-read coaching instructions from the writing standard demonstrated. Year 4 models should show developed ideas, precise verbs/nouns, meaningful details and controlled complex sentences when appropriate. One teaching focus may use two or three sentences or a short paragraph where needed. Keep models on a different topic so students do the thinking on their own writing.
4. Teach transitions through meaning: a new reason, an example, a contrast or a conclusion. For an ordered argument, show enough context to establish the previous reason. A new reason gets a topic sentence followed by supporting detail. Do not present However as interchangeable with Secondly. Conclusions draw together existing reasons instead of merely repeating the position or adding an unsupported reason.
5. Recognise that this page contains several short exercises on different topics. Do not judge it as one incomplete essay, merge the arguments, or automatically demand an essay conclusion. Match each task to the relevant passage and available evidence.
6. Derive editing totals from a private, structured list of evidenced occurrences in the confirmed transcript. Validate exact text/location, deduplicate overlaps and separate spelling, capitals, punctuation and word spacing. Apostrophes are punctuation; case-only differences are capitals; colloquial Australian words such as mozzie are not automatically errors. Word spacing such as any thing must not become multiple spelling errors. Verify proposed spelling corrections conservatively; an occurrence match alone does not establish a misspelling. Do not return private corrections to the student or log their text. If an audit cannot be validated, show a checking-unavailable state rather than a fabricated total or zero. No arbitrary cap or forced count of one.

## Implementation order and affected components

1. Record the sample comparison and uncertainties in `docs/audits/2026-09-09-transcription-accuracy-log.md`. Keep student photos outside the repository. Use minimal de-identified test phrases.
2. Update transcription orchestration and response validation in `api/feedback.js`; preserve uncertainty through `js/api.js`, `js/transcript.js`, and `js/app.js` as required after inspecting their state handling. Bound verification time and handle unavailable verification without pretending it succeeded.
3. Distil relevant NAPLAN criteria into `api/_curriculum.js` and `api/_criteria.js`, with source notes. Persuasive: elaboration supporting a position, precise vocabulary, purposeful cohesion. Narrative: developed events, character/setting, mood and controlled sentence variety. Preserve year-level calibration and sentence expansion, combining, because/but/so, subordinating conjunctions, transitions and paragraph planning from TWR.
4. Update `api/feedback.js` generation and quality checking for ambitious models, correct strategy/task matching, relevant passage selection and coherent paragraph-level examples. Add original year-banded calibration examples; do not paste copyrighted exemplar scripts. Use bounded repair or a clear failure state for rejected feedback rather than displaying invalid teaching.
5. Implement evidence-derived editing counts in `api/feedback.js`, including unavailable states and client compatibility. Assess all categories in the same audit so the same error is not counted twice.
6. Simplify the power-up display in `js/app.js` and update affected layout styles only where necessary.

## Verification and acceptance

- Extend `tests/feedback.test.mjs`, `tests/transcript.test.mjs`, `tests/curriculum.test.mjs`, `tests/criteria.test.mjs` and affected visual tests as appropriate. Run `npm test`.
- Cover doubled-letter/vowel transcription checks, preservation of actual misspellings and missing punctuation, uncertainty exclusion, repeated real errors, invented evidence, duplicates, case/apostrophe separation, spacing, Australian usage, missing/invalid audit output and timeout behaviour.
- Run the supplied image through the real transcription path when credentials are available, compare it against the reviewed reference and report observed errors. Mock tests alone cannot prove handwriting accuracy or model teaching quality. Do not promise all future errors are eliminated.
- Inspect generated Year 4 persuasive feedback for a developed reason and supporting detail, purposeful transition and a conclusion grounded in supplied reasons. Inspect narrative output and younger/older year calibration as well. The original bad dog example must not pass as the expected teaching model.
- Before browser testing, create a QA inventory: initial transcript, uncertain-word confirmation, edited transcript submission, power-up explanation/models/tasks, editing totals and audit failure states. Test through the normal HTTP origin at desktop and 390x844, including keyboard interaction and a meaningful post-interaction state. Check console errors.
- Locate/read the required installed Playwright skill before browser verification. Save screenshots under CODEX_VISUAL_EVIDENCE_DIR (establish the permitted directory if unset), open each using view_image, and report what was confirmed. Close the browser session and any disposable server. If tooling/credentials are unavailable, report the concrete limits instead of claiming a pass.

## References

- User-supplied persuasive and narrative NAPLAN marking guides, especially criteria for ideas, vocabulary, cohesion, sentence structure and spelling (printed pages 10, 12, 13, 15 and 17).
- https://www.thewritingrevolution.org/planning-tools/3-5-pacing-guide-sequence-of-twr-strategies-by-grade/
- https://www.thewritingrevolution.org/resources/book-resources/chapter-3/

## Scope and next action

No dependency installation, commits, push or deployment in this plan. The additional image verification and feedback quality checks may add latency and model cost; measure these during implementation. Nathan reviews this plan before product edits, as required by the global brainstorm-and-plan skill.
