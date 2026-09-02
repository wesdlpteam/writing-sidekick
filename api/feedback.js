import { getYearGuide, getGenreGuide, FEEDBACK_RULES } from "./_curriculum.js";

const MAX_IMAGE_CHARS = 6_000_000; // ~4.4MB of base64 data
const CHILD_SAFE_ERROR =
  "Hmm, I had trouble reading that photo. Try taking it again with the page flat and in good light.";

const OUTPUT_SPEC = `Respond with ONLY a JSON object in exactly this shape:
{
  "transcript": "the child's writing transcribed letter-for-letter with their line breaks. Copy every misspelling exactly as written: if the page says 'famly' the transcript must say 'famly', never 'family'. Silently fixing spelling here is a serious error - misspellings belong in the transcript AND in practice_words.",
  "stars": ["specific strength 1", "specific strength 2", "optional specific strength 3"],
  "wish": "the single most useful next step, worded for the child",
  "detail": {
    "ideas": "1-3 sentences on ideas and content",
    "structure": "1-3 sentences on text structure and sentences",
    "vocabulary": "1-3 sentences on word choice",
    "spelling": "1-3 sentences on spelling and punctuation"
  },
  "practice_words": [ { "correct": "family", "wrote": "famly" } ],
  "spelling_tip": "one spelling generalisation, or empty string",
  "word_boost": {
    "swaps": [ { "from": "big", "to": ["enormous", "towering"] } ],
    "before": "one exact sentence the child wrote",
    "after": "that moment rewritten to show real word power, e.g. before: 'The waves were huge and I got dumped!' after: 'The gigantic waves crashed over me and dumped me in the sand!'"
  }
}
Rules for practice_words: only genuinely misspelt words the child actually wrote (never punctuation or grammar slips); at most 5, choosing the words most worth learning at this year level (everyday high-frequency words first); "correct" is the right spelling, "wrote" is exactly what the child wrote. Use [] if spelling is all correct.
Rules for spelling_tip: one child-friendly spelling generalisation only if it genuinely fits two or more of the practice words (for example "When you add -ing to a word ending in e, drop the e: make -> making", or "Say tricky words in syllables: fam-i-ly"). Word it so a child of this year level can read it. Use "" if no pattern fits.
Rules for word_boost: pick 1-3 plain words the child actually wrote that could be stronger; for each, suggest 1-3 richer but year-appropriate alternatives. "before" must be one exact sentence copied from the child's writing (their spelling and all). "after" must be a genuine rewrite of that sentence, not just a one-word swap: use at least one suggested word AND show what strong writing looks like by upgrading the verb, restructuring, or adding one vivid detail, while keeping the child's meaning, voice and year level. The gap between before and after should make the child think "wow, I could write like that". Use null if their word choices are already strong.
Be very specific everywhere: every comment in detail must quote or point to actual words, phrases or sentences from this child's writing, never generic advice that could apply to anyone's work.
If the writing is unreadable, set transcript to "" and explain kindly in the wish that a clearer photo is needed.`;

