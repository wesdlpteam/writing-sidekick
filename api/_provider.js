// The AI provider's address and a fetch that gives up. OPENAI_BASE_URL lets the school point
// the app at an approved regional endpoint; every upstream call carries a timeout so a stuck
// request cannot hold a function open (and cost money) indefinitely.
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export function apiUrl(env, path) {
  const base = String(env?.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return `${base}/${path.replace(/^\/+/, "")}`;
}

export async function fetchWithTimeout(fetchImpl, url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
