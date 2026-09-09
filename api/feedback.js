import { getYearGuide, getGenreGuide, FEEDBACK_RULES, readingLevel } from "./_curriculum.js";
import { criteriaFor, criteriaPrompt, movesPrompt, describeMove, STATUSES } from "./_criteria.js";
import { handlePreamble } from "./_cors.js";
import { apiUrl, fetchWithTimeout } from "./_provider.js";
import { minimiseContactDetails } from "./_privacy.js";

// The AI work happens in two steps so each call has one job:
//   1. photos -> transcript      (vision model, image detail "original", strict copy rules)
//   2. checked transcript -> feedback (curriculum-guided, improvement-first)
// The child checks and fixes the transcript between the two steps.

const MAX_PAGES = 2;
const MAX_IMAGE_CHARS = 6_000_000; // ~4.4MB of base64 data per page
const MAX_TOTAL_IMAGE_CHARS = 4_500_000; // the whole request must fit the host's 4.5MB limit
const MAX_TRANSCRIPT_CHARS = 20_000;
const UPSTREAM_TIMEOUT_MS = 60_000;
const DEFAULT_FEEDBACK_MODEL = "gpt-5.4";
const DEFAULT_TRANSCRIBE_MODEL = "gpt-5.4";
const PHOTO_ERROR = "Hmm, I had trouble reading that photo. Try taking it again with the page flat and in good light.";
const FEEDBACK_ERROR = "Hmm, I couldn't put your feedback together that time. Please try again.";

const TRANSCRIBE_RULES = `You are transcribing a primary-school child's handwriting from photos of their page or pages. Your only job is a faithful, letter-for-letter transcript. Never correct, tidy or improve anything. You are not giving feedback.
Rules:
1. Copy every word exactly as written, including every misspelling. If the page says "famly", write "famly", never "family".
2. Punctuation and capital letters: copy every mark the child made, exactly where they made it: apostrophes (don't, Mum's, it's), commas, full stops, question marks, exclamation marks, quotation marks and hyphens. Look carefully above and between letters for small marks, because an apostrophe is easy to miss. Never add punctuation or capitals the child did not write, and never remove any they did. Cues that get this right:
   - A mark before a word that starts with a capital letter is a full stop, not a comma, even when it has a small tail: children often turn a comma into a full stop when they fix a sentence.
   - Check the very end of every sentence and every paragraph for a small full stop, especially at the end of a line, where it is easy to miss.
   - The paper's printed ruled lines, including their dots and dashes, are not punctuation, and neither are smudges or the tails of letters. Only write a comma where there is a clear pencil comma right after the word.
   - Look at letter height to decide capitals, especially the first word of a paragraph and the word after a full stop.
3. Letters that are cramped, small or joined are still there. Before you write a word as misspelt, look at the whole word again and count its letters: a squeezed 'r' in 'smarter' is not a missing letter. Keep genuine misspellings exactly. Two words written touching each other are still two words: write them with a space between (coveredby is 'covered by'). When a letter is ambiguous, choose the reading that makes a real word fitting the sentence (now or no, than or then), but never fix a word that is clearly written wrong.
4. Crossed-out words: before you copy each word, check whether a line, scribble or cross runs through it. A word with any line through it, even one thin line, was deleted by the child and is not part of the writing. Write every crossed-out word wrapped in double tildes, like ~~famly~~, so it can be removed. Crossed-out words often look like misspellings: they still get the tildes, never a correction. If a replacement is written above, beside or after it, write the replacement as a normal word.
5. Insertions: a word or letter added above the line with a caret (^), an arrow or an asterisk goes where the child pointed (a single letter written above a word belongs inside that word).
6. Reflow physical handwriting lines into continuous paragraphs: use a space, not a newline, when the child simply reached the edge of the page. Preserve genuine paragraph boundaries, including indented new paragraphs, using a blank line (two newline characters). Keep standalone headings and deliberate list items separate with blank lines too. Never invent paragraph boundaries or change the child's words, spelling, punctuation or capitals. When a sentence carries on to the next line, just keep going.
7. If there are several photos, they are pages of the same piece of writing, in order. Transcribe page 1, then page 2, and so on, with one blank line between pages.
8. Ignore anything that is not the child's writing: printed headings, ruled lines, page numbers, a teacher's marks or comments in a different pen, stickers or stamps.
9. If a word is truly unreadable, write your single best guess. Do not use brackets, question marks or notes: the child will check the transcript afterwards.
10. The photo may be sideways or upside down. Work out which way the handwriting runs and read it that way, in the order the child wrote it; never give up on a page because of how it was held.
Respond with ONLY a JSON object in exactly this shape: { "transcript": "the full transcript, using \\n for line breaks, with crossed-out words as ~~word~~" }
If nothing on the page can be read at all, use { "transcript": "" }.`;

