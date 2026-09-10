# Section III feedback and separate Writing Strengths

Nathan approved the Section III review's first three recommendations and requested a separate Writing Strength section before Power-Ups, then a video using the supplied Sidekick artwork. Completed, tested app changes are authorised for automatic push.

## Implementation

1. Add original Section III guidance to generation and teaching review, including support within the same strategy and relevance before elaboration. Permit supported Year 1 expansion/elaboration and Year 2 combining while retaining later gates for appositives and essay scaffolds.
2. Add a paragraph-focus strategy whose model removes an irrelevant whole sentence while preserving useful sentences. Keep expansion and combining preservation rules.
3. Add an unassessed status with a limitation note, no invented praise/task and no power-up. Exclude it from assessed totals and focus selection, and preserve it in print/image exports.
4. Make Writing Strength the first feedback step, containing skill checks and named strengths. Power-Ups follows separately. Preserve forward/back navigation, focused headings, clear/reset behaviour and editing counts.
5. Create a short local motion-graphics MP4 from the supplied character image, with a matching poster, gentle movement and a final Writing Strengths hold. No image-to-video generator is connected. Reuse playback-on-entry behaviour; respect reduced motion and pause hidden clips.

## QA inventory before browser testing

- Desktop 1440x1000 and mobile 390x844: initial feedback opens Writing Strength, then Next opens Power-Ups without repeated strength cards. Back and numbered navigation work.
- Select a genuine strength and an unassessed skill. Notes, chip state, close control, heading focus and an absent remedial task are correct. Unknown skills do not inflate assessed totals.
- All-unassessed fallback does not manufacture power-ups. Existing editing categories retain their counts.
- Video plays only on the visible section, ends in a stable frame and has a readable poster when reduced motion is selected. No flashing or cropped character/text.
- Print and saved image show Writing Strength before Power-Ups and preserve unassessed labels. Confirm clear/reset removes the new assessment text.
- Save and open screenshots for desktop/mobile initial and post-interaction states; inspect console and page width.
- Run existing unit tests plus regressions for uncertain assessments, deletion models and changed strategy eligibility. Run live feedback on invented samples covering younger/fluent and older/foundational writers, a short extract and an irrelevant detail. Read the actual outputs.

This work does not add teacher metadata, portfolios or the proposed revision-upload workflow.
