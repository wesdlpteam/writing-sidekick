# Writing Sidekick (Years 1 to 6)

An iPad web app for primary students. A student picks their year level, photographs
their handwritten writing (up to two pages; a page snapped sideways or upside down is
turned upright automatically before it is read), checks the typed-out version (both pages
together in one box) by tapping any word to fix it, and gets specific, improvement-first
feedback matched to the Australian Curriculum (ACARA v9) expectations for their year.
Nothing is ever stored.

## What the feedback looks like

The feedback comes as three slides, named to fit the superhero theme: Power-ups, Word lab and
Level up. Coaching instructions are pitched at the child's year; worked examples demonstrate ambitious, attainable writing: Years 1 and 2 get picture-book
sentences, Years 3 and 4 plain words with a hint for any term, Years 5 and 6 the proper names
of strategies.

- Writing strength: one tappable chip per writing skill (audience, ideas, cohesion and so on),
  coloured by how it went. A tap explains what the skill means in a child's words and shows
  what the sidekick saw in their own writing. "What you did well" then lists the real strengths,
  quoting the child, so the positives are as visible as the next steps.
- One to three power-ups (one or two for Years 1 and 2): the areas with the biggest payoff for
  this piece. Each card has one teaching focus and one strategy, laid out as three numbered steps in
  the order the child works: 1 find this line in your book (their own words, quoted); 2 use
  the strategy (its name, a one-line how-to for this kind of sentence, and the strategy done
  on a fresh sentence like theirs, before and after, never their own sentence rewritten, so
  the student applies the strategy independently, with the explanation visible beside the model);
  3 do this (one short instruction). A one-line opener says what the line already does well.
  The strategies are the ones the school teaches (because/but/so, subordinating conjunction
  start, sentence expansion, sentence combining, elaborating with a detail sentence,
  transition words, appositives, topic and concluding sentences, sentence types, vary
  vocabulary, and for older years general-to-specific introductions and their mirror
  conclusions), only offered from the year they suit; a label that contradicts the job (a
  "split it up" task named as sentence combining) is dropped rather than shown. Revising
  comes first; spelling is labelled as editing and comes after. The slide ends with "Pick up
  your pencil": the child revises in their book, not on the iPad.