// The model marks crossed-out words as ~~word~~ (marking is far more reliable than asking it
// to leave them out). The child deleted them, so they leave the transcript here. A line that
// was entirely crossed out goes too; blank lines (page breaks) and untouched lines stay as is.
export function dropCrossedOut(transcript) {
  const lines = [];
  for (const line of transcript.split("\n")) {
    if (!line.includes("~~")) {
      lines.push(line);
      continue;
    }
    const kept = line
      .replace(/[ \t]*~~[^~\n]*~~/g, "")
      .replace(/[ \t]*~~/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    if (kept) lines.push(kept);
  }
  return lines.join("\n");
}

// What the research on feedback says works, boiled down for the model: answer "where to next?",
// stay specific to the task, model the improvement instead of just naming it, and leave the
// child something to do. The skill bank keeps the advice concrete and age-appropriate.
const FEEDBACK_PRINCIPLES = `What good feedback looks like (follow this): it answers "where to next?", it is specific to this piece of writing, it shows the improvement done well rather than just naming it, and it leaves the child with something small to do straight away.

Skill bank to choose power-ups from (pick only what fits this piece, year and genre; never list them all). The school teaches writing one sentence at a time with these strategies, so reach for them first:
- Because, but, so: finish a thin sentence with a reason, a turn or a result.
- Subordinating conjunction start: Although, When, Since, After, Before, If, Even though, then a comma, then the rest.
- Sentence expansion: take a bare kernel sentence and add when, where, why or how (the when usually at the front with a comma).
- Sentence combining: join choppy short sentences with and, but, because, so, a pronoun or a describing phrase.
- Transition words between sentences and paragraphs: time and sequence (First, Later, Finally), illustration (For example), change of direction (However), conclusion (Therefore, In the end), emphasis (In fact).
- Appositives (Year 4 and up): a describing phrase between commas straight after a person or thing.
- Topic sentence first and concluding sentence last in a paragraph (Year 3 and up); a new paragraph for each new time, place, idea or reason.
- Sentence types: swap in a question, a command or an exclamation for effect.
- Vary vocabulary: exact verbs and nouns instead of went, got, big, nice, said.
Other craft that still matters:
- Show, don't tell: replace "I was scared" with what your body did or what you saw.
- Sensory details: what you saw, heard, smelt, felt or tasted at the exact moment.
- Dialogue with speech marks, and how it was said (Year 3 and up).
- Openings that hook (a question, a sound, action, dialogue) and endings that resolve or reflect.
- Figurative language: simile, metaphor, personification (Year 3 and up); onomatopoeia and alliteration (Years 1 and 2).
- Persuasive: a clear position, reasons with evidence or examples, emotive and modal words, talking to the reader.
- Information: heading, facts, technical words, present tense, general nouns.
- Poems: images, repetition, rhythm and line breaks.
- Punctuation for effect: question marks, exclamation marks, commas in lists, ellipsis, as suits the year.
- Years 1 and 2 basics: capital letters and full stops in the right places, the conjunctions "and", "but", "so" and "because", describing words, sound words.
- Years 5 and 6 stretch: complex sentences with the clause order changed for effect, modality, formal register, figurative language, paragraph cohesion, editing out repetition.`;

// The synonym challenge (type your own synonym, get it checked) starts in Year 2.
const CHALLENGE_MIN_YEAR = 2;

const outputSpec = (powerUpCount, { challenge }) => `The child has already checked the typed copy of their writing, so treat it as exactly what they wrote. Respond with ONLY a JSON object in exactly this shape:
{
  "headline": "one or two friendly sentences from the sidekick: the single best thing about this piece (quote it) and the one change that would lift it most",
  "areas": {
    "<area key>": {
      "status": "strength" | "steady" | "next_step",
      "strength": "one sentence naming what you did well in this area, quoting your exact words, or \\"\\" if there is nothing yet",
      "next_step": "one sentence: the most useful specific thing to do next in this area, pointing at your writing"
    }
  },
  "power_ups": [
    {
      "area": "the area key this power-up lifts",
      "skill": "the job in four to six child-friendly words, e.g. 'Finish the big moment'",
      "why": "ONE short sentence: what your_line already does well, then what this strategy will add",
      "your_line": "one exact sentence or phrase copied from the child's writing where this skill belongs",
      "move": "the key of the writing strategy the task asks the child to use on that line, or null if none of the listed strategies fits",
      "rule": "one short line telling the child how to do that strategy on this kind of sentence, e.g. 'Finish the sentence with so and say what happened next.'",
      "example_before": "a NEW sentence you make up that is like the child's line (same kind of sentence, same weakness, similar length) but about something else and using none of their words",
      "example_after": "that same made-up sentence with the strategy in rule done to it, at the child's year level",
      "now_you": "the job as one short instruction (under 15 words) to do on your_line, e.g. 'Add so to your line and say what happened next.' Do not repeat the line."
    }
  ],
  "error_totals": { "spelling": 0, "punctuation": 0, "capital_letters": 0 },
  "word_boost": {
    "swaps": [ { "from": "big", "to": ["large", "huge", "enormous", "colossal"] } ],
    "before": "one exact sentence the child wrote",
    "after": "that moment rewritten to show real word power, e.g. before: 'The waves were huge and I got dumped!' after: 'The gigantic waves crashed over me and dumped me in the sand!'",
    "challenge": ["three", "other", "words"]
  }
}
Rules for areas: include an entry for every area key listed above (and only those keys). "strength" quotes the child's actual words and names the skill (for example "You used a transition word, 'After that', to link your events") so they can do it again on purpose; use "" only when the area shows nothing yet. Be generous and honest with strengths: every real thing the child did well deserves naming, because the child sees these. "next_step" is one concrete sentence a child of this year could act on today, never generic advice.
Rules for power_ups: ${powerUpCount}, the most useful first, each lifting a DIFFERENT area whose status is steady or next_step, so the "area" keys must all differ and match the area list. Choose from the skill bank. Every part of a power-up is about ONE line and ONE strategy: "why", "rule", the example and "now_you" all use the strategy named in "move" on the line in "your_line", so the child never has to hold two sentences or two ideas at once. Name in "move" the strategy the task actually asks for: a task to split a long sentence is never sentence_combining, and a task to add a transition is transition. "why" opens with something genuinely good about the line before saying what the strategy adds, so the child hears what to keep. "your_line" must be copied from the child's writing, and each power-up should use a different line where the writing allows it (and a different line from word_boost's "before"). "example_before" and "example_after" show the strategy on a sentence LIKE the child's, never on the child's own sentence: do not rewrite "your_line" and do not reuse its words, because the child must improve their own line themselves. "example_after" must keep every idea of "example_before", be correct natural English a teacher would accept, and be something a child of this year level could realistically write. "now_you" is one short, concrete instruction to use the strategy on their own line (they can then use it in the other places it fits), never a general habit. Power-ups are writing-craft skills only: never use a power-up for spelling or handwriting, and use one for punctuation only when it is a pattern across the piece (such as punctuating speech), never a single slip, because those belong in error_totals.
Rules for error_totals: inspect the WHOLE transcript and return non-negative integer totals for ALL errors, with no five-error limit. Count each occurrence, including repeated misspellings. "spelling" counts misspelt words, excluding case-only errors and apostrophe errors. "punctuation" counts missing, incorrect or unnecessary punctuation marks (including apostrophes), excluding capital letters. "capital_letters" counts missing or unnecessary capitals. Count a single error in only one category. Do not count crossed-out writing, [unclear] text, acceptable Australian English spellings or deliberate poetic choices as errors. Return 0 when a category has no errors. Students must find the errors themselves: do not list incorrect words, corrections, locations or spelling tips anywhere in the feedback. In the spelling and punctuation areas, give general checking strategies without pointing out the errors; this overrides the requirement to quote specific errors. Keep writing-craft examples focused on their chosen strategy.
Rules for word_boost: pick 1 or 2 plain words the child actually wrote that could be stronger; for each, give EXACTLY 4 synonyms that genuinely upgrade it, in order from the simplest to the most sophisticated, each one a step up from the last, all true synonyms in the child's sentence, with the last one a stretch word for this year level. "before" must be one exact sentence copied from the child's writing (their spelling and all). "after" must be a genuine rewrite of that sentence, not just a one-word swap: use at least one suggested word AND show what strong writing looks like by upgrading the verb, restructuring, or adding one vivid detail, while keeping the child's meaning, voice and year level. The gap between before and after should make the child think "wow, I could write like that". ${challenge ? `"challenge" lists 3 OTHER plain words the child wrote (not the swap words) that have good synonyms a child of this year could think of themselves; the child will type their own synonym for each and have it checked. Use [] if the writing has no suitable words.` : `"challenge" must be [] for this Year 1 writer.`} Use null for word_boost only if their word choices are already strong.
Be very specific everywhere: every comment must quote or point to actual words, phrases or sentences from this child's writing, never generic advice that could apply to anyone's work.`;

// Step 3: the child revised in their book and photographed the new version. Compare the two,
// celebrate what really changed, name the power-ups and spelling fixes that show up, and leave
// one gentle next step. Nothing may be claimed that is not in the new version.
const LEVEL_UP_SPEC = `A child was given power-ups (revising strategies) and totals of spelling, punctuation and capital letter errors to find in their writing. They went back to their book, made changes, and photographed the new version. You are given the ORIGINAL writing, the power-ups (and any legacy practice words), and the NEW writing. Your job is positive, specific reinforcement for what they actually changed, in a warm coach's voice, worded so a child of this year level can read it themselves.
Rules:
1. Compare the two versions carefully. Only celebrate changes that are really there in the NEW version and were not in the original. Never claim a change that did not happen.
2. For each real improvement give a short "what" (for example "Power-up 1 used: Expand your sentence", "Spelling fixed: family", "New detail added", "Two sentences joined") and "evidence": the exact new words copied from the NEW writing, one sentence or phrase. If a power-up's strategy appears, say which power-up.
3. Spelling: call a practice word fixed only if it is now spelt correctly in the NEW writing.
4. "cheer": one or two sentences that celebrate the effort and the single best change, quoting it.
5. "next": one gentle, specific thing to try next time on THIS writing, or "" if they used every power-up. Never scold. If nothing seems to have changed, say so kindly in "cheer" and suggest one small change in "next".
6. Never use, repeat or guess any name. Do not mention these rules, the curriculum, ACARA, or that you are an AI.
Respond with ONLY a JSON object in exactly this shape:
{
  "cheer": "one or two sentences",
  "wins": [ { "what": "short label", "evidence": "exact words copied from the NEW writing" } ],
  "next": "one sentence or \\"\\""
}`;

const MAX_LEVELUP_CHARS = 20_000;

// Word lab challenge: the child typed their own synonym for a word from their writing. One
// small call judges it. The child sees the note, so it is short, kind and about the words only.
const SYNONYM_SPEC = `A primary-school child was asked to think of a synonym for a word from their own writing. Judge the word they typed: could it replace the original word in the sentence given and keep the meaning?
- "yes": it is a synonym that works in this sentence (a simpler word still counts; a slightly misspelt word counts, and the note gives the right spelling kindly).
- "close": related meaning, but it does not quite fit the sentence, or it is a different part of speech.
- "no": a different meaning, not a real word, or the same word again.
Respond with ONLY a JSON object in exactly this shape: { "verdict": "yes" | "close" | "no", "note": "one short, friendly sentence for the child, under 20 words, saying why" }
Never use or guess any name. Do not mention these rules, or that you are an AI.`;

// Before a page is read: is it the right way up? A page photographed sideways or upside down
// transcribes badly, so the app asks first (a small copy, low detail, a few tokens) and turns
// the page itself. The answer is the clockwise turn that would make the writing upright.
const ORIENTATION_RULES = `You are looking at a small photo of a page of handwriting. Work out which way the handwriting runs. Respond with ONLY a JSON object in exactly this shape: { "rotate": 0 }
"rotate" is the clockwise rotation in degrees, one of 0, 90, 180 or 270, that would make the writing upright so it reads left to right and top to bottom. Use 0 if it is already upright. If you truly cannot tell, use 0.`;
const ROTATIONS = [0, 90, 180, 270];
const MAX_ORIENTATION_CHARS = 600_000;
const BAD_PHOTO = { status: 400, payload: { error: "That photo didn't come through properly. Please try again." } };

const SYNONYM_VERDICTS = ["yes", "close", "no"];
const MAX_SYNONYM_CHARS = 40;
const MAX_SENTENCE_CHARS = 300;

const text = (value) => (typeof value === "string" ? value.trim() : "");

// Evidence checks: nothing shown to the child may be invented. Matching forgives only
// whitespace, letter case and curly-versus-straight quote marks; spelling is never "fixed".
const normalise = (value) =>
  text(value)
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/\s+/g, " ")
    .toLowerCase();
