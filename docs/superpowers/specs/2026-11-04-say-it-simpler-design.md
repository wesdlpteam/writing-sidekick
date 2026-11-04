# Say it simpler: design

Date: 2026-11-04. Size: small change.

## Why

In the first trial survey, 4 of 7 children understood their feedback only "a bit" or not at all.
A child who is stuck on a power-up needs an easier way in without starting again.

## What it does

Each power-up card gets a **Say it simpler** button. Tapping it rewords that card in easier words
and makes the job smaller (for example, "Expand sentence 2 with when, where and why" becomes
"Add *when* to sentence 2"). A **Show the first version** link switches back. The child can flip
between the two as often as they like.

## Approaches

1. **Ask the server on tap (chosen by Nathan).** The app sends one card plus the year level and gets
   back a simpler card. It costs something only when a child taps. The child waits a few seconds.
2. Make the simpler version along with the main feedback. Instant, but every child waits longer and
   every request costs more, and the feedback request is already near its time limit.
3. Simplify on the iPad with fixed sentence patterns. Free and instant, but it can't shrink the job
   to fit the child's writing.

## How it works

- **Request:** a new `simplify` request on `/api/feedback` (same pattern as `synonymCheck`):
  year level plus the card's `skill`, `why`, `yourLine`, `rule`, `example`, `nowYou` and strategy
  name. The child's line goes through `minimiseContactDetails` like the other checks. Nothing is stored.
- **What changes:** `why`, `rule`, `example` (a simpler before → after on a fresh sentence that
  matches the smaller job) and `nowYou` (one small job). **What never changes:** `yourLine` (the
  child's own words), the strategy name, and the card's place in the list. The example must still
  never be the child's own line rewritten (same check the main feedback uses).
- **Wording:** one year level easier than `readingLevel()` would give, with a hard limit of one
  short job in `nowYou`.
- **Model:** the quick model the other checks use, reasoning off.
- **On the card:** the button sits under the title, beside the Listen button. While waiting it
  reads "Making it simpler…". Once the simpler version arrives it's kept for the session, so
  switching is instant. If the request fails, the card stays as it was and a friendly line appears.
- **Read-aloud:** reads whichever version is on screen.
- **Teacher print-out:** always shows the first version.
- **Level-up (step 3):** the app sends whichever version was on screen when the child moved on,
  so their revision is judged against the job they actually did. *(My call.)*

## Goals, non-goals and anti-goals

- Goal: a stuck child can understand and do one small step.
- Non-goal: counting taps or adding to the survey. That could come later, but it would need a
  line on the privacy page.
- Anti-goal: the simpler card does the work for the child (rewrites their line), or it drops so
  far below the year level that it stops teaching anything.

## Left to the builder

- The exact prompt wording and the length limits.
- Button styling within the existing card look, including the Years 5–6 senior look.
- Tests: request validation, the rule that the child's line is never rewritten, the fallback when
  the request fails, and switching between versions.
