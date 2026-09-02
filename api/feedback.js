import { getYearGuide, getGenreGuide, FEEDBACK_RULES } from "./_curriculum.js";

// The AI work happens in two steps so each call has one job:
//   1. photos -> transcript      (vision model, image detail "original", strict copy rules)
//   2. checked transcript -> feedback (curriculum-guided, improvement-first)
// The child checks and fixes the transcript between the two steps.

const MAX_PAGES = 4;
const MAX_IMAGE_CHARS = 6_000_000; // ~4.4MB of base64 data per page
const DEFAULT_FEEDBACK_MODEL = "gpt-5.4";
const DEFAULT_TRANSCRIBE_MODEL = "gpt-5.4";
const CHILD_SAFE_ERROR =
  "Hmm, I had trouble reading that photo. Try taking it again with the page flat and in good light.";

const TRANSCRIBE_RULES = `You are transcribing a primary-school child's handwriting from photos of their page or pages. Your only job is a faithful, letter-for-letter transcript. Never correct, tidy or improve anything. You are not giving feedback.
Rules:
1. Copy every word exactly as written, including every misspelling. If the page says "famly", write "famly", never "family".
2. Punctuation and capital letters: copy every mark the child made, exactly where they made it: apostrophes (don't, Mum's, it's), commas, full stops, question marks, exclamation marks, quotation marks and hyphens. Look carefully above and between letters for small marks, because an apostrophe is easy to miss. Never add punctuation or capitals the child did not write, and never remove any they did.
3. Crossed-out words: anything crossed out, scribbled over or struck through was deleted by the child. Leave it out completely and never mention it. If a replacement is written above, beside or after it, use the replacement.
4. Insertions: a word added above the line with a caret (^), an arrow or an asterisk goes where the child pointed.
5. Keep the child's line breaks: one line of transcript per line of handwriting. When a sentence carries on to the next line or the next page, just keep going.
6. If there are several photos, they are pages of the same piece of writing, in order. Transcribe page 1, then page 2, and so on, with one blank line between pages.
7. Ignore anything that is not the child's writing: printed headings, ruled lines, page numbers, a teacher's marks or comments in a different pen, stickers or stamps.
8. If a word is truly unreadable, write your single best guess. Do not use brackets, question marks or notes: the child will check the transcript afterwards.
Respond with ONLY a JSON object in exactly this shape: { "transcript": "the full transcript, using \\n for line breaks" }
If nothing on the page can be read at all, use { "transcript": "" }.`;

// What the research on feedback says works, boiled down for the model: answer "where to next?",
// stay specific to the task, model the improvement instead of just naming it, and leave the
// child something to do. The skill bank keeps the advice concrete and age-appropriate.
const FEEDBACK_PRINCIPLES = `What good feedback looks like (follow this): it answers "where to next?", it is specific to this piece of writing, it shows the improvement done well rather than just naming it, and it leaves the child with something small to do straight away.

Skill bank to choose power-ups from (pick only what fits this piece, year and genre; never list them all):
- Sentence openers: start with a time word, a where phrase, an -ing word or a feeling instead of "I" or "Then" every time.
- Sentence variety: mix a short punchy sentence with a longer one; join two short sentences with because, but, so, when or although.
- Show, don't tell: replace "I was scared" with what your body did or what you saw.
- Sensory details: what you saw, heard, smelt, felt or tasted at the exact moment.
- Strong verbs and precise nouns: "went" -> "sprinted", "thing" -> "rusty gate".
- Expanded noun groups and precise adjectives, not just "big" and "nice".
- Dialogue with speech marks, and how it was said (Year 3 and up).
- Paragraphs: a new one for a new time, place, person or idea (Year 3 and up); topic sentence first in information and persuasive texts.
- Openings that hook (a question, a sound, action, dialogue) and endings that resolve or reflect.
- Cohesion: time and sequence words (first, later, meanwhile), pronouns instead of repeating a name.
- Figurative language: simile, metaphor, personification (Year 3 and up); onomatopoeia and alliteration (Years 1 and 2).
- Persuasive: a clear position, reasons with evidence or examples, emotive and modal words, talking to the reader.
- Information: heading, facts, technical words, present tense, general nouns.
- Poems: images, repetition, rhythm and line breaks.
- Punctuation for effect: question marks, exclamation marks, commas in lists, ellipsis, as suits the year.
- Years 1 and 2 basics: capital letters and full stops in the right places, joining words "and" and "because", describing words, sound words.
- Years 5 and 6 stretch: complex sentences with the clause order changed for effect, modality, formal register, figurative language, paragraph cohesion, editing out repetition.`;