function validatePayload(data) {
  if (!data || typeof data !== "object") return null;
  const { transcript, stars, wish, detail } = data;
  if (typeof transcript !== "string") return null;
  if (!Array.isArray(stars) || stars.length < 2 || stars.length > 3) return null;
  if (!stars.every((s) => typeof s === "string" && s.trim())) return null;
  if (typeof wish !== "string" || !wish.trim()) return null;
  if (!detail || typeof detail !== "object") return null;
  for (const key of ["ideas", "structure", "vocabulary", "spelling"]) {
    if (typeof detail[key] !== "string" || !detail[key].trim()) return null;
  }
  const practiceWords = (Array.isArray(data.practice_words) ? data.practice_words : [])
    .filter(
      (w) =>
        w &&
        typeof w === "object" &&
        typeof w.correct === "string" &&
        w.correct.trim() &&
        typeof w.wrote === "string" &&
        w.wrote.trim(),
    )
    .slice(0, 5)
    .map((w) => ({ correct: w.correct.trim(), wrote: w.wrote.trim() }));

  let wordBoost = null;
  const boost = data.word_boost;
  if (boost && typeof boost === "object") {
    const swaps = (Array.isArray(boost.swaps) ? boost.swaps : [])
      .filter((s) => s && typeof s === "object" && typeof s.from === "string" && s.from.trim() && Array.isArray(s.to))
      .map((s) => ({
        from: s.from.trim(),
        to: s.to.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim()).slice(0, 3),
      }))
      .filter((s) => s.to.length > 0)
      .slice(0, 3);
    if (swaps.length) {
      wordBoost = {
        swaps,
        before: typeof boost.before === "string" ? boost.before.trim() : "",
        after: typeof boost.after === "string" ? boost.after.trim() : "",
      };
    }
  }

  return {
    transcript,
    stars: stars.map((s) => s.trim()),
    wish: wish.trim(),
    detail: {
      ideas: detail.ideas.trim(),
      structure: detail.structure.trim(),
      vocabulary: detail.vocabulary.trim(),
      spelling: detail.spelling.trim(),
    },
    practiceWords,
    spellingTip: typeof data.spelling_tip === "string" ? data.spelling_tip.trim() : "",
    wordBoost,
  };
}

function extractJson(text) {
  if (typeof text !== "string") return null;
  const unfenced = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  for (const candidate of [unfenced, text]) {
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

export async function handleFeedback(body, { fetchImpl, env }) {
  const yearLevel = Number(body?.yearLevel);
  if (!Number.isInteger(yearLevel) || yearLevel < 1 || yearLevel > 6) {
    return { status: 400, payload: { error: "Please choose a year level from 1 to 6." } };
  }

  const image = typeof body?.image === "string" ? body.image : "";
  const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : "";
  if (!image && !transcript) {
    return { status: 400, payload: { error: "Please take a photo of your writing first." } };
  }
  if (image && !image.startsWith("data:image/")) {
    return { status: 400, payload: { error: "That photo didn't come through properly. Please try again." } };
  }
  if (image.length > MAX_IMAGE_CHARS) {
    return { status: 413, payload: { error: "That photo is too big. Please try taking it again." } };
  }

  const apiKey = env?.OPENAI_API_KEY;
  if (!apiKey) {
    return { status: 500, payload: { error: "The app isn't set up yet. Please tell your teacher." } };
  }

  const genreGuide = getGenreGuide(body?.genre);
  const systemPrompt = [
    FEEDBACK_RULES,
    `Year level expectations to judge against:\n${getYearGuide(yearLevel).summary}`,
    genreGuide,
    OUTPUT_SPEC,
  ]
    .filter(Boolean)
    .join("\n\n");

  const userContent = image
    ? [
        {
          type: "text",
          text: "Here is a photo of my handwriting. Please read it and give me feedback. Type my writing exactly as I wrote it, even my mistakes.",
        },
        { type: "image_url", image_url: { url: image, detail: "high" } },
      ]
    : [
        {
          type: "text",
          text: `Here is my writing (I checked the typed version myself). Please give me feedback on it:\n\n${transcript}`,
        },
      ];

  const requestBody = {
    model: env?.OPENAI_MODEL || "gpt-5.4-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 1400,
  };

  let response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch {
    return { status: 502, payload: { error: CHILD_SAFE_ERROR } };
  }

  if (!response.ok) {
    return { status: 502, payload: { error: CHILD_SAFE_ERROR } };
  }

  let content;
  try {
    const data = await response.json();
    content = data?.choices?.[0]?.message?.content;
  } catch {
    return { status: 502, payload: { error: CHILD_SAFE_ERROR } };
  }

  const payload = validatePayload(extractJson(content));
  if (!payload) {
    return { status: 502, payload: { error: CHILD_SAFE_ERROR } };
  }

  // Regeneration keeps the child's checked transcript as the source of truth.
  if (!image && transcript) payload.transcript = transcript;

  return { status: 200, payload };
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
