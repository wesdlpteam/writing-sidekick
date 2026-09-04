const TIMEOUT_MS = 120_000;
const FRIENDLY_FAIL = "Something went wrong talking to your sidekick. Please try again.";
const OFFLINE_FAIL = "It looks like the internet is off. Please check the wifi, then try again.";

// A failed fetch looks the same whether the wifi is off or the server turned the request away,
// so only blame the internet when the device says it is offline.
const sendFail = () => new Error(typeof navigator !== "undefined" && navigator.onLine === false ? OFFLINE_FAIL : FRIENDLY_FAIL);

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
    throw sendFail();
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

// Step 1: one page photo -> { transcript }. Pages go one per request so the total never trips
// the server's 4.5MB request limit (Vercel), whatever the photos weigh; the app joins them in order.
export function transcribePage({ image, yearLevel }) {
  return post({ images: [image], yearLevel });
}

// Step 2: the child's checked transcript -> full feedback
export function getFeedback({ transcript, yearLevel, genre }) {
  return post({ transcript, yearLevel, genre });
}

// Step 3: the child revised in their book and photographed the new version. Both versions,
// the power-ups and practice words they were given -> { cheer, wins, spellingFixed, next }
export function getLevelUp({ yearLevel, genre, levelUp }) {
  return post({ yearLevel, genre, levelUp });
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
    throw sendFail();
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
