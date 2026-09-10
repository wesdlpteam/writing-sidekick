# Transcription accuracy log

Real pages, what the app typed, what the page says, and what changed because of it. Photos
stay OUT of this repo (student work); only short phrases are quoted here. Add a dated section
per sample so patterns build up over time.

The reading step is OpenAI's vision model, which does not learn from our use. Each sample
improves the app only through the reading rules in `api/feedback.js` (TRANSCRIBE_RULES), the
photo clean-up in `js/scan.js`, or a worked example added to the prompt.

## 2026-09-09: Year 5 narrative, one page, pencil on dotted-thirds ruled paper

Reported by Nathan from the live app (gpt-5.4, image detail "original", 2000px).

| Page says | App typed | Pattern |
| --- | --- | --- |
| "Just two hours ago" | "Just two, hours ago" | Invented comma. A dash of the printed ruling sits where a comma would be. |
| "way smarter. He was" | "way smater, He was" | Squeezed "r" dropped; a full stop (a corrected comma) before a capital read as a comma. |
| "which I agree." (end of line) | "which I agree" | Final full stop missed at a line end. |
| "But now, no need" (paragraph start) | "but no, no need" | "now" read as "no"; capital B at a paragraph start read as lowercase. |
| "covered by bushes" (words touching) | "coverd dby bushes" | Two touching words split in the wrong place, inventing a misspelling. |
| "men now. Now we think" | "men now, Now we think" | A comma the child fixed into a full stop, before a capital, read as a comma. |

Changes made (commit after this date in git log): rule 2 gained four cues (a mark before a
capital is a full stop; check every sentence and paragraph end for a full stop; the ruling's
dots and dashes are not punctuation; use letter height for capitals) and a new rule 3 (count
the letters before calling a word misspelt; touching words are still two words; an ambiguous
letter takes the real-word reading, but a clearly wrong word stays wrong).

Not yet verified against this page through the live model: the photo was not on disk. To
verify, save the photo outside the repo and run the reading step on it before and after.

## Ideas held back

- A second "proofread against the photo" pass with a checklist (every comma before a capital,
  every odd spelling, every line end). Likely to catch what one pass misses, but it doubles
  the reading cost (about one more cent a page) and adds several seconds.
- Erasing printed ruled lines in the photo clean-up (long horizontal dark runs) so their dots
  and dashes cannot be mistaken for punctuation. Risky for crossbars and underlines; needs
  samples to test against.

## 2026-09-10: Year 4, separate short persuasive exercises

The supplied photo and typed screenshot show `really` read as `realy` and `hayfever` as `heyfever`. A full stop appears to have been introduced before `And` in the seasons passage. `Wednesdays` and faint apostrophes need further original-resolution review; no exact original spelling total is asserted.

Changes: an image-grounded verification pass, [unclear] instead of silent guesses, and removal of the categorical rule treating a mark before a capital as necessarily a full stop. The student checks uncertain readings at every year level. No automatic replacement of these sample words is applied to transcription. Editing totals now require a separate audit with exact evidence.

The supplied-photo live test remains unverified: automatic approval review blocked its transfer to OpenAI without explicit permission for that photo and transcript. Synthetic text tests are documented separately. Photos remain outside the repository.
