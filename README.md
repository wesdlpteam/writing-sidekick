# Writing Sidekick (Years 1 to 6)

An iPad web app for primary students. A student picks their year level, photographs
their handwritten writing, checks the typed-out version, and gets warm, specific
feedback (two or three stars and a wish) matched to the Australian Curriculum (ACARA v9)
expectations for their year. Nothing is ever stored.

## Try it on this computer (no AI key needed)

Double-click `start-app.bat`. A browser opens with the app in practice mode:
the feedback is a canned example, but every screen works.

## Real feedback needs an OpenAI key

1. Copy `.env.example` to a new file called `.env`.
2. Paste your OpenAI API key into it, on the line that mentions the key.
3. The `.env` file stays on this computer; it is ignored by version control and never shared.

## Putting it on iPads (deploy to Vercel)

The app is built for Vercel hosting. Deploy the folder with the Vercel CLI or
dashboard, and add the OpenAI key (and optionally the model name) as environment
variables in the Vercel project settings, using the same variable names as
`.env.example`. Then open the site in Safari on the iPad and use Share → Add to
Home Screen so it looks like a normal app.

## Privacy design

- No accounts, no database, no saved photos or writing. The API responds and forgets.
- Students are reminded to cover their name before photographing.
- The AI is instructed to never use or repeat a name even if one appears.
- The OpenAI key lives only in server environment variables.

## Where things live

- `index.html`, `css/`, `js/` — the app the student sees
- `api/feedback.js` — the server function that talks to OpenAI
- `api/_curriculum.js` — per-year writing expectations, distilled from
  `curriculum/english-curriculum-f-6-v9.md` (ACARA v9, © ACARA 2022)
- `tests/` — run with `npm test`
- `docs/superpowers/` — design and build plan documents

## Cost

One scan and feedback on the default budget model (`gpt-5-mini`) costs well under
one cent. A class using it weekly costs under a dollar a month.
