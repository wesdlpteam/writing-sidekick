// Local dev server: static files + /api/feedback. MOCK=1 skips OpenAI.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleFeedback } from "./api/feedback.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4173;
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

const MOCK_PAYLOAD = {
  transcript:
    "On the weekend I went to the beach with my famly.\nThe waves were huge and I got dumped!\nAfter that we had fish and chips.",
  stars: [
    "You told your events in order: the beach, the waves, then fish and chips. That makes your recount easy to follow.",
    "'I got dumped!' is a great detail, and your exclamation mark shows the excitement.",
  ],
  wish: "Try adding a describing word to one of your nouns, like 'the salty fish and chips' or 'the crashing waves'.",
  detail: {
    ideas: "A clear little story about a real event, with a fun moment in the middle.",
    structure: "Three complete sentences in time order. A time word like 'First' could start it off.",
    vocabulary: "'huge' and 'dumped' are strong choices. One more describing word would add colour.",
    spelling: "Most words are spelled correctly. Check 'famly' - say it slowly: fam-i-ly.",
  },
  practiceWords: [
    { correct: "family", wrote: "famly" },
    { correct: "because", wrote: "becoz" },
    { correct: "beach", wrote: "beech" },
  ],
  spellingTip: "Say tricky words in syllables to hear every part: fam-i-ly, be-cause.",
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
      const payload = { ...MOCK_PAYLOAD };
      if (typeof body.transcript === "string" && body.transcript.trim()) {
        payload.transcript = body.transcript.trim();
      }
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
