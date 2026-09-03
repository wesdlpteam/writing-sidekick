// Every request to the functions comes through here first. It is the gate, not identity: it
// turns away calls that do not come from the app's own pages, non-JSON bodies, and everything
// while the app is paused, before any body is read or any AI provider is called. The student
// site is on GitHub Pages; the Vercel copy of the site is same-origin. Extra origins (a preview
// deployment, say) come from ALLOWED_ORIGINS, comma separated.
const DEFAULT_ORIGINS = ["https://wesdlpteam.github.io", "https://writing-sidekick.vercel.app"];
const REFUSED_MESSAGE = "The Writing Sidekick can only be used from its own app.";
const PAUSED_MESSAGE = "The Writing Sidekick is having a rest right now. Please tell your teacher.";

export function allowedOrigins(env = {}) {
  const extra = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...extra]);
}

export function isPaused(env = {}) {
  return ["1", "true", "yes"].includes(String(env.APP_PAUSED || "").toLowerCase());
}

export function applyCors(req, res, env = process.env) {
  const origin = req.headers?.origin;
  if (!origin || !allowedOrigins(env).has(origin)) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  return true;
}

// Shared opening for every function: origin check, no caching, preflight, method, pause switch
// and content type. Returns true when the request has been fully answered here.
export function handlePreamble(req, res, env = process.env) {
  const allowed = applyCors(req, res, env);
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.status(allowed ? 204 : 403).end();
    return true;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return true;
  }
  if (!allowed) {
    res.status(403).json({ error: REFUSED_MESSAGE });
    return true;
  }
  if (isPaused(env)) {
    res.status(503).json({ error: PAUSED_MESSAGE });
    return true;
  }
  const type = String(req.headers?.["content-type"] || "").toLowerCase();
  if (!type.includes("application/json")) {
    res.status(415).json({ error: REFUSED_MESSAGE });
    return true;
  }
  return false;
}
