# Writing Sidekick (Years 1 to 6)

An iPad web app for primary students. A student picks their year level, photographs
their handwritten writing (up to four pages), checks the typed-out version by tapping
any word to fix it, and gets specific, improvement-first feedback matched to the
Australian Curriculum (ACARA v9) expectations for their year. Nothing is ever stored.

## What the feedback looks like

- The big picture: one or two sentences from the sidekick naming the best thing in the
  piece and the one change that would lift it most.
- Two or three power-ups: the areas with the biggest payoff for this piece, each with the
  child's own line, that line rewritten to show the skill, and a tiny "now you" task that
  sends them back into their own writing. When the rewrite is a whole sentence it is named
  as one of twelve sentence types (simple, very short, power, red white and blue, adverb
  start, preposition start, -ing start, -ed start, semi-colon, dash, W-start,
  explore-the-subject) with a plain explanation and a fresh example, so the child can
  recognise the move and use it again. Types are only offered from the year they suit.
- The writing check-up: the ten areas writing markers look at (audience, text structure,
  ideas, characters and setting or persuasive devices, vocabulary, cohesion, paragraphing,
  sentence structure, punctuation, spelling), each with a status (strength, on track, next
  step), what the child did well, and a next step. Reports and poems use the nine shared
  areas. Teachers can hide the check-up for younger students.
- Spelling to practise and Word power.

The area names follow the national writing assessment criteria; the descriptions used in
the prompt and the app are written in our own words (the marking guides themselves are
not reproduced here).

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
step cheaper, or `OPENAI_TRANSCRIBE_MODEL` to change the reading step.

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

## Privacy design

- No accounts, no database, no saved photos or writing. The API responds and forgets.
- Students are reminded to cover their name before photographing.
- The AI is instructed to never use or repeat a name even if one appears.
- The OpenAI key lives only in server environment variables.

## Where things live

- `index.html`, `css/`, `js/`: the app the student sees
- `art/`: the Writing Sidekick hero artwork
- `api/feedback.js`: the server function that talks to OpenAI (both steps)
- `api/_curriculum.js`: per-year writing expectations, distilled from
  `curriculum/english-curriculum-f-6-v9.md` (ACARA v9, © ACARA 2022)
- `tests/`: run with `npm test`
- `docs/superpowers/`: design and build plan documents

## Cost

With both steps on `gpt-5.4`, one page plus feedback costs roughly two to three cents.
A class of 25 using it weekly is under three dollars a month. Switching the feedback
step to `gpt-5.4-mini` roughly halves that.
