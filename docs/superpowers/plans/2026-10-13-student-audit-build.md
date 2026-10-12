# Student audit build (2026-10-13)

Source: audit report https://claude.ai/artifact/CS2xu7ivam5AfHcDMq2J9g. Nathan approved all 14 ranked
items plus decisions A, B (Marin voice), C (full retake), D (book terms with child definitions),
E (no change: general-to-specific stays Year 5), F, H, and a new first slide. G (planning) is out.

Rules for every stage: no real student writing in fixtures or commits (repo is public); no book text
in the repo (paraphrase only); `npm test` green; browser check at iPad 834x1194 on the mock server
(`node dev-server.mjs --mock --port=<free port>`, never real mode); bump `?v=` tags in index.html for
any changed css/js; Lead (Opus) reviews and commits/pushes. Workers never commit.

## Stage 1: screens part 1 (client only)

Files: js/app.js, js/feedback-visuals.js, js/share-image.js, index.html, css/app.css, privacy.html,
dev-server.mjs (mock payload), tests/feedback-visuals.test.mjs.

1. Idle (A): on #screen-feedback warn at 20 min, clear at 25. Other screens stay 9 + 1 min.
   `?idle=<s>` still shortens both for tests. Update the "ten minutes" wording on the Mission slide
   and in privacy.html to match ("25 minutes on the feedback screens, 10 elsewhere", in kid words
   on the slide).
2. Old iPads (H): no regex lookbehind anywhere in js/ (not js/vendor): withQuotes() has a literal
   `(?<=...)` that stops the whole module parsing before Safari 16.4; sentenceWithWord() builds one at
   runtime. Rewrite both without lookbehind, same behaviour. Replace Object.hasOwn with
   Object.prototype.hasOwnProperty.call. Target: parses on iPadOS 15.
3. Check the typing (13): the lead tells the child to fix only the app's reading mistakes and leave
   their own spelling as it is. Short, Year 1 readable.
4. First slide (Nathan's ask + item 8). Slide renamed "What you did well" (step bar too).
   - Shows up to 3 strengths quoting the child (heroPowers): craft areas first (strength, then
     steady), spelling/punctuation only if fewer than 3 craft entries. Each with its area chip.
   - Then "Your next focus": power-up 1's skill title plus a button "See Power-up 1" that opens the
     power slide. No power-ups: the first next_step area's next step text, no button.
   - The skill chip grid, legend, summary line, key strength / next focus buttons and skill detail
     panel: hidden for Years 1-4. Years 5-6: behind a "See all your writing skills" toggle button,
     closed by default.
   - Remove the "We checked N writing skills. N show strength." count from screen, print and saved
     picture (writingStrength summary). No scores anywhere.
   - Empty fallback if no strengths at all: one kind line, then the next focus.
5. Editing for Years 1-2 (F): editing card shows only Capitals (errorTotals.capital_letters) and
   Full stops (errorTotals.full_stops, new server field, may be missing/null -> "?" + "Not
   available"). Each item gets a how-to-hunt tip. Capitals: check the first word of every sentence,
   names, and the word I. Full stops: read it out loud; where your voice stops and a new idea starts,
   check for a full stop. Years 3-6 unchanged (spelling, punctuation, capitals). Same rule in print and
   saved picture.
6. Word power labels (7): server will now send word_boost.before = the child's exact sentence and
   word_boost.after = a MADE-UP sentence on another topic using a stronger word. Labels become
   "In your writing:" (before, with the swap word in bold if found) and "Like this:" (after).
   Same in print and saved picture.
7. Say it out loud (3): Years 1-3, each power-up step 3 gets a second line: say your new sentence out
   loud to a partner first, then write it.
8. How to change it in your book (4): replace the "Pick up your pencil" card text with 3-4 short
   steps: write a ^ where new words go in and write them above; one neat line through a word you
   swap, new word above; use the space at the end of a line or the next line for a new sentence;
   no need to copy it all out again.
9. Mock (dev-server.mjs): errorTotals gains full_stops; word_boost.after becomes a made-up sentence.

## Stage 2: teaching rules (server only) - starts after the new chapters (5, 6, 10, quotations,
MPO Level 2) are read, and folds in what they change.

Files: api/feedback.js, api/_criteria.js, api/_curriculum.js, api/_twr.js, api/_editing.js,
tests/ (not feedback-visuals.test.mjs), tests/fixtures/.

- Book order (5): per-year rule text for subordinating_conjunction (Years 1-3: After, Before, If,
  When; Year 4+: book order After, Before, If, When, Even though, Although, Whenever, Since, While,
  Unless; minYear 1), transition (Years 2-3: time and sequence, conclusion, illustration; Year 4+
  adds change of direction and emphasis; emphasis words in addition / most importantly / in
  particular), sentence_expansion (Years 1-2: when, where, why), because_but_so (Year 1 because and
  but; so from Year 2). describeMove/movesPrompt become year-aware.
- Book terms (D): "fragment" and "kernel sentence" allowed in child text WITH a short definition the
  first time: fragment = a half sentence that is only part of an idea; kernel sentence = a short
  sentence that makes sense on its own. studentText() stops scrubbing and instead adds the
  definition in brackets to the first undefined use. fragment_fix renamed to the book's term; its
  example becomes a missing-subject or missing-verb fragment (book holds dependent-clause fragments
  back). Update prompts that ban the words; update tests.
- Drop just a failing power-up (6) instead of returning 502; 502 only when none remain.
- Word power (7): before = child's exact sentence; after = made-up sentence on another topic that
  uses one of the ladder words; server nulls `after` if it copies the child's sentence.
- Plain words (9): readingLevel limits also cover strength, next_step, assessment_note for Years
  1-4; list of terms to avoid or explain; fix "joining word" clash.
- Long lines (10): your_line over 25 words shown as its first 18 words + "..."; drop a later
  power-up whose line overlaps an earlier one; challenge sentences trimmed to ~12 words around the
  word.
- Concluding sentences (11): multi-paragraph pieces need one final concluding statement only.
- Busy message (14): an upstream failure while reading says the helper is busy, try again; the
  photo message only for an unreadable/empty result.
- Full stops (F): errorTotals.full_stops = punctuation places involving an end mark (. ! ?).
- Re-run `scripts/quality-eval.mjs <dir> holdouts` with OPENAI_MODEL emptied in-process before push.

Refinements from the new chapters (Ch 5, 6, 10, Incorporating Quotations, MPO Level 2), all as
in-place wording edits (never reorder prompt sections: order is quality-sensitive, see memory):
- Concluding sentence (Ch 6, Ch 10): a single paragraph ends with one; a multi-paragraph piece needs
  topic sentences on body paragraphs and ONE final concluding statement (or a mirror conclusion
  paragraph). A concluding sentence echoes the topic sentence in new words, never word for word,
  may give a point of view or a call to action ("so" can say what should happen), may open with a
  concluding transition, and should not copy the topic sentence's structure. Fix the paragraphing
  guide, the concluding_sentence rule and the skill bank line in api/feedback.js.
- Topic sentence (Ch 6, Ch 10): may state the position/side with reasons in the details, or one
  reason in a multi-paragraph piece. Keep it short. A flat topic sentence can be lifted with a
  sentence type, a subordinating-conjunction start or an appositive (Year 4+), adding words, not
  evidence. A question or exclamation topic sentence is not a defect.
- Never mark down a child's own correct use of a later conjunction or transition (Since, Although,
  On the other hand); the year limits apply only to what the feedback TEACHES.