- The word lab: word power (four synonyms for each plain word, climbing from a small step up
  to a stretch word, with the child's sentence rewritten), a synonym challenge from Year 2 up
  (three more of the child's own words, a box and a Check button each; a tiny AI call says
  whether the word they typed really is a synonym), and the editing counts to find and fix.
- Mission complete: the send-off back to the book, with Save picture and Print.
- Level up: the child photographs the revised page. The app compares the two versions and
  gives specific praise for what really changed (which power-ups show up, quoting the new
  words; which practice words are now spelt right, checked by the server), plus one gentle
  next tip. Nothing is claimed that is not in the new writing.
- The ten-area check-up (audience, text structure, ideas, characters and setting or persuasive
  devices, vocabulary, cohesion, paragraphing, sentence structure, punctuation, spelling; nine
  for reports and poems) is never shown as a list: it drives the writing strength chips
  (tap one to see that area's strength and next step) and the "What you did well" card.
  The saved picture and the print-out hold the child's feedback alone; there is no
  teacher report.
- A Listen button on every card reads it aloud in a warm, sincere voice (OpenAI's "marin"
  voice), so younger readers can hear their feedback.

The app is student-only for now: there is no teacher settings screen, students choose their
own year level, and the check-up and Listen buttons are always on.

The area names follow the national writing assessment criteria; the descriptions used in
the prompt and the app are written in our own words (the marking guides themselves are
not reproduced here). The writing strategies follow the approach of The Writing Revolution (the
Hochman Method), which the school uses for writing instruction; "strategies" is the book's own
word for them, the names are theirs, the explanations and examples are ours, and none of their
materials are reproduced. See
`docs/research/writing-revolution-brief.md` and `docs/research/twr-section-i.md`. The supplied
TWR 2.0 sentences section is distilled in `api/_twr.js` and used by generation and review;
the book itself is not uploaded, reproduced, or used to retrain a model.

The approach follows what the feedback research says works: answer "where to next?",
stay specific to the task, show the improvement rather than just naming it, and leave
the child something to do.

## How the AI part works

Two separate steps, so each has one job:

0. Which way up? A small copy of each page goes to the model at low detail, which answers
   with the turn (0, 90, 180 or 270 degrees) that makes the writing upright. The app turns
   the page itself before reading it, so a photo taken sideways reads as well as one taken
   straight. An unclear answer means no turn, and the Rotate button is still there.
1. Reading the handwriting. The photos go to a vision model at full image detail with
   strict copy rules: keep every misspelling, keep every apostrophe and punctuation mark,
   leave out crossed-out words, put inserted words where the caret points, keep line
   breaks and page order. A second pass compares the draft against the same photo. Unreadable
   words or marks appear as [unclear], never silent guesses. Year 4 and above check the typing;
   uncertainty or an unavailable verification pass triggers this check for younger writers too.
2. Feedback. Only the checked text goes to the model, with the year-level expectations,
   the genre guide and the skill bank. A separate teaching editor improves the draft and audits
   editing errors using exact quoted occurrences. The server validates those occurrences and
   calculates totals; model-supplied totals are ignored. Corrections remain server-side.
   Unverifiable audits show unavailable counts, not zero. A failed teaching review asks the
   child to retry instead of displaying unchecked feedback.

The extra image check is bounded to 25 seconds. Feedback generation has 30 seconds and
the independent review has 80 seconds, within the client's 120-second limit. The reviewer
uses medium reasoning and the complete output schema, and checks the student's existing
skills and surrounding sentences before choosing targets. Provider retries share the same
time budget. These checks add model cost and
latency; they reduce failure modes but cannot guarantee perfect handwriting or feedback.

Photos are cleaned up on the iPad first (uneven lighting flattened so the page reads
white and the ink dark, like a phone's document scan) and sent at up to 2000 pixels.

## Try it on this computer (no AI key needed)

Double-click `start-app.bat`. A browser opens with the app in practice mode:
the feedback is a canned example, but every screen works.

## Real feedback needs an OpenAI key

1. Copy `.env.example` to a new file called `.env`.
2. Paste your OpenAI API key into it, on the line that mentions the key.
3. The `.env` file stays on this computer; it is ignored by version control and never shared.

Both steps default to `gpt-5.4`. Set `OPENAI_MODEL=gpt-5.4-mini` to make the feedback
generation cheaper, or `OPENAI_TRANSCRIBE_MODEL` to change the reading step. The independent
teaching/editing reviewer defaults to `gpt-5.4`; `OPENAI_REVIEW_MODEL` overrides it. The Listen buttons
use `gpt-4o-mini-tts` with the `marin` voice; `OPENAI_TTS_MODEL` and `OPENAI_TTS_VOICE`
change that.

## The live site

Share this link: https://wesdlpteam.github.io/writing-sidekick/

The page is hosted by GitHub Pages straight from the `main` branch of this repo, so
every push to `main` updates the live site within a minute or two.

GitHub Pages only serves files, so the one server function (`api/feedback.js`, the part
that talks to OpenAI) runs on Vercel at https://writing-sidekick.vercel.app and accepts
browser calls only from the GitHub Pages address. Vercel also redeploys on every push.
The OpenAI key and model names live as environment variables in the Vercel project
settings, using the same variable names as `.env.example`. They are never in the repo.

On an iPad, open the site in Safari and use Share, then Add to Home Screen, so it
looks and launches like a normal app.

## Privacy and safeguarding

- No accounts, no database, no analytics, no browser storage. The server function responds
  and forgets. On the iPad everything stays in memory until "Finish and clear", leaving the
  page, or ten minutes untouched (a warning shows first).
- The photo and typed writing do go to OpenAI's API to be read and given feedback, and the
  read-aloud voice is OpenAI's too. `privacy.html` (linked from the app as "For adults") is a
  draft explanation for parents and staff; the school must confirm the retention arrangement
  on its OpenAI account and the processing regions, then approve the wording.
- Photos are only included in a saved picture or print-out when the child ticks the box.
- Before any feedback, the writing goes through a safeguarding check (`api/_safety.js`): narrow
  local rules for plain first-person disclosures, then OpenAI's moderation check. A flagged
  piece gets a trusted-adult screen with a note for the teacher instead of feedback, and the
  feedback model is never asked about it. The wording is a draft for the school's safeguarding
  lead to approve. Phone numbers, emails and street addresses are blanked before ordinary
  writing goes to the feedback model.
- The feedback may only quote, correct or swap words that really are in the child's writing;
  anything else is dropped before it is shown.
- Students are reminded to cover their name before photographing, and the AI is told never to
  use or repeat a name even if one appears.
- The OpenAI key lives only in server environment variables. The functions refuse any request
  that does not come from the app's own pages. `APP_PAUSED=1` switches every AI call off;
  `ALLOWED_ORIGINS` adds extra allowed sites; `OPENAI_BASE_URL` can point at an approved
  regional endpoint; `OPENAI_MODERATION_MODEL` changes the safety check's model.
- Still open (from the September 2026 audit): a classroom sign-in so only the school's
  devices can spend on the AI, and durable per-day quotas. Until then, set a spending limit
  and alerts on the OpenAI account.

## Where things live

- `index.html`, `css/`, `js/`: the app the student sees
- `art/`: the Writing Sidekick hero artwork
- `api/feedback.js`: the server function that talks to OpenAI (both steps)
- `api/speak.js`: the read-aloud function (text in, mp3 out); `api/_cors.js` (the request gate)
  and `api/_provider.js` (provider address and timeouts) are shared by both
- `api/_safety.js`: the safeguarding check and the trusted-adult response
- `privacy.html`: the adult-facing explanation of where writing goes (draft)
- `api/_curriculum.js`: per-year writing expectations, distilled from
  `curriculum/english-curriculum-f-6-v9.md` (ACARA v9, © ACARA 2022)
- `tests/`: run with `npm test`
- `docs/superpowers/`: design and build plan documents

## Cost

Cost depends on the models, input length, image detail and review reasoning. Earlier
two-call estimates no longer apply to the image verification and deeper teaching review.
Check actual usage in the provider account. A cheaper draft model does not remove the
independent review cost. The September age/attainment matrix took about 45–67 seconds per
feedback request; these are observations, not a latency guarantee.

## Checking age and writing quality

Age controls coaching readability and curriculum expectations. Demonstrated sentence control,
idea development and organisation control the next teaching step and worked model. Strong
younger writers should receive a worthwhile refinement; older foundational writers should
receive a manageable scaffold. A concise persuasive topic sentence stays concise, and its
support follows in separate sentences. Genuine strength ratings can receive stretch tasks.

The invented fixtures in `tests/fixtures/quality-samples.mjs` pair three writing levels with
Years 1–6. `tests/fixtures/quality-holdouts.mjs` adds new topics, genres and edge cases.
Run `npm run quality:live` for the matrix, or `npm run quality:live -- output/quality-holdouts holdouts`
for the holdouts. These commands load local API configuration, send invented text to the
configured provider, incur usage charges and save results locally. They do not send student
photos. Inspect the output against `docs/audits/2026-09-10-age-attainment-quality.md`;
HTTP success does not establish teaching quality. Ordinary `npm test` uses no live provider.
