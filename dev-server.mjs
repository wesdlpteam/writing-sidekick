// Local dev server: static files + /api/feedback. MOCK=1 skips OpenAI.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleFeedback } from "./api/feedback.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv.find((a) => a.startsWith("--port="))?.slice(7)) || 4173;
const MOCK = process.env.MOCK === "1" || process.argv.includes("--mock");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

const MOCK_TRANSCRIPT =
  "On the weekend I went to the beach with my famly.\nThe waves were huge and I got dumped!\nAfter that we had fish and chips.";

const crit = (key, label, sub, status, strength, nextStep, powerUp = null) => ({ key, label, sub, status, strength, nextStep, powerUp });

// Same shape as the server's normalised response (see validateFeedback in api/feedback.js).
const MOCK_PAYLOAD = {
  headline:
    "'I got dumped!' is the best moment in your recount, and your exclamation mark makes it land. Now paint the beach so your reader can see it too.",
  criteria: [
    crit("audience", "Audience", "hooking and helping your reader", "steady", "'I got dumped!' makes your reader feel the splash.", "Start with the wave, not the weekend, so your reader is hooked from line one."),
    crit("text_structure", "Text structure", "beginning, middle and end", "steady", "You have a beginning (the trip), a middle (the wave) and an end (fish and chips).", "Finish with how you felt, not just what you ate."),
    crit("ideas", "Ideas", "what your writing is about", "steady", "Getting dumped by a huge wave is a great moment to build your recount around.", "Tell us one more thing that happened at the beach."),
    crit("character_setting", "Characters and setting", "who, where and when", "next_step", "", "We never see the beach. Add one detail about the sand or the sky.", 1),
    crit("vocabulary", "Vocabulary", "your word choices", "next_step", "'huge' and 'dumped' are strong picks.", "Swap 'went' and 'had' for verbs that show how: see Word power below."),
    crit("cohesion", "Cohesion", "how your ideas link up", "strength", "'After that' links your events in order.", "Try 'Later' or 'At last' too, so it is not always 'After that'."),
    crit("paragraphing", "Paragraphing", "chunking your ideas", "steady", "", "One paragraph is fine for three sentences. When you write more, start a new one for the fish and chips."),
    crit("sentence_structure", "Sentence structure", "building good sentences", "next_step", "All three of your sentences are complete.", "Start one sentence with a W word.", 2),
    crit("punctuation", "Punctuation", "capitals, full stops and more", "strength", "Capital letters and full stops are all in place, and your exclamation mark lands on the exciting bit.", "Try a comma after an opener, like 'After that,'."),
    crit("spelling", "Spelling", "getting words right", "steady", "'weekend', 'beach' and 'waves' are all spelt right.", "Practise 'family' below: say it in parts, fam-i-ly."),
  ],
  powerUps: [
    {
      area: "character_setting",
      areaLabel: "Characters and setting",
      skill: "Add what you could see and hear",
      why: "Your beach has waves but no picture of the place yet. One sight and one sound put your reader on the sand with you.",
      yourLine: "The waves were huge and I got dumped!",
      tryThis: "Under a blazing sun, the huge waves roared and dumped me in the foam!",
      sentenceType: {
        key: "preposition_start",
        name: "Preposition start",
        rule: "Begins with a little place or time word (In, Under, After, Behind, At) and a short phrase, then a comma.",
        example: "Under the old bridge, a troll was snoring.",
      },
      nowYou: "Find your first sentence and add one thing you could see at the beach.",
    },
    {
      area: "sentence_structure",
      areaLabel: "Sentence structure",
      skill: "Start with a W word",
      why: "Two of your three sentences start with a plain word. A W-start makes your writing flow like a story.",
      yourLine: "After that we had fish and chips.",
      tryThis: "While the sun dried our towels, we munched hot fish and chips.",
      sentenceType: {
        key: "w_start",
        name: "W-start sentence",
        rule: "Begins with a W word (When, While, Where, Who, What, With), then a comma after the first part, then the rest.",
        example: "When the bell rang, we sprinted to the oval.",
      },
      nowYou: "Rewrite your first sentence so it starts with 'When' or 'While'.",
    },
  ],
  practiceWords: [{ correct: "family", wrote: "famly" }],
  spellingTip: "Say tricky words in syllables to hear every part: fam-i-ly.",
  wordBoost: {
    swaps: [
      { from: "huge", to: ["gigantic", "towering"] },
      { from: "went", to: ["raced", "wandered"] },
    ],
    before: "The waves were huge and I got dumped!",
    after: "The gigantic waves crashed over me and dumped me in the sand!",
  },
};

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 10_000_000) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/api/feedback") {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    if (req.method !== "POST") {
      res.writeHead(405).end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    let body = {};
    try {
      body = JSON.parse((await collectBody(req)) || "{}");
    } catch {
      res.writeHead(400).end(JSON.stringify({ error: "Bad request" }));
      return;
    }
    if (MOCK) {
      await new Promise((r) => setTimeout(r, 1200)); // simulate thinking time
      const hasPhotos = (Array.isArray(body.images) && body.images.length) || body.image;
      const payload = hasPhotos
        ? { transcript: MOCK_TRANSCRIPT }
        : { transcript: typeof body.transcript === "string" ? body.transcript.trim() : "", ...MOCK_PAYLOAD };
      res.writeHead(200).end(JSON.stringify(payload));
      return;
    }
    const { status, payload } = await handleFeedback(body, { fetchImpl: fetch, env: process.env });
    res.writeHead(status).end(JSON.stringify(payload));
    return;
  }

  let filePath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const resolved = path.resolve(ROOT, "." + filePath);
  if (!resolved.startsWith(ROOT) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(resolved).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(resolved).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Writing Sidekick dev server: http://localhost:${PORT} ${MOCK ? "(MOCK mode)" : ""}`);
});