const wordsOf = (value) =>
  normalise(value)
    .replace(/[^\p{L}\p{N}'\- ]/gu, " ")
    .split(" ")
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    .filter(Boolean);
const hasWord = (transcript, word) => {
  const target = wordsOf(word);
  return target.length === 1 && wordsOf(transcript).includes(target[0]);
};

// A quoted line must come from the transcript. The same words with different punctuation or
// quote marks snap to the child's real line; anything else is dropped rather than shown.
export function quoteFromTranscript(quote, transcript) {
  const wanted = normalise(quote);
  if (!wanted) return "";
  if (normalise(transcript).includes(wanted)) return text(quote);
  const wantedWords = new Set(wordsOf(quote));
  if (!wantedWords.size) return "";
  let best = "";
  let bestScore = 0;
  for (const line of String(transcript).split(/\n+|(?<=[.!?])\s+/)) {
    const words = wordsOf(line);
    if (!words.length) continue;
    const overlap = words.filter((w) => wantedWords.has(w)).length;
    const score = overlap / Math.max(wantedWords.size, words.length);
    if (score > bestScore) {
      bestScore = score;
      best = line.trim();
    }
  }
  return bestScore >= 0.75 ? best : "";
}

// The first sentence of the child's writing that uses this word, for showing a challenge word
// in context and for judging the synonym they type. "" if the word is not there.
export function sentenceWith(transcript, word) {
  const target = wordsOf(word)[0];
  if (!target) return "";
  for (const line of String(transcript).split(/\n+|(?<=[.!?])\s+/)) {
    if (wordsOf(line).includes(target)) return line.trim().slice(0, MAX_SENTENCE_CHARS);
  }
  return "";
}

// A power-up's example must be a fresh sentence, not the child's own line handed back to them
// (they would copy it straight into their book). Same words, changed punctuation, or the
// child's line buried inside a longer one all count as copies.
// A strategy label must match the job it sits beside. The one contradiction seen in the wild:
// "split this long sentence" labelled as sentence combining (its opposite). Better no label
// than a wrong one.
const SPLIT_TASK = /\b(split|break (?:it |this |that |the sentence )?up|separate|shorter sentences|two or three (?:clearer |shorter )?sentences)\b/i;
export function moveFitsTask(moveKey, ...texts) {
  if (moveKey === "sentence_combining" && texts.some((t) => SPLIT_TASK.test(String(t || "")))) return false;
  return true;
}

const wordRun = (value) => ` ${wordsOf(value).join(" ")} `;
const containsRun = (haystack, needle) => needle.trim() !== "" && wordRun(haystack).includes(wordRun(needle));
function copiesLine(example, yourLine) {
  const lineWords = wordsOf(yourLine);
  const words = wordsOf(example);
  if (!lineWords.length || !words.length) return false;
  if (containsRun(example, yourLine) || containsRun(yourLine, example)) return true;
  const lineSet = new Set(lineWords);
  const overlap = words.filter((w) => lineSet.has(w)).length;
  return overlap / Math.max(lineSet.size, words.length) >= 0.75;
}

// The data URL must hold a real JPEG, PNG or WebP (the app always sends JPEG). The first few
// bytes say which, without decoding the whole image.
function looksLikeImage(dataUrl) {
  const comma = dataUrl.indexOf(",");
  if (comma === -1 || !dataUrl.slice(0, comma).includes(";base64")) return false;
  const head = Buffer.from(dataUrl.slice(comma + 1, comma + 25), "base64");
  if (head.length < 4) return false;
  const jpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const png = head[0] === 0x89 && head.toString("latin1", 1, 4) === "PNG";
  const webp = head.length >= 12 && head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WEBP";
  return jpeg || png || webp;
}

// Fewer valid areas than this means the model did not really do the job.
const MIN_AREAS = 7;

// Turns the model's JSON into the shape the app renders, or null when it is unusable.
// `areas` is the list from criteriaFor(genre); the genre slot may offer two keys, of which
// the first one present is kept.
function validateFeedback(data, { areas, yearLevel, transcript }) {
  if (!data || typeof data !== "object") return null;

  const raw = data.areas && typeof data.areas === "object" ? data.areas : {};
  const criteria = [];
  let slotFilled = false;
  for (const area of areas) {
    if (area.choice && slotFilled) continue;
    const entry = raw[area.key];
    if (!entry || typeof entry !== "object") continue;
    const status = STATUSES.includes(entry.status) ? entry.status : "steady";
    const strength = text(entry.strength);
    const nextStep = text(entry.next_step);
    if (!strength && !nextStep) continue;
    criteria.push({ key: area.key, label: area.label, sub: area.sub, status, strength, nextStep, powerUp: null });
    if (area.choice) slotFilled = true;
  }
  if (criteria.length < MIN_AREAS) return null;

  const knownKeys = new Set(criteria.map((c) => c.key));
  const powerUps = [];
  for (const p of Array.isArray(data.power_ups) ? data.power_ups : []) {
    if (!p || typeof p !== "object" || !text(p.skill) || !text(p.why)) continue;
    // Spelling is editing, never a power-up; each area carries at most one power-up.
    if (p.area === "spelling" || powerUps.some((q) => q.area && q.area === p.area)) continue;
    const area = knownKeys.has(p.area) ? p.area : "";
    const yourLine = quoteFromTranscript(p.your_line, transcript);
    // The worked example is a sentence like theirs. If the model rewrote their own line after
    // all, the example goes; the strategy note still carries its own example.
    const before = text(p.example_before);
    const after = text(p.example_after);
    const fresh = before && after && !copiesLine(before, yourLine) && !copiesLine(after, yourLine)
      && !containsRun(transcript, after);
    const skill = text(p.skill);
    const nowYou = text(p.now_you);
    const move = moveFitsTask(p.move, skill, nowYou, p.rule) ? describeMove(p.move, yearLevel) : null;
    powerUps.push({
      area,
      areaLabel: area ? criteria.find((c) => c.key === area).label : "",
      skill,
      why: text(p.why),
      yourLine,
      // The one-line how-to for this job; the strategy's general rule stands in if it is missing.
      rule: text(p.rule) || move?.rule || "",
      example: fresh ? { before, after } : null,
      move,
      nowYou,
    });
    if (powerUps.length === 3) break;
  }
  if (powerUps.length < 1) return null;
  powerUps.forEach((p, index) => {
    const c = p.area && criteria.find((x) => x.key === p.area);
    if (c && c.powerUp === null) c.powerUp = index + 1;
  });

  const headline = text(data.headline) || `${powerUps[0].skill}. ${powerUps[0].why}`;

  // Only words the child actually wrote, and only when they really are misspelt.
  const practiceWords = (Array.isArray(data.practice_words) ? data.practice_words : [])
    .filter((w) => w && typeof w === "object" && text(w.correct) && text(w.wrote))
    .map((w) => ({ correct: text(w.correct), wrote: text(w.wrote) }))
    .filter((w) => hasWord(transcript, w.wrote) && normalise(w.wrote) !== normalise(w.correct))
    .slice(0, 5);

  let wordBoost = null;
  const boost = data.word_boost;
  if (boost && typeof boost === "object") {
    const swaps = (Array.isArray(boost.swaps) ? boost.swaps : [])
      .filter((s) => s && typeof s === "object" && text(s.from) && Array.isArray(s.to))
      .map((s) => ({ from: text(s.from), to: s.to.map(text).filter(Boolean).slice(0, 4) }))
      .filter((s) => s.to.length > 0 && hasWord(transcript, s.from))
      .slice(0, 3);
    if (swaps.length) {
      // The "before" sentence must be the child's own; without it there is no "after" either.
      const before = quoteFromTranscript(boost.before, transcript);
      // Challenge words: the child's own words, not the swap words, shown with their sentence.
      const taken = new Set(swaps.map((s) => normalise(s.from)));
      const challenge = [];
      for (const raw of Array.isArray(boost.challenge) && yearLevel >= CHALLENGE_MIN_YEAR ? boost.challenge : []) {
        const word = text(raw);
        const key = normalise(word);
        if (!word || wordsOf(word).length !== 1 || taken.has(key) || !hasWord(transcript, word)) continue;
        taken.add(key);
        challenge.push({ word, sentence: sentenceWith(transcript, word) });
        if (challenge.length === 3) break;
      }
      wordBoost = { swaps, before, after: before ? text(boost.after) : "", challenge };
    }
  }

  return {
    errorTotals: Object.fromEntries(["spelling", "punctuation", "capital_letters"].map((key) => {
      const value = data.error_totals?.[key];
      return [key, Number.isSafeInteger(value) && value >= 0 ? value : null];
    })),
    headline,
    criteria,
    powerUps,
    practiceWords,
    spellingTip: text(data.spelling_tip),
    wordBoost,
  };
}

function extractJson(content) {
  if (typeof content !== "string") return null;
  const unfenced = content.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  for (const candidate of [unfenced, content]) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      // try next candidate
    }
  }
  return null;
}

