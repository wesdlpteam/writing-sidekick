# Section III and Writing Strengths verification

## Scope and result

The approved Section III changes add support matched to the writing shown, a whole-sentence deletion strategy for irrelevant detail, and an explicit insufficient-evidence rating. Writing Strengths now appears before Power-Ups as its own feedback step. Its five-second motion graphic uses Nathan's supplied Sidekick artwork, with a still poster for reduced motion.

This is prompt guidance, validation and interface work, not training the underlying model. The source chapter, its published examples and the student's photographed work were not uploaded for these tests. All live feedback samples were invented. The revision-upload workflow, portfolios and teacher-assistance metadata are outside this implementation.

## Automated checks

`node --test`: **122 passed, 0 failed**, including insufficient-evidence ratings and exports, exclusion from power-ups and assessed counts, deletion-only models, supported strategy eligibility, Section I/III guidance in both model stages, and the existing editing-audit recovery checks. `git diff --check` was clean.

The new deletion guard rejects new facts, rewriting, reordering, no deletion and deleting everything. Existing guards still preserve expansion kernels and require an actual transition change. These checks enforce structure; they cannot independently prove the teaching judgment is correct.

## Live teaching checks

Nine invented cases cover foundational and fluent writing at Years 1, 4 and 6, Year 2 sentence combining, a Year 4 short narrative extract, and a Year 4 persuasive paragraph containing an irrelevant sentence. The retained two-stage pipeline delivered usable feedback for all nine. Selected cases were rerun after prompt refinements; results are in local `output/section3-live` and `output/section3-live-refined`.

Actual outputs were read, not just checked for successful JSON:

- Fluent writing received a meaningful refinement to how a proposed trial would be evaluated, without forcing beginner sentence work because of a young year setting.
- Foundational writing received manageable sentence work and selected support. Expansion tasks explicitly included brief planning notes in the final refined runs.
- The short extract retained demonstrated sentence, vocabulary and audience strengths while whole-text structure and paragraphing could be marked unassessed.
- The irrelevant-detail case initially gained an unnecessary second target. The guidance was tightened to favour the single useful deletion and preserve an effective concise reason. The refined result removed only the unrelated sandwich sentence; its worked example retained useful sentences unchanged.
- The Year 2 combining example combined two related habitat facts without inventing additional facts.
- A further invented Year 4 persuasive sample containing exactly one misspelling returned spelling **1**, punctuation **0** and capitals **0**, with no extra audit-repair call. Recorded in local `output/section3-editing-timed`.

These are sampled checks, not a guarantee for every age, genre or future model response. Unassessed ratings depend on the available sample, not its length alone.

## Browser checks

Used a real Chromium browser through `playwright-cli` at `http://127.0.0.1:4173`, with the app's normal upload/check-typing/feedback flow. The feedback route returned recorded live results from invented samples; an all-unassessed response was also exercised as a defensive state. Desktop viewport: **1440x1000**. Mobile viewport: **390x844**.

- Writing Strengths is the first step; Next opens the separate Power-Ups step, and Back returns correctly. Strength cards are not repeated in Power-Ups.
- Strength and unassessed chips open their appropriate details. Keyboard activation works. An unassessed skill has a neutral indicator and limitation note, with no invented praise or remedial task.
- The all-unassessed state skips Power-Ups, keeps validated editing zeros, and hides inapplicable revision/word-power mission tasks.
- The video plays once, reaches its stable final frame at 5 seconds and pauses when its section is hidden. Reduced-motion entry remains paused. Actual decoded video dimensions were 1280x720.
- Print places strengths before power-ups and preserves uncertainty. Save picture generated a usable PNG with the same order and labels. Tested the browser download fallback, not native iOS sharing or a physical printer.
- Finish and clear uses the existing two-tap confirmation and clears the newly added assessment/export content.
- Mobile document width was 390px at a 390px viewport. Final screenshots were opened and visually inspected: no unintended horizontal overflow, clipping, stretched media or unreadable labels. Browser console: **0 errors, 0 warnings**.

Evidence directory: `C:/Users/BennN/.codex/visualizations/2026/09/09/01a0887b-e3be-7e32-9349-b3a0f96aace1/`.

| File | Viewport/state | Confirmed |
| --- | --- | --- |
| `section3-strengths-desktop.png` | 1440x1000, full page | First step, final video frame and skill cards |
| `section3-uncertain-desktop.png` | 1440x1000, full page | Open unassessed paragraphing detail |
| `section3-powerups-desktop.png` | 1440x1000, full page | Separate Power-Ups step |
| `section3-strengths-mobile.png` | 390x844, full page | Readable poster and wrapped controls |
| `section3-uncertain-mobile.png` | 390x844, viewport | Neutral detail, note and close control |
| `section3-powerups-mobile.png` | 390x844, full page | Readable worked model and task |
| `section3-print.png` | 1440x1000, print media | Strengths and limitations before Power-Ups |
| `section3-saved-feedback.png` | Generated 1080x3116 PNG | Actual saved feedback image, including uncertainty |

## Media

`art/strengths.mp4` is a local animated graphic, not generated character body animation. It preserves the supplied artwork, adds a gentle entrance, a readable title and three gold stars, and ends with a stable hold. H.264, 1280x720, 30fps, yuv420p, no audio, fast-start metadata; 273,770 bytes. The matching poster is `art/strengths.jpg`. The source image is not committed; `scripts/render-strengths-video.mjs` accepts its path to reproduce the asset with ffmpeg and Windows fonts.

The clip uses `preload="none"` and plays after feedback has arrived. It does not add a model call or a video-generation wait to the feedback request.

## Feedback latency investigation

The retained pipeline uses the configured draft model (`gpt-5.4-mini` in this local evaluation), followed by the full `gpt-5.4` teaching/editing review at medium reasoning effort. The refined live cases took approximately **41–70 seconds** after submitting the transcript. This excludes photo reading and is not a measurement of Nathan's specific earlier session.

The evaluation runner now records each stage's full-response duration and token usage. A lower-effort review experiment was substantially faster, but a result again suggested adding “should” to an already useful persuasive reason. It also weakened some rating and scaffolding decisions. This setting was rejected for release. A separate single-assessment experiment retained medium reasoning but did not establish a sufficiently reliable speed/quality improvement to replace independent review.

Both experiments used the same nine invented cases. Lower-effort totals ranged from 18.3 to 30.7 seconds; single-assessment totals ranged from 29.3 to 62.0 seconds. Neither experimental production change is included. A final timed run of the retained pipeline took 62.6 seconds: 5.9 seconds for the draft and 56.8 seconds for the teaching/editing review. This directly identifies the review as the main wait in that run. Timings vary with model/service load and sample complexity; these were local API tests, not a controlled latency guarantee.

Production review settings remain unchanged. This release does **not** claim to fix the waiting time. The evidence supports keeping the stronger checks rather than shipping the faster, weaker feedback. Further latency changes need the same teaching-quality checks, including the original concise-topic-sentence regression.
