# Editing count recovery

Nathan reported all three editing cards (capitals, spelling and punctuation) showing no data. The exact student transcript was not available for diagnosis, so the causes below are reproduced failure modes, not a claim about that particular request.

## Reproduced causes and fixes

- A rejected audit entry made every category unavailable. Validation now keeps independently verified categories.
- Two valid corrections sharing one word were rejected as overlapping. Separate category changes now coexist; duplicate corrections within a category still do not inflate counts.
- Pure capital, apostrophe and spacing corrections sometimes arrived under spelling. These mechanically identifiable changes are classified correctly; ambiguous or compound changes still require rechecking.
- A live synthetic audit for “we” matched the beginning of “went”, then failed validation. Occurrence numbering now counts complete words/phrases, excluding embedded matches.
- Missing or invalid evidence now gets one focused editing recheck when the remaining request budget permits. It does not regenerate the teaching feedback. If unavailable, valid category counts survive; unresolved counts remain unavailable rather than becoming false zeroes. Unresolved [unclear] readings are not retried against text alone.

## QA inventory before browser testing

Check a successfully recovered 2-capital / 1-spelling / 2-punctuation response on desktop 1440x1000 and mobile 390x844, and a partial response with a single unavailable category. Exercise the normal upload/typing/feedback/Word lab flow with invented fixtures. Confirm readable cards, correct values, the partial-count instruction, and no console errors or overflow. Open final screenshots. Use no student photos or live student transcripts.

## Live editing checks

The teaching stages used a synthetic fixture; the focused editing-recovery request went to the configured provider. This isolates the new recovery step. Final results in `output/editing-recovery-live/`:

| Invented case | Capitals | Spelling | Punctuation | Result |
| --- | --- | --- | --- | --- |
| dont run near the pool | 1 | 0 | 2 | Pass |
| my famly went to the beach. we didnt stay because it rained | 2 | 1 | 2 | Pass |
| Correctly written family/beach sentences | 0 | 0 | 0 | Pass |
| becos it was raining, we stayed inside | 1 | 1 | 1 | Pass |

The first mixed-errors run reproduced the embedded-word bug; the table records the fresh rerun after the fix. These are validation checks, not proof that every future model judgment will be correct.

## Final verification

- `node --test`: 118 passed, 0 failed (`output/editing-recovery-tests.txt`). Includes independent categories, multiple fixes on one word, duplicate corrections, embedded-word occurrences, mixed corrections, successful recovery, failed recovery preserving valid counts, and exhausted time budget skipping extra calls.
- `git diff --check`: no whitespace errors, only existing line-ending warnings.
- Normal browser upload/typing/Word lab flow with synthetic fixtures showed capitals 2, spelling 1 and punctuation 2. A second flow preserved capitals 2 and spelling 1 when punctuation was unavailable, with the new instruction explaining the partial counts.
- Desktop 1440x1000 and mobile 390x844: readable cards, no unintended clipping, mobile document width 390px, zero console errors/warnings. All screenshots below opened with `view_image` and inspected. Browser fixtures tested presentation; the separate four-case provider test tested actual audit recovery.
- Browser session and disposable local server closed. No commit, push or deployment in this fix turn. Existing unrelated edits preserved.

Evidence directory: `C:/Users/BennN/.codex/visualizations/2026/09/09/01a0887b-e3be-7e32-9349-b3a0f96aace1/`.

| File | Viewport/state | Confirmed |
| --- | --- | --- |
| editing-recovered-desktop.png | 1440x1000, Word lab | All three recovered counts and checking instruction. |
| editing-recovered-mobile.png | 390x844, Word lab | Correct counts and readable compact cards. |
| editing-partial-mobile.png | 390x844, failed punctuation recheck | Two valid counts retained; only punctuation unavailable; helpful partial-count instruction. |
