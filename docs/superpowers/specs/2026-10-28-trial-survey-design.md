# Trial survey: design

Date: 2026-10-28. Owner: Nathan Benn. Status: awaiting approval.

## Why

Nathan wants to know whether Writing Sidekick actually helps during the class trials. The quickest
honest signal is to ask the students themselves at the end of each session, after they have made
their corrections in their books.

## What the student sees

Only in trial classes. On the "Mission complete" slide, under the mission recap, a short card:

1. Did you understand your feedback?
2. Did you like using Sidekick?
3. Did Sidekick help make your writing stronger?

Each question has three big face buttons: 😀 Yes · 😐 A bit · 🙁 No. One tap per question, no typing.
A tap can be changed before it is sent. Years 1 to 3 get the same Listen button the rest of the app
uses, reading the questions aloud. Answering is optional, and "Finish and clear" works as normal.
When all three are answered, the card says thank you.

The children have done their corrections in their books while ticking off each power-up, so the
third question is answered from experience, not guessed.

## What gets kept

One row per child per session: the date (day only, no time), the year level and the three answers
(any left blank are stored as blank). No name, writing, photo, IP address, device or class. Results
are grouped by year level only. Asked once per session: a child who uses "Snap my writing again"
is not asked a second time.

The row is sent when the third answer is tapped, or on "Finish and clear" if at least one was
answered.

## How it is built (copies Springboard)

- **Storage:** a Neon Postgres database connected to the Sidekick's Vercel project, the same free
  service Springboard uses. One table, `survey`, with columns: id, day, year_level, understood,
  liked, stronger. Answers are only ever `yes`, `bit`, `no` or blank.
- **Saving:** a new Vercel function, `api/survey.js`. It accepts only those values and year levels
  1 to 6 (anything else is rejected), and it is rate limited like Springboard's `log`.
- **Viewing:** a new `stats.html` page with a password (`ADMIN_PASSWORD`, set in Vercel, like
  Springboard). It shows, for each year level and each question, how many tapped 😀, 😐 and 🙁, with
  the total number of children. A "download as spreadsheet" (CSV) button is my call, so Nathan can
  open the numbers in Excel.
- **Trial classes only:** the survey appears only when the app is opened from the trial link
  (`https://wesdlpteam.github.io/writing-sidekick/?trial=1`). Teachers bookmark that link on the
  trial iPads. Every other class sees no change.
- **Privacy page:** one plain line added, saying that in trial classes anonymous survey taps (year
  level, date and the three answers) are counted to see whether the app helps, and nothing that
  identifies a child is kept.

## Approaches considered

1. **Springboard-style Neon database plus a stats page (chosen by Nathan).** Same pattern he already
   uses and knows, everything stays inside the app.
2. A Google Sheet via an Apps Script connector. Easy to read, but a second system to look after.
3. Opening a Microsoft or Google Form at the end. Children leave the app, it is not one-tap, and
   young children struggle. Ruled out.

## Goals and non-goals

- Goal: three one-tap answers from trial students, counted by year level, viewable by Nathan.
- Non-goal: tracking individual children, comparing classes, or measuring writing quality (No More
  Marking covers that).
- Anti-goal: anything that breaks the "keeps nothing personal" promise, or slows a child down at
  the end of the session.

## Left to the builder

- Connecting Neon to the Vercel project needs Nathan to click through Vercel's Neon setup once
  (about two minutes; Claude will give exact steps), unless the Vercel command line can do it.
- Exact card styling, following the existing Mission complete card and the Neo City theme.
