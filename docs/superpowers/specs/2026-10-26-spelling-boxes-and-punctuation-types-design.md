# Spelling boxes and punctuation types (design, 2026-10-26)

## Intent

The Editing card (Word lab slide, `#practice-card`) shows bare counts: "Spelling: 12", "Punctuation: 6".
A child with 20 spelling errors sees a big number and nothing to do with it. Nathan wants:

1. **Spelling:** a few of the child's own misspelt words, quoted exactly as they wrote them, each with a
   box to have a go at the right spelling. The app checks the attempt and gives a Sounds-Write style hint
   (most sounds right, one sound needs a different spelling). The correct spelling is never shown up front.
2. **Punctuation:** suited to the year level (a Year 2 is never told about speech marks), and broken into
   the kinds of mark that were missed instead of one number.

Why: feedback a child can act on without being overwhelmed, in the language they hear in class
(the school teaches spelling with Sounds-Write).

## Goals

- Years 3-6 see up to **5** spelling words, Years 1-2 up to **3** (Nathan approved 3 for juniors; Years 1-2
  see no spelling today).
- Each word: the child's spelling, the sentence it came from (word in bold, like the synonym challenge's
  "In your writing:" line), a text box and a Check button.
- Right attempt: instant cheer on the iPad, no AI call.
- Wrong attempt (tries 1 and 2): a hint written by the AI in Sounds-Write style about the part that differs.
  The part of the child's attempt that differs is highlighted on screen (worked out on the device).
- Third wrong attempt: show the correct spelling with the tricky part highlighted, and the line
  "Say each sound as you write it in your book." (Nathan approved.)
- Punctuation shown as one line per type, each with its own count, only the types for that year:

  | Year | Types |
  |---|---|
  | 1 | Sentence endings (full stop, question mark, exclamation mark) |
  | 2 | + Commas in lists |
  | 3 | + Apostrophes (contractions and ownership) |
  | 4-6 | + Speech punctuation (speech marks and the comma that goes with speech) |

  Source: Australian Curriculum v9 (`curriculum/english-curriculum-f-6-v9.md`: AC9E1LA10, AC9E2LA10,
  AC9E3LA11, AC9E4LA12). Not from The Writing Revolution, which sets no punctuation sequence.
- A type with zero errors shows as all clear (good news). The "rough guide" note stays.

## Non-goals

- No storing anything (store-nothing stays). No teacher view.
- No change to power-ups, Word power, the synonym challenge, TWR wording or capitals counting (except below).
- The dead level-up `practiceWords` path is not revived.
- No spelling total and no "and 15 more" line: the point is to not overwhelm.

## Anti-goals (a failure even if it works)

- The correct spelling appears anywhere (screen, read-aloud, print, saved picture, AI hint) before the third
  wrong try.
- A child is told about a punctuation type above their year.
- Hints use terms Sounds-Write avoids with children: "magic e", "silent letter", "blend", "digraph",
  "phoneme", "grapheme", letter names as the main cue.
- A misspelt word shown that is really a name, an accepted Australian word, or a reading error ([unclear]).

## Constraints

- Repo is PUBLIC: never commit real student writing; fixtures are invented.
- Sounds-Write wording in our own words only. No Sounds-Write materials copied; name only in attribution
  (README), never a feature name.
- The audit (`api/_editing.js`, `EDITING_RULES`) already returns every spelling and punctuation error with
  `quote`, `occurrence`, `correction`, and `inspectEditing` already verifies each against the transcript.
  Build on that; counts stay computed by code, never by the model.
- The audit's punctuation calls vary between runs, so counts stay "a rough guide".
- Server is stateless, so the check request must carry the word, the correct spelling and the attempt.
  The correct spelling therefore lives in the iPad's memory (never rendered until the reveal). Nathan accepted this.
- iPad Safari, Years 1-6 reading levels (`readingLevel(year)` in `api/_curriculum.js`).
- Every change ships with cache-tag bumps (`?v=`) and is pushed to main (the push is the deploy).

## Approaches

1. **AI checks every attempt** (like the synonym check). Natural hints, ~0.1c and 1-2 s per check, AI may
   occasionally word a sound hint wrong.
2. **iPad checks with fixed rules only.** Instant and free, but English letter-to-sound mapping is too messy
   for rules to name the sound ("thort" vs "thought"), so hints would be clunky.
3. **Both (chosen by Nathan).** The iPad spots a correct answer instantly and works out the differing part.
   Only wrong attempts go to the AI, which writes the hint for that part. The server checks the hint does not
   leak the answer, and falls back to a safe fixed hint if it does.

## Decided how

### Spelling words (server, feedback route)

- Source: verified spelling entries from the audit (a new export from `_editing.js` beside the totals), one
  entry per distinct word. Each item: `{ wrote, correct, sentence }`, `sentence` = the transcript sentence
  holding that occurrence.
- Skip: entries `inspectEditing` rejects; words in the accepted set; quotes that are names (correction starts
  with a capital mid-sentence); corrections with a space or more than one word; changes that are only
  capitals or apostrophes (those belong to other categories); the same word twice (case-insensitive).
