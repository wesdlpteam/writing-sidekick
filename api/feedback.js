import { getYearGuide, getGenreGuide, FEEDBACK_RULES } from "./_curriculum.js";
import { criteriaFor, criteriaPrompt, movesPrompt, describeMove, STATUSES } from "./_criteria.js";
import { handlePreamble } from "./_cors.js";
import { apiUrl, fetchWithTimeout } from "./_provider.js";
import { minimiseContactDetails } from "./_privacy.js";

// The AI work happens in two steps so each call has one job:
//   1. photos -> transcript      (vision model, image detail "original", strict copy rules)
//   2. checked transcript -> feedback (curriculum-guided, improvement-first)
// The child checks and fixes the transcript between the two steps.

const MAX_PAGES = 4;
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
2. Punctuation and capital letters: copy every mark the child made, exactly where they made it: apostrophes (don't, Mum's, it's), commas, full stops, question marks, exclamation marks, quotation marks and hyphens. Look carefully above and between letters for small marks, because an apostrophe is easy to miss. Never add punctuation or capitals the child did not write, and never remove any they did.
3. Crossed-out words: before you copy each word, check whether a line, scribble or cross runs through it. A word with any line through it, even one thin line, was deleted by the child and is not part of the writing. Write every crossed-out word wrapped in double tildes, like ~~famly~~, so it can be removed. Crossed-out words often look like misspellings: they still get the tildes, never a correction. If a replacement is written above, beside or after it, write the replacement as a normal word.
4. Insertions: a word added above the line with a caret (^), an arrow or an asterisk goes where the child pointed.
5. Keep the child's line breaks: one line of transcript per line of handwriting. When a sentence carries on to the next line or the next page, just keep going.
6. If there are several photos, they are pages of the same piece of writing, in order. Transcribe page 1, then page 2, and so on, with one blank line between pages.
7. Ignore anything that is not the child's writing: printed headings, ruled lines, page numbers, a teacher's marks or comments in a different pen, stickers or stamps.
8. If a word is truly unreadable, write your single best guess. Do not use brackets, question marks or notes: the child will check the transcript afterwards.
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

Skill bank to choose power-ups from (pick only what fits this piece, year and genre; never list them all). The school teaches writing one sentence at a time with these moves, so reach for them first:
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

const outputSpec = (powerUpCount) => `The child has already checked the typed copy of their writing, so treat it as exactly what they wrote. Respond with ONLY a JSON object in exactly this shape:
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
      "skill": "short child-friendly name, e.g. 'Add what you could hear and smell'",
      "why": "one or two sentences on why this will lift THIS piece, pointing at their writing",
      "your_line": "one exact sentence or phrase copied from the child's writing where this skill belongs",
      "try_this": "that same line rewritten to show the skill done well, keeping the child's ideas, voice and year level",
      "move": "a key from the writing moves list when try_this clearly shows that move, otherwise null",
      "now_you": "a tiny task the child can do right now on their own writing, e.g. 'Find your sentence about the waves and add one sound you heard.'"
    }
  ],
  "practice_words": [ { "correct": "family", "wrote": "famly" } ],
  "spelling_tip": "one spelling generalisation, or empty string",
  "word_boost": {
    "swaps": [ { "from": "big", "to": ["enormous", "towering"] } ],
    "before": "one exact sentence the child wrote",
    "after": "that moment rewritten to show real word power, e.g. before: 'The waves were huge and I got dumped!' after: 'The gigantic waves crashed over me and dumped me in the sand!'"
  }
}
Rules for areas: include an entry for every area key listed above (and only those keys). "strength" quotes the child's actual words and names the skill (for example "You used a transition word, 'After that', to link your events") so they can do it again on purpose; use "" only when the area shows nothing yet. "next_step" is one concrete sentence a child of this year could act on today, never generic advice.
Rules for power_ups: ${powerUpCount}, the most useful first, each lifting a DIFFERENT area whose status is steady or next_step, so the "area" keys must all differ and match the area list. Choose from the skill bank. "your_line" must be copied from the child's writing, and each power-up should use a different line where the writing allows it (and a different line from word_boost's "before"). "try_this" must keep the child's meaning, be correct natural English a teacher would accept, and be something a child of this year level could realistically write; wherever it fits, shape it with one of the writing moves listed and name that move in "move". "now_you" must be one short, concrete task on their own writing that uses the move (often: find the other places in your writing where this move fits and use it there too), not a general habit. Power-ups are writing-craft skills only: never use a power-up for spelling or handwriting, and use one for punctuation only when it is a pattern across the piece (such as punctuating speech), never a single slip, because those belong in practice_words and the spelling and punctuation areas.
Rules for practice_words: only genuinely misspelt words the child actually wrote (never punctuation or grammar slips); at most 5, choosing the words most worth learning at this year level (everyday high-frequency words first); "correct" is the right spelling, "wrote" is exactly what the child wrote. Use [] if spelling is all correct.
Rules for spelling_tip: one child-friendly spelling generalisation only if it genuinely fits two or more of the practice words (for example "When you add -ing to a word ending in e, drop the e: make -> making", or "Say tricky words in syllables: fam-i-ly"). Word it so a child of this year level can read it. Use "" if no pattern fits.
Rules for word_boost: pick 1-3 plain words the child actually wrote that could be stronger; for each, suggest 1-3 richer but year-appropriate alternatives. "before" must be one exact sentence copied from the child's writing (their spelling and all). "after" must be a genuine rewrite of that sentence, not just a one-word swap: use at least one suggested word AND show what strong writing looks like by upgrading the verb, restructuring, or adding one vivid detail, while keeping the child's meaning, voice and year level. The gap between before and after should make the child think "wow, I could write like that". Use null if their word choices are already strong.
Be very specific everywhere: every comment must quote or point to actual words, phrases or sentences from this child's writing, never generic advice that could apply to anyone's work.`;

// Step 3: the child revised in their book and photographed the new version. Compare the two,
// celebrate what really changed, name the power-ups and spelling fixes that show up, and leave
// one gentle next step. Nothing may be claimed that is not in the new version.
const LEVEL_UP_SPEC = `A child was given power-ups (revising moves) and spelling words to practise on a piece of writing. They went back to their book, made changes, and photographed the new version. You are given the ORIGINAL writing, the power-ups and practice words they were given, and the NEW writing. Your job is positive, specific reinforcement for what they actually changed, in a warm coach's voice, worded so a child of this year level can read it themselves.
Rules:
1. Compare the two versions carefully. Only celebrate changes that are really there in the NEW version and were not in the original. Never claim a change that did not happen.
2. For each real improvement give a short "what" (for example "Power-up 1 used: Expand your sentence", "Spelling fixed: family", "New detail added", "Two sentences joined") and "evidence": the exact new words copied from the NEW writing, one sentence or phrase. If a power-up's move appears, say which power-up.
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
    if (!p || typeof p !== "object" || !text(p.skill) || !text(p.why) || !text(p.try_this)) continue;
    // Spelling is editing, never a power-up; each area carries at most one power-up.
    if (p.area === "spelling" || powerUps.some((q) => q.area && q.area === p.area)) continue;
    const area = knownKeys.has(p.area) ? p.area : "";
    powerUps.push({
      area,
      areaLabel: area ? criteria.find((c) => c.key === area).label : "",
      skill: text(p.skill),
      why: text(p.why),
      yourLine: quoteFromTranscript(p.your_line, transcript),
      tryThis: text(p.try_this),
      move: describeMove(p.move, yearLevel),
      nowYou: text(p.now_you),
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
      .map((s) => ({ from: text(s.from), to: s.to.map(text).filter(Boolean).slice(0, 3) }))
      .filter((s) => s.to.length > 0 && hasWord(transcript, s.from))
      .slice(0, 3);
    if (swaps.length) {
      // The "before" sentence must be the child's own; without it there is no "after" either.
      const before = quoteFromTranscript(boost.before, transcript);
      wordBoost = { swaps, before, after: before ? text(boost.after) : "" };
    }
  }

  return {
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
    yearLevel <= 2
      ? `This writer is in Year ${yearLevel}: keep every sentence you write under 12 words, use everyday words only, and keep the whole feedback short.`
      : "",
    outputSpec(yearLevel <= 2 ? "1 or 2" : "2 or 3"),
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
    return { error: "That is a lot of writing for one go. Please send up to four pages at a time." };
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
  const systemPrompt = [`Year level of the writer, for tone and expectations:\n${getYearGuide(yearLevel).summary}`, LEVEL_UP_SPEC].join("\n\n");
  const powerUpLines = levelUp.powerUps.map(
    (p, i) => `${i + 1}. ${p.skill}${p.area ? ` (${p.area})` : ""}.${p.tryThis ? ` Try this: ${p.tryThis}` : ""}${p.nowYou ? ` Now you: ${p.nowYou}` : ""}${p.move ? ` Move: ${p.move}` : ""}`,
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

export async function handleFeedback(body, { fetchImpl, env }) {
  const yearLevel = Number(body?.yearLevel);
  if (!Number.isInteger(yearLevel) || yearLevel < 1 || yearLevel > 6) {
    return { status: 400, payload: { error: "Please choose a year level from 1 to 6." } };
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
    return { status: 400, payload: { error: "You can send up to four pages at a time." } };
  }
  const BAD_PHOTO = { status: 400, payload: { error: "That photo didn't come through properly. Please try again." } };
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
    return { status: 400, payload: { error: "That is a lot of writing for one go. Please send up to four pages at a time." } };
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