const OUTPUT_SPEC = `The child has already checked the typed copy of their writing, so treat it as exactly what they wrote. Respond with ONLY a JSON object in exactly this shape:
{
  "stars": [
    { "quote": "the child's exact words that show the strength", "skill": "the skill they used, named, and why it works here (one or two sentences)" },
    { "quote": "...", "skill": "..." }
  ],
  "power_ups": [
    {
      "skill": "short child-friendly name, e.g. 'Add what you could hear and smell'",
      "why": "one or two sentences on why this will lift THIS piece, pointing at their writing",
      "your_line": "one exact sentence or phrase copied from the child's writing where this skill belongs",
      "try_this": "that same line rewritten to show the skill done well, keeping the child's ideas, voice and year level",
      "now_you": "a tiny task the child can do right now on their own writing, e.g. 'Find your sentence about the waves and add one sound you heard.'"
    }
  ],
  "detail": {
    "ideas": "one specific strength and one specific improvement about ideas and content, quoting the writing",
    "structure": "one specific strength and one specific improvement about text structure and sentences, quoting the writing",
    "vocabulary": "one specific strength and one specific improvement about word choice, quoting the writing",
    "spelling": "one specific strength and one specific improvement about spelling and punctuation, quoting the writing"
  },
  "practice_words": [ { "correct": "family", "wrote": "famly" } ],
  "spelling_tip": "one spelling generalisation, or empty string",
  "word_boost": {
    "swaps": [ { "from": "big", "to": ["enormous", "towering"] } ],
    "before": "one exact sentence the child wrote",
    "after": "that moment rewritten to show real word power, e.g. before: 'The waves were huge and I got dumped!' after: 'The gigantic waves crashed over me and dumped me in the sand!'"
  }
}
Rules for stars: exactly 2. "quote" must be copied from the child's writing. "skill" names what they did (for example "You used a time word, 'After that', to link your events") so they can do it again on purpose.
Rules for power_ups: 2 or 3, the most useful first. Choose from the skill bank. "your_line" must be copied from the child's writing, and each power-up should use a different line where the writing allows it (and a different line from word_boost's "before"). "try_this" must keep the child's meaning, be correct natural English a teacher would accept, and be something a child of this year level could realistically write. "now_you" must be one short, concrete task on their own writing, not a general habit. Power-ups are writing-craft skills only: never use a power-up for spelling, handwriting or fixing a single punctuation slip, because those belong in practice_words and detail.spelling.
Rules for practice_words: only genuinely misspelt words the child actually wrote (never punctuation or grammar slips); at most 5, choosing the words most worth learning at this year level (everyday high-frequency words first); "correct" is the right spelling, "wrote" is exactly what the child wrote. Use [] if spelling is all correct.
Rules for spelling_tip: one child-friendly spelling generalisation only if it genuinely fits two or more of the practice words (for example "When you add -ing to a word ending in e, drop the e: make -> making", or "Say tricky words in syllables: fam-i-ly"). Word it so a child of this year level can read it. Use "" if no pattern fits.
Rules for word_boost: pick 1-3 plain words the child actually wrote that could be stronger; for each, suggest 1-3 richer but year-appropriate alternatives. "before" must be one exact sentence copied from the child's writing (their spelling and all). "after" must be a genuine rewrite of that sentence, not just a one-word swap: use at least one suggested word AND show what strong writing looks like by upgrading the verb, restructuring, or adding one vivid detail, while keeping the child's meaning, voice and year level. The gap between before and after should make the child think "wow, I could write like that". Use null if their word choices are already strong.
Be very specific everywhere: every comment must quote or point to actual words, phrases or sentences from this child's writing, never generic advice that could apply to anyone's work.`;

const text = (value) => (typeof value === "string" ? value.trim() : "");

