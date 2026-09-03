// The student-facing site is hosted on GitHub Pages; only that origin may call these functions
// from a browser. Same-origin calls (the Vercel copy of the site) need no CORS headers.
export const ALLOWED_ORIGINS = new Set(["https://wesdlpteam.github.io"]);

export function applyCors(req, res) {
  const origin = req.headers?.origin;
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

// Shared opening for every function: CORS, no caching, preflight and method check.
// Returns true when the request has been fully answered here.
export function handlePreamble(req, res) {
  applyCors(req, res);
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return true;
  }
  return false;
}