// Calls the model and returns the message content, or null on any failure.
// `fallback`, if given, is tried once when the first request is rejected as a bad request,
// which is what an older model returns for settings it does not know.
async function callModel({ fetchImpl, env, body, fallback }) {
  let response;
  try {
    response = await fetchWithTimeout(
      fetchImpl,
      apiUrl(env, "chat/completions"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify(body),
      },
      UPSTREAM_TIMEOUT_MS,
    );
  } catch {
    return null;
  }
  if (!response.ok) {
    if (response.status === 400 && fallback) return callModel({ fetchImpl, env, body: fallback });
    return null;
  }
  try {
    const data = await response.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

function collectImages(body) {
  if (Array.isArray(body?.images)) return body.images;
  if (typeof body?.image === "string" && body.image) return [body.image];
  return [];
}

async function transcribePages({ images, env, fetchImpl }) {
  const intro =
    images.length === 1
      ? "Here is a photo of my handwriting. Type it out exactly as I wrote it, even my mistakes."
      : `Here are ${images.length} photos of my handwriting, in page order. Type it all out exactly as I wrote it, even my mistakes.`;
  const buildBody = (detail, withVerbosity) => ({
    model: env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_TRANSCRIBE_MODEL,
    messages: [
      { role: "system", content: TRANSCRIBE_RULES },
      {
        role: "user",
        content: [
          { type: "text", text: intro },
          ...images.map((url) => ({ type: "image_url", image_url: { url, detail } })),
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 3000,
    ...(withVerbosity ? { verbosity: "high" } : {}),
  });

  const content = await callModel({
    fetchImpl,
    env,
    body: buildBody("original", true),
    fallback: buildBody("high", false),
  });
  const data = extractJson(content);
  if (!data || typeof data.transcript !== "string") {
    return { status: 502, payload: { error: PHOTO_ERROR } };
  }
  return { status: 200, payload: { transcript: dropCrossedOut(data.transcript).trim() } };
}

// A failed or unclear check answers "no turn" rather than an error: reading must never be
// blocked by the helper, and the child still has the Rotate button.
async function detectOrientation({ image, env, fetchImpl }) {
  const content = await callModel({
    fetchImpl,
    env,
    body: {
      model: env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_TRANSCRIBE_MODEL,
      messages: [
        { role: "system", content: ORIENTATION_RULES },
        {
          role: "user",
          content: [
            { type: "text", text: "Which way up is this page?" },
            { type: "image_url", image_url: { url: image, detail: "low" } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 400,
    },
  });
  const data = extractJson(content);
  return { status: 200, payload: { rotate: ROTATIONS.includes(data?.rotate) ? data.rotate : 0 } };
}

async function feedbackForTranscript({ transcript, yearLevel, genre, env, fetchImpl }) {
  const kind = typeof genre === "string" ? genre : "";
  const areas = criteriaFor(kind);
  const systemPrompt = [
    FEEDBACK_RULES,
    `Year level expectations to judge against:\n${getYearGuide(yearLevel).summary}`,
    getGenreGuide(kind),
    criteriaPrompt(kind),
    FEEDBACK_PRINCIPLES,
    movesPrompt(yearLevel),
    readingLevel(yearLevel),
    outputSpec(yearLevel <= 2 ? "1 or 2" : "2 or 3", { challenge: yearLevel >= CHALLENGE_MIN_YEAR }),
  ]
    .filter(Boolean)
    .join("\n\n");

  const content = await callModel({
    fetchImpl,
    env,
    body: {
      model: env.OPENAI_MODEL || DEFAULT_FEEDBACK_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Here is my writing (I checked the typed version myself). Please give me feedback that helps me improve it:\n\n${transcript}`,
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 3600,
    },
  });

  const payload = validateFeedback(extractJson(content), { areas, yearLevel, transcript });
  if (!payload) {
    return { status: 502, payload: { error: FEEDBACK_ERROR } };
  }
  return { status: 200, payload: { transcript, ...payload } };
}

// Reads and bounds a level-up request; returns { error } for a bad one.
function readLevelUp(raw) {
  if (!raw || typeof raw !== "object") return { error: "Take a photo of your new writing first." };
  const before = text(raw.before);
  const after = text(raw.after);
  if (!after) return { error: "The typing box is empty. Take the photo again, or type your writing in." };
  if (before.length > MAX_LEVELUP_CHARS || after.length > MAX_LEVELUP_CHARS) {
    return { error: "That is a lot of writing for one go. Please send up to two pages at a time." };
  }
  const powerUps = (Array.isArray(raw.powerUps) ? raw.powerUps : [])
    .filter((p) => p && typeof p === "object" && text(p.skill))
    .slice(0, 3)
    .map((p) => ({
      skill: text(p.skill).slice(0, 200),
      area: text(p.area).slice(0, 60),
      tryThis: text(p.tryThis).slice(0, 600),
      nowYou: text(p.nowYou).slice(0, 400),
      move: text(p.move).slice(0, 80),
    }));
  const practiceWords = (Array.isArray(raw.practiceWords) ? raw.practiceWords : [])
    .filter((w) => w && typeof w === "object" && text(w.correct) && text(w.wrote))
    .slice(0, 5)
    .map((w) => ({ correct: text(w.correct).slice(0, 60), wrote: text(w.wrote).slice(0, 60) }));
  return { before, after, powerUps, practiceWords };
}

// Which practice words are now right: the correct spelling is in the new writing and the old
// misspelling has gone. Checked here, not taken on trust from the model.
const spellingFixed = (levelUp) =>
  levelUp.practiceWords.filter((w) => hasWord(levelUp.after, w.correct) && !hasWord(levelUp.after, w.wrote)).map((w) => w.correct);

function validateLevelUp(data, levelUp) {
  if (!data || typeof data !== "object") return null;
  const cheer = text(data.cheer);
  if (!cheer) return null;
  const beforeNorm = normalise(levelUp.before);
  const wins = (Array.isArray(data.wins) ? data.wins : [])
    .map((w) => (w && typeof w === "object" ? { what: text(w.what), evidence: quoteFromTranscript(w.evidence, levelUp.after) } : null))
    // A win needs new words: in the new version, and not already in the old one.
    .filter((w) => w && w.what && w.evidence && !beforeNorm.includes(normalise(w.evidence)))
    .slice(0, 4);
  return { cheer, wins, spellingFixed: spellingFixed(levelUp), next: text(data.next) };
}

async function levelUpFeedback({ levelUp, yearLevel, env, fetchImpl }) {
  if (normalise(levelUp.before) === normalise(levelUp.after)) {
    return {
      status: 200,
      payload: {
        cheer: "This looks the same as your first version. Did your changes go into your book? Snap the page with your changes on it and I will take another look.",
        wins: [],
        spellingFixed: spellingFixed(levelUp),
        next: "",
      },
    };
  }
  const systemPrompt = [`Year level of the writer, for tone and expectations:\n${getYearGuide(yearLevel).summary}`, readingLevel(yearLevel), LEVEL_UP_SPEC].join("\n\n");
  const powerUpLines = levelUp.powerUps.map(
    (p, i) => `${i + 1}. ${p.skill}${p.area ? ` (${p.area})` : ""}.${p.tryThis ? ` Try this: ${p.tryThis}` : ""}${p.nowYou ? ` Now you: ${p.nowYou}` : ""}${p.move ? ` Strategy: ${p.move}` : ""}`,
  );
  const userText = [
    `ORIGINAL writing:\n${levelUp.before || "(none)"}`,
    `Power-ups they were given:\n${powerUpLines.join("\n") || "(none)"}`,
    `Spelling to practise: ${levelUp.practiceWords.map((w) => `${w.correct} (they wrote ${w.wrote})`).join(", ") || "(none)"}`,
    `NEW writing:\n${levelUp.after}`,
  ].join("\n\n");

  const content = await callModel({
    fetchImpl,
    env,
    body: {
      model: env.OPENAI_MODEL || DEFAULT_FEEDBACK_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: [{ type: "text", text: userText }] },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 900,
    },
  });
  const payload = validateLevelUp(extractJson(content), levelUp);
  if (!payload) return { status: 502, payload: { error: "Hmm, I couldn't compare your two versions that time. Please try again." } };
  return { status: 200, payload };
}

// Reads and bounds a synonym check; returns { error } for a bad one. Words only: a word or
// two, letters, hyphens and apostrophes, so nothing else can ride along into the prompt.
const WORDISH = /^[\p{L}][\p{L}'\-]*(?: [\p{L}][\p{L}'\-]*){0,2}$/u;
function readSynonymCheck(raw) {
  if (!raw || typeof raw !== "object") return { error: "Type a word first." };
  const word = text(raw.word);
  const attempt = text(raw.attempt);
  if (!attempt) return { error: "Type a word first." };
  if (word.length > MAX_SYNONYM_CHARS || attempt.length > MAX_SYNONYM_CHARS) return { error: "That is a long one. A synonym is just a word or two." };
  if (!WORDISH.test(word) || !WORDISH.test(attempt)) return { error: "Just letters, please: type one word (or two)." };
  return { word, attempt, sentence: text(raw.sentence).slice(0, MAX_SENTENCE_CHARS) };
}

function validateSynonym(data) {
  if (!data || typeof data !== "object" || !SYNONYM_VERDICTS.includes(data.verdict)) return null;
  return { verdict: data.verdict, note: text(data.note) };
}

async function synonymCheck({ check, yearLevel, env, fetchImpl }) {
  if (normalise(check.attempt) === normalise(check.word)) {
    return { status: 200, payload: { verdict: "no", note: "That is the same word. Try a different one that means the same thing." } };
  }
  const systemPrompt = [`The child is in Year ${yearLevel}.`, readingLevel(yearLevel), SYNONYM_SPEC].join("\n\n");
  const userText = [
    `Word from the writing: ${check.word}`,
    check.sentence ? `The sentence it is in: ${check.sentence}` : "",
    `The child's synonym: ${check.attempt}`,
  ].filter(Boolean).join("\n");
  const content = await callModel({
    fetchImpl,
    env,
    body: {
      model: env.OPENAI_MODEL || DEFAULT_FEEDBACK_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: [{ type: "text", text: userText }] },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 150,
    },
  });
  const payload = validateSynonym(extractJson(content));
  if (!payload) return { status: 502, payload: { error: "Hmm, I couldn't check that word just now. Please try again." } };
  return { status: 200, payload };
}

export async function handleFeedback(body, { fetchImpl, env }) {
  const yearLevel = Number(body?.yearLevel);
  if (!Number.isInteger(yearLevel) || yearLevel < 1 || yearLevel > 6) {
    return { status: 400, payload: { error: "Please choose a year level from 1 to 6." } };
  }

  if (body?.orientation !== undefined) {
    const image = typeof body.orientation?.image === "string" ? body.orientation.image : "";
    if (!image.startsWith("data:image/")) return BAD_PHOTO;
    if (image.length > MAX_ORIENTATION_CHARS) {
      return { status: 413, payload: { error: "That photo is too big. Please try taking it again." } };
    }
    if (!looksLikeImage(image)) return BAD_PHOTO;
    if (!env?.OPENAI_API_KEY) {
      return { status: 500, payload: { error: "The app isn't set up yet. Please tell your teacher." } };
    }
    return detectOrientation({ image, env, fetchImpl });
  }

  if (body?.synonymCheck !== undefined) {
    if (yearLevel < CHALLENGE_MIN_YEAR) return { status: 400, payload: { error: "The synonym challenge starts in Year 2." } };
    const check = readSynonymCheck(body.synonymCheck);
    if (check.error) return { status: 400, payload: { error: check.error } };
    if (!env?.OPENAI_API_KEY) {
      return { status: 500, payload: { error: "The app isn't set up yet. Please tell your teacher." } };
    }
    return synonymCheck({ check: { ...check, sentence: minimiseContactDetails(check.sentence) }, yearLevel, env, fetchImpl });
  }

  if (body?.levelUp !== undefined) {
    const levelUp = readLevelUp(body.levelUp);
    if (levelUp.error) return { status: 400, payload: { error: levelUp.error } };
    if (!env?.OPENAI_API_KEY) {
      return { status: 500, payload: { error: "The app isn't set up yet. Please tell your teacher." } };
    }
    return levelUpFeedback({
      levelUp: { ...levelUp, before: minimiseContactDetails(levelUp.before), after: minimiseContactDetails(levelUp.after) },
      yearLevel,
      env,
      fetchImpl,
    });
  }

  const images = collectImages(body);
  const transcript = text(body?.transcript);
  if (!images.length && !transcript) {
    return { status: 400, payload: { error: "Please take a photo of your writing first." } };
  }
  if (images.length > MAX_PAGES) {
    return { status: 400, payload: { error: "You can send up to two pages at a time." } };
  }
  let totalChars = 0;
  for (const image of images) {
    if (typeof image !== "string" || !image.startsWith("data:image/")) return BAD_PHOTO;
    if (image.length > MAX_IMAGE_CHARS) {
      return { status: 413, payload: { error: "That photo is too big. Please try taking it again." } };
    }
    totalChars += image.length;
  }
  if (totalChars > MAX_TOTAL_IMAGE_CHARS) {
    return { status: 413, payload: { error: "Those photos are too big to send together. Please try one page at a time." } };
  }
  if (!images.every(looksLikeImage)) return BAD_PHOTO;
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    return { status: 400, payload: { error: "That is a lot of writing for one go. Please send up to two pages at a time." } };
  }

  if (!env?.OPENAI_API_KEY) {
    return { status: 500, payload: { error: "The app isn't set up yet. Please tell your teacher." } };
  }

  if (images.length) return transcribePages({ images, env, fetchImpl });
  return feedbackForTranscript({ transcript: minimiseContactDetails(transcript), yearLevel, genre: body?.genre, env, fetchImpl });
}

export default async function handler(req, res) {
  if (handlePreamble(req, res)) return;
  const { status, payload } = await handleFeedback(req.body, {
    fetchImpl: fetch,
    env: process.env,
  });
  res.status(status).json(payload);
}
