const TIMEOUT_MS = 120_000;
const FRIENDLY_FAIL = "Something went wrong. Please check the internet is on, then try again.";

// On GitHub Pages the site is static, so the feedback function lives on Vercel.
const API_BASE = location.hostname.endsWith("github.io") ? "https://writing-sidekick.vercel.app" : "";

async function post(body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${API_BASE}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new Error(FRIENDLY_FAIL);
  } finally {
    clearTimeout(timer);
  }
  let data = {};
  try {
    data = await response.json();
  } catch {
    throw new Error(FRIENDLY_FAIL);
  }
  if (!response.ok) throw new Error(data.error || FRIENDLY_FAIL);
  return data;
}

// Step 1: photos of the pages (in order) -> { transcript }
export function transcribePages({ images, yearLevel }) {
  return post({ images, yearLevel });
}

// Step 2: the child's checked transcript -> full feedback
export function getFeedback({ transcript, yearLevel, genre }) {
  return post({ transcript, yearLevel, genre });
}

// Read-aloud: one card's text -> mp3 bytes (an ArrayBuffer)
export async function speak(text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let response;
  try {
    response = await fetch(`${API_BASE}/api/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
  } catch {
    throw new Error(FRIENDLY_FAIL);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    let data = {};
    try {
      data = await response.json();
    } catch {
      // fall through to the friendly message
    }
    throw new Error(data.error || FRIENDLY_FAIL);
  }
  return response.arrayBuffer();
}
