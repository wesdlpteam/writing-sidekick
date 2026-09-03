# Writing Sidekick (Years 1 to 6)

An iPad web app for primary students. A student picks their year level, photographs
their handwritten writing (up to four pages), checks the typed-out version by tapping
any word to fix it, and gets specific, improvement-first feedback matched to the
Australian Curriculum (ACARA v9) expectations for their year. Nothing is ever stored.

## What the feedback looks like

The feedback comes as three slides, named to fit the superhero theme: Power-ups, Word lab and
Hero scan.

- Two or three power-ups: the areas with the biggest payoff for this piece, each with the
  child's own line, that line rewritten to show the skill, and a tiny "now you" task that
  sends them back into their own writing. The rewrite is named as one of the writing moves
  the school teaches (because/but/so, subordinating conjunction start, sentence expansion,
  sentence combining, elaborating with a detail sentence, transition words, appositives, topic
  and concluding sentences, sentence types, vary vocabulary, and for older years
  general-to-specific introductions and their mirror conclusions), with a plain explanation
  and a fresh example. Moves are only offered
  from the year they suit. Revising comes first; spelling is labelled as editing and comes
  after.
- The word lab: word power (stronger words for plain ones, with the child's sentence rewritten)
  and spelling to practise.
- The hero scan (the writing check-up): the ten areas writing markers look at (audience, text structure,
  ideas, characters and setting or persuasive devices, vocabulary, cohesion, paragraphing,
  sentence structure, punctuation, spelling), each with a status (strength, on track, next
  step), what the child did well, and a next step. Reports and poems use the nine shared
  areas.
- Spelling to practise and Word power.
- Revise it: under each power-up the child types their own new version and taps "Check my
  sentence". The AI judges only whether the move is there (nailed it, nearly there, keep
  going), quotes what works, offers one tweak, and shows the move done well if needed.
  Spelling is ignored here, because this is revising, not editing.
- A Listen button on every card reads it aloud in a warm, sincere voice (OpenAI's "marin"
  voice), so younger readers can hear their feedback.

The app is student-only for now: there is no teacher settings screen, students choose their
own year level, and the check-up and Listen buttons are always on.

The area names follow the national writing assessment criteria; the descriptions used in
the prompt and the app are written in our own words (the marking guides themselves are
not reproduced here). The writing moves follow the approach of The Writing Revolution (the
Hochman Method), which the school uses for writing instruction; the names are theirs, the
explanations and examples are ours, and none of their materials are reproduced. See
`docs/research/writing-revolution-brief.md`.

The approach follows what the feedback research says works: answer "where to next?",
stay specific to the task, show the improvement rather than just naming it, and leave
the child something to do.

## How the AI part works

Two separate steps, so each has one job:

1. Reading the handwriting. The photos go to a vision model at full image detail with
   strict copy rules: keep every misspelling, keep every apostrophe and punctuation mark,
   leave out crossed-out words, put inserted words where the caret points, keep line
   breaks and page order. The child checks and fixes the result before anything else.
2. Feedback. Only the checked text goes to the model, with the year-level expectations,
   the genre guide and the skill bank.

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
step cheaper, or `OPENAI_TRANSCRIBE_MODEL` to change the reading step. The Listen buttons
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

With both steps on `gpt-5.4`, one page plus feedback costs roughly two to three cents.
A class of 25 using it weekly is under three dollars a month. Switching the feedback
step to `gpt-5.4-mini` roughly halves that.
