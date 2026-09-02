# Writing Feedback (PYP) — Design

Date: 2026-08-31
Status: Approved design, pre-implementation
Owner: Nathan Benn

## What this is

A web app for iPads that gives primary students (Years 1–6) specific, positive,
constructive feedback on their handwritten writing. The student photographs the page
from their book, the app cleans the photo into a scan, reads the handwriting into
typed text, and returns feedback matched to ACARA writing expectations for their
year level. Nothing is ever stored.

It is a web app, not an App Store app: it runs in Safari on the iPad, uses the iPad
camera, and can be pinned to the home screen so it looks and feels like an app.

## Student flow

1. Open the app (home screen icon → Safari web app).
2. Pick year level (1–6). Optionally pick the kind of writing: story/narrative,
   recount, persuasive, information report, or "not sure".
3. On-screen reminder before the camera opens: "Cover your name before you take
   the photo."
4. Take the photo. The app straightens, crops, and brightens it on the iPad itself
   (client-side) so it looks like a proper scan.
5. Review screen: cleaned scan on one side, typed-out text on the other. The student
   (or teacher, for younger years) fixes any misread words. This step is the accuracy
   safety valve.
6. Tap "Get my feedback". Feedback appears as stars and a wish: 2–3 specific things
   done well plus one clear next step, worded for the student's age and anchored to
   ACARA year-level writing expectations. A "More detail" control reveals a fuller
   breakdown by writing area: ideas, structure, vocabulary, spelling and punctuation.
7. The student can save or print the finished page (scan + typed text + feedback) as
   one document using the iPad's own share/print. Closing the page discards everything.

## Feedback design

- Tone: always positive and constructive. Stars are specific ("Your opening sentence
  hooks the reader with a question") not generic ("Good work").
- The wish is one actionable next step the student can apply immediately.
- Wording adapts to year level: shorter, warmer, simpler for Years 1–2; richer for
  Years 5–6.
- Feedback is anchored to the ACARA (Australian Curriculum v9) English curriculum
  file stored in this project at `curriculum/english-curriculum-f-6-v9.md` (supplied
  by Nathan, © ACARA 2022). Per-year writing expectations used in prompts are
  distilled from this file — achievement standards plus the Creating texts and
  relevant Language content descriptions — not from model memory.
- Genre selection (if made) shapes what the feedback looks for (e.g. persuasive →
  arguments and persuasive devices; narrative → character, setting, plot).
- The AI is instructed to never repeat, guess, or use any student name or personal
  detail, even if one appears in the photo, and to base every comment on the actual
  text of the writing.

## Teacher settings

A small settings area (gear icon, simple confirmation so students don't wander in)
lets the teacher set device-level defaults: default year level, whether "More detail"
is available to students, and feedback depth. Settings live in the browser's local
storage on that iPad only. No accounts.

## Architecture

- **Frontend:** static single-page web app, hosted on Vercel. Handles camera capture,
  client-side image clean-up (straighten/crop/contrast), review/edit screen, feedback
  display, and print/save via the browser. Optimised for iPad Safari, portrait and
  landscape.
- **Backend:** one small serverless function (Vercel) holding the OpenAI API key.
  Receives the cleaned image plus year level and genre, makes a single OpenAI vision
  call that both reads the handwriting and produces structured feedback (JSON:
  transcribed text, stars, wish, detailed breakdown), returns it, retains nothing.
  A second lightweight call path re-generates feedback after the student edits the
  typed text (text-only, cheaper).
- **Model:** OpenAI budget vision model — currently GPT-5 mini class; fall back to
  GPT-4o mini if needed, upgrade path to a stronger model via one config value if
  feedback quality is insufficient. Verify current model names and pricing from
  OpenAI docs at build time.
- **One AI call, one vendor:** reading and feedback in a single call keeps cost down
  and means only one external service ever sees student work.

## Data safety (non-negotiable)

- Nothing stored, anywhere: no database, no server logs of images or text, no
  analytics containing student content. The backend processes and discards.
- Photos never touch any service other than the app's own backend and OpenAI's API
  (API traffic is not used for model training under OpenAI's API terms).
- "Cover your name" reminder before capture; AI instructed to ignore names regardless.
- OpenAI API key lives in a server-side environment variable on Vercel, never in
  frontend code, never committed. `.gitignore` covers `.env` from day one.
- If the repo is ever made public, it contains code only — no student content, no keys.

## Cost

- Single scan + feedback on the budget model: under one cent.
- Class of 25, weekly use: well under AUD $1/month at budget-model pricing.
- Upgrading to a stronger model raises this to a few cents per scan — still small.

## Known risks and honest caveats

- **Years 1–2 handwriting** is the hardest to read; expect more misreads and more
  reliance on the review/fix step, likely with teacher help.
- **Invented spelling** (early years) must not be "corrected" silently by the
  transcription; the prompt must transcribe what was written, since spelling
  development is part of what feedback addresses.
- **Photo quality** (shadows, glare, blue lines in books) affects reading accuracy;
  client-side clean-up mitigates but cannot fix a blurry photo. The app should
  detect an unusably poor read and ask for a retake rather than produce garbage
  feedback.
- **Shared iPads:** because nothing is stored, there is no leakage risk between
  students on the same device.

## Success criteria

- Typed transcription is at least ~90% word-accurate on legible Year 3–6 samples.
- Every star and wish references something specific from the student's actual writing.
- Feedback tone and reading level suit the selected year.
- Works end to end on iPad Safari at real iPad sizes, portrait and landscape,
  verified in a real browser with screenshots.
- Confirmed: no image, text, or feedback persists anywhere after the session ends.
- First load fast enough for classroom use on school wifi.

## Out of scope (v1)

- Student or teacher accounts, logins, dashboards, or saved history.
- Marking, grading, scores, or rubric levels shown to students.
- Multiple-page documents (v1 is one page per scan; multi-page can come later).
- Languages other than English.
- App Store distribution.
