const TIMEOUT_MS = 180_000;
const FRIENDLY_FAIL = "Something went wrong talking to your sidekick. Please try again.";
const OFFLINE_FAIL = "It looks like the internet is off. Please check the wifi, then try again.";

// A failed fetch looks the same whether the wifi is off or the server turned the request away,
// so only blame the internet when the device says it is offline.
const sendFail = () => new Error(typeof navigator !== "undefined" && navigator.onLine === false ? OFFLINE_FAIL : FRIENDLY_FAIL);

// On GitHub Pages the site is static, so the feedback function lives on Vercel.
const API_BASE = location.hostname.endsWith("github.io") ? "https://writing-sidekick.vercel.app" : "";

// signal: lets the app call off a request it no longer needs (a head start the child overtook).
async function post(body, { signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const callOff = () => controller.abort();
  signal?.addEventListener("abort", callOff, { once: true });
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
    signal?.removeEventListener("abort", callOff);
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

// Before step 1: a small copy of a page -> { rotate: 0 | 90 | 180 | 270 }, the clockwise
// turn that makes the writing upright. 0 also comes back when the check cannot tell.
export function detectOrientation({ image, yearLevel }) {
  return post({ yearLevel, orientation: { image } });
}

// Step 1: one page photo -> { transcript }. Pages go one per request so the total never trips
// the server's 4.5MB request limit (Vercel), whatever the photos weigh; the app joins them in order.
export function transcribePage({ image, yearLevel }) {
  return post({ images: [image], yearLevel });
}

// Step 2: the child's checked transcript -> full feedback
// headStart: sent while the child is still checking the typing, so the server may skip the review
// if the app calls it off.
export function getFeedback({ transcript, yearLevel, pitchYear, genre, signal, headStart = false }) {
  return post(headStart ? { transcript, yearLevel, pitchYear, genre, headStart: true } : { transcript, yearLevel, pitchYear, genre }, { signal });
}

// Word lab challenge: the child's own synonym for one of their words -> { verdict, note }
export function checkSynonym({ yearLevel, word, attempt, sentence }) {
  return post({ yearLevel, synonymCheck: { word, attempt, sentence } });
}

// Editing card: one new spelling of a misspelt word -> { verdict: right | same | try_again, hint, highlight? }
export function checkSpelling({ yearLevel, wrote, correct, attempt, sentence, kind, tryNumber }) {
  return post({ yearLevel, spellingCheck: { wrote, correct, attempt, sentence, kind, tryNumber } });
}

// Step 3: the child revised in their book and photographed the new version. Both versions,
// the power-ups and practice words they were given -> { cheer, wins, spellingFixed, next }
export function getLevelUp({ yearLevel, pitchYear, genre, levelUp }) {
  return post({ yearLevel, pitchYear, genre, levelUp });
}

// Trial survey: fire and forget. keepalive lets it finish even as the iPad clears the page, and a
// failure is never shown to the child.
export function sendSurvey(payload) {
  try {
    fetch(`${API_BASE}/api/survey`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}
