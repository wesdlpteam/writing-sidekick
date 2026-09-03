import { handlePreamble } from "./_cors.js";

// Read-aloud: turns one card of feedback into speech. The text is the feedback the app already
// produced (never the photo), and nothing is stored.

const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_VOICE = "marin"; // Nathan picked "marin" in its sincere style (2026-09-03)
const MAX_CHARS = 1500;
const CHILD_SAFE_ERROR = "Hmm, the voice didn't come through. Please try again.";

const VOICE_STYLE = `You are the Writing Sidekick, reading feedback aloud to a primary-school child aged six to twelve. Sound sincere, warm and calm, like a kind teacher sitting beside them: unhurried, clear and encouraging, never sing-song and never rushed. Pause briefly at full stops. When you read words quoted from the child's own writing, say them a little more gently, as if pointing at them on the page. Use Australian English pronunciations.`;

const cleanText = (value) =>
  typeof value === "string"
    ? value
        .replace(/\p{Extended_Pictographic}/gu, "") // no "check mark" read-outs
        .replace(/\s+/g, " ")
        .trim()
    : "";

export async function handleSpeak(body, { fetchImpl, env }) {
  const text = cleanText(body?.text);
  if (!text) return { status: 400, payload: { error: "There is nothing to read yet." } };
  if (text.length > MAX_CHARS) return { status: 400, payload: { error: "That is too much to read in one go." } };
  if (!env?.OPENAI_API_KEY) {
    return { status: 500, payload: { error: "The app isn't set up yet. Please tell your teacher." } };
  }

  let response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: env.OPENAI_TTS_MODEL || DEFAULT_TTS_MODEL,
        voice: env.OPENAI_TTS_VOICE || DEFAULT_VOICE,
        input: text,
        instructions: VOICE_STYLE,
        response_format: "mp3",
      }),
    });
  } catch {
    return { status: 502, payload: { error: CHILD_SAFE_ERROR } };
  }
  if (!response.ok) return { status: 502, payload: { error: CHILD_SAFE_ERROR } };
  try {
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length) return { status: 502, payload: { error: CHILD_SAFE_ERROR } };
    return { status: 200, audio, contentType: "audio/mpeg" };
  } catch {
    return { status: 502, payload: { error: CHILD_SAFE_ERROR } };
  }
}

export default async function handler(req, res) {
  if (handlePreamble(req, res)) return;
  const result = await handleSpeak(req.body, { fetchImpl: fetch, env: process.env });
  if (result.audio) {
    res.setHeader("Content-Type", result.contentType);
    res.status(200).send(result.audio);
    return;
  }
  res.status(result.status).json(result.payload);
}