- Opinion vs argument (Ch 5, Ch 10): Years 1-4 persuasive = opinion: a clear position up front and
  real reasons (a fact, an example or an explanation, not the opinion said again). Personal
  experience counts. Evidence and the other side are stretches, never a next_step, before Year 5.
  Years 5-6 may answer the other side in one "Although ..." sentence or its own paragraph, never
  raise and rebut in the same paragraph. Strongest reason last is a valid Year 3+ structure next
  step. Judge reasons over counting devices. A call-to-action ending is a strength.
- Genre gate (Ch 5): topic_sentence, concluding_sentence, general_to_specific_intro and
  specific_to_general_conclusion are not offered for narrative (stories) or poetry.
- General to specific intro (Year 5, Nathan's call): offer only when the piece is already
  multi-paragraph; introduction at least three sentences, position last; conclusion rewords it.
- paragraph_focus also removes a sentence that only repeats another (still pure deletion).
- Paragraphing: one main idea per paragraph; two main ideas in one paragraph -> split it.
- Transitions also link paragraphs, not only sentences.
- Never supply facts, sources or numbers about the child's own topic.

## Stage 3: screens part 2 (client)

One power-up at a time with "I did it" + "Power-up 1 of 3"; Mission complete becomes a tick list
(line + job per power-up, ticks in memory only) and gains a clear "I'm done" button; Back / Next /
Finish in a bar fixed to the bottom; hero picture becomes a small banner on slides; 44px targets
("What you did well" chips, photo checkbox); space between Back and Read my writing; contrast
(Power-up eyebrow 4.44:1, example arrow 4.07:1); heading levels in order; no wide tracking on body.

## Stage 4: read-aloud (B)

Listen buttons for Years 1-3 only, Marin voice via api/speak.js + js/speech.js (both exist, unused):
what you did well, next focus, each power-up, word power, editing tips, mission list.

## Stage 5: full retake (C)

After Mission complete: "Show me my changes" -> photograph the revised page(s) -> read -> compare
(levelUpFeedback + getLevelUp exist, unused) -> "What got better" screen. Restore from git history
(1294f78 added, a8691c0 removed) and update to today's payload. About 2-3 cents per retake.