function validateFeedback(data) {
  if (!data || typeof data !== "object") return null;

  const stars = (Array.isArray(data.stars) ? data.stars : [])
    .map((s) => (s && typeof s === "object" ? { quote: text(s.quote), skill: text(s.skill) } : null))
    .filter((s) => s && s.skill)
    .slice(0, 3);
  if (stars.length < 1) return null;

  const powerUps = (Array.isArray(data.power_ups) ? data.power_ups : [])
    .map((p) =>
      p && typeof p === "object"
        ? { skill: text(p.skill), why: text(p.why), yourLine: text(p.your_line), tryThis: text(p.try_this), nowYou: text(p.now_you) }
        : null,
    )
    .filter((p) => p && p.skill && p.why && p.tryThis)
    .slice(0, 3);
  if (powerUps.length < 1) return null;

  const detail = data.detail;
  if (!detail || typeof detail !== "object") return null;
  for (const key of ["ideas", "structure", "vocabulary", "spelling"]) {
    if (!text(detail[key])) return null;
  }

  const practiceWords = (Array.isArray(data.practice_words) ? data.practice_words : [])
    .filter((w) => w && typeof w === "object" && text(w.correct) && text(w.wrote))
    .slice(0, 5)
    .map((w) => ({ correct: text(w.correct), wrote: text(w.wrote) }));

  let wordBoost = null;
  const boost = data.word_boost;
  if (boost && typeof boost === "object") {
    const swaps = (Array.isArray(boost.swaps) ? boost.swaps : [])
      .filter((s) => s && typeof s === "object" && text(s.from) && Array.isArray(s.to))
      .map((s) => ({ from: text(s.from), to: s.to.map(text).filter(Boolean).slice(0, 3) }))
      .filter((s) => s.to.length > 0)
      .slice(0, 3);
    if (swaps.length) {
      wordBoost = { swaps, before: text(boost.before), after: text(boost.after) };
    }
  }

  return {
    stars,
    powerUps,
    detail: {
      ideas: text(detail.ideas),
      structure: text(detail.structure),
      vocabulary: text(detail.vocabulary),
      spelling: text(detail.spelling),
    },
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
async function callModel({ fetchImpl, apiKey, body, fallback }) {
  let response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
  if (!response.ok) {
    if (response.status === 400 && fallback) return callModel({ fetchImpl, apiKey, body: fallback });
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
    apiKey: env.OPENAI_API_KEY,
    body: buildBody("original", true),
    fallback: buildBody("high", false),
  });
  const data = extractJson(content);
  if (!data || typeof data.transcript !== "string") {
    return { status: 502, payload: { error: CHILD_SAFE_ERROR } };
  }
  return { status: 200, payload: { transcript: data.transcript.trim() } };
}

async function feedbackForTranscript({ transcript, yearLevel, genre, env, fetchImpl }) {
  const systemPrompt = [
    FEEDBACK_RULES,
    `Year level expectations to judge against:\n${getYearGuide(yearLevel).summary}`,
    getGenreGuide(genre),
    FEEDBACK_PRINCIPLES,
    OUTPUT_SPEC,
  ]
    .filter(Boolean)
    .join("\n\n");

  const content = await callModel({
    fetchImpl,
    apiKey: env.OPENAI_API_KEY,
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
      max_completion_tokens: 2400,
    },
  });

  const payload = validateFeedback(extractJson(content));
  if (!payload) {
    return { status: 502, payload: { error: CHILD_SAFE_ERROR } };
  }
  return { status: 200, payload: { transcript, ...payload } };
}

export async function handleFeedback(body, { fetchImpl, env }) {
  const yearLevel = Number(body?.yearLevel);
  if (!Number.isInteger(yearLevel) || yearLevel < 1 || yearLevel > 6) {
    return { status: 400, payload: { error: "Please choose a year level from 1 to 6." } };
  }

  const images = collectImages(body);
  const transcript = text(body?.transcript);
  if (!images.length && !transcript) {
    return { status: 400, payload: { error: "Please take a photo of your writing first." } };
  }
  if (images.length > MAX_PAGES) {
    return { status: 400, payload: { error: "You can send up to four pages at a time." } };
  }
  for (const image of images) {
    if (typeof image !== "string" || !image.startsWith("data:image/")) {
      return { status: 400, payload: { error: "That photo didn't come through properly. Please try again." } };
    }
    if (image.length > MAX_IMAGE_CHARS) {
      return { status: 413, payload: { error: "That photo is too big. Please try taking it again." } };
    }
  }

  if (!env?.OPENAI_API_KEY) {
    return { status: 500, payload: { error: "The app isn't set up yet. Please tell your teacher." } };
  }

  if (images.length) return transcribePages({ images, env, fetchImpl });
  return feedbackForTranscript({ transcript, yearLevel, genre: body?.genre, env, fetchImpl });
}

// The student-facing site is hosted on GitHub Pages; only that origin may call this function
// from a browser. Same-origin calls (the Vercel copy of the site) need no CORS headers.
const ALLOWED_ORIGINS = new Set(["https://wesdlpteam.github.io"]);

function applyCors(req, res) {
  const origin = req.headers?.origin;
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export default async function handler(req, res) {
  applyCors(req, res);
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const { status, payload } = await handleFeedback(req.body, {
    fetchImpl: fetch,
    env: process.env,
  });
  res.status(status).json(payload);
}