- Pick order (my call): words the child misspelt more than once first, then shorter corrections first (a
  stand-in for everyday words), then order of appearance. Cap 3 (Years 1-2) or 5 (Years 3-6).
- Multi-word quotes (the audit allows up to two respelt words per entry): split into per-word
  `{ wrote, correct }` by aligning quote to correction; small extractor with its own tests (my call).
- Payload gains `spellingStatus: "words" | "clear" | "none_to_practise" | "unavailable"` beside the list
  (my call), so honest wording follows: audit failed or `[unclear]` = "We couldn't check spelling this time.
  Read it with your teacher."; zero errors = all clear; errors found but every one skipped = "No spelling
  words to practise this time." (never "all clear"). Read-aloud, print and picture use the same wording.
- Payload gains `spellingWords: [...]`. `errorTotals` stays (print/teacher use may come later) but the
  spelling number is no longer shown.

### Spelling check (new route on `api/feedback.js`)

- Body: `{ yearLevel, spellingCheck: { wrote, correct, attempt, sentence } }`. Bounds like
  `readSynonymCheck`: one word, letters, apostrophes and hyphens, 30 chars max; sentence capped and passed
  through `minimiseContactDetails`.
- Server answers without the AI when attempt == correct (case-insensitive) or attempt == wrote
  ("That's the same spelling as before. Try a different spelling for the highlighted part.").
- Otherwise the server works out the differing part (letter alignment, like `lcsPairs`) and asks the model
  for `{ hint }` with: year, reading level, the word in its sentence, the child's attempt, the correct word,
  the differing part. ~150 output tokens, `reasoning_effort: "none"`.
- Hint prompt rules (own words): talk about sounds and their spellings; say what is right first; point to one
  sound; "one sound can be spelt different ways, what's another way?"; for long words, say it in parts;
  banned terms listed in Anti-goals; never write the correct word or the correct spelling of the sound.
- Guard: reject the hint if it contains the correct word anywhere, or (only when the differing part is two
  or more letters) the letters of the correct spelling for that part as a standalone group, or a banned term
  (my call: a one-letter guard would fire on almost every hint).
- Sound-alike words (Nathan chose: keep them, own hint). A word is `kind: "sound_alike"` when `wrote` and
  `correct` sit in the same group of a small built-in list of common primary homophones (there/their/they're,
  to/too/two, your/you're, where/were/wear, no/know, here/hear, right/write, one/won, for/four, new/knew,
  by/buy, see/sea, our/hour, wood/would, whole/hole, which/witch, piece/peace, meet/meat, tail/tale, and the
  like; builder may extend). For these the hint is about meaning, not sounds: first try gets the fixed hint
  "This word sounds right, but another word sounds the same and is spelt differently. Which one fits this
  sentence?"; the second try gets an AI hint about what the right word means in the sentence, under the same
  leak guard. Pairs that differ only by an apostrophe (its/it's) are punctuation, not spelling, as today.
- "Same as before" counts as a try (my call). A retake makes a new payload, so spelling state resets. Fallback fixed hint: "Most of your sounds are right.
  Look at the highlighted part. Which other spelling could make that sound?"
- Dev mock in `dev-server.mjs`, like the synonym mock.

### Spelling UI (client)

- New "Spelling" block in the Editing card, modelled on `#challenge-list`: per word the child's spelling,
  "In your writing:" sentence with the word in bold, input + Check, a result line (`role="status"`).
- Right: green cheer, box locks. Wrong: hint + highlight the differing part of their attempt. Third wrong:
  reveal the correct word with the tricky part highlighted + "Say each sound as you write it in your book."
- Read-aloud (Years 1-3): reads the instructions and hints, never the misspelt word or the correct word
  before the reveal (my call: TTS would mispronounce or give the answer away).
- Mission tick for editing stays; its wording may mention the spelling words.

### Punctuation types

- Each verified punctuation place gets a type: `end_marks` (. ! ? missing, wrong, doubled, or misplaced),
  `list_commas`, `apostrophes`, `speech` (speech marks, and a comma between speech and its speaker).
  Derive from the marks that change; where a comma is ambiguous, a speech mark in the same quote means
  `speech`. The builder may add an optional `type` field to the audit if derivation proves unreliable.
- Totals become per type; the existing `full_stops` key is kept as the sentence-endings count. Types above the year are dropped before
  counting. Below Year 4, capital errors on the first word inside speech marks are dropped too.
- Display: one row per year-appropriate type with a short how-to-hunt tip (all years, own words), count +
  caption, all clear at zero. Capitals row stays.

### Everywhere else

- Print and saved picture: spelling words as the child wrote them, each with a blank line to write it
  (my call), then the punctuation type rows. Never the correct spelling.
- `editingSpoken`, `editingLines`, `missionRows`, README feature notes updated to match.
- Tests: word selection and skips, type classification, year filtering, hint guard (leak + banned terms),
  check route bounds, no-AI paths. Browser check at iPad size with screenshots via the mock server.

## Left to the builder

- Exact copy for tips, captions and fixed hints (within the rules above and `readingLevel`).
- Layout details within the existing Editing card style (invoke `impeccable:impeccable` for the UI work).
- Whether type derivation needs the optional audit `type` field.
