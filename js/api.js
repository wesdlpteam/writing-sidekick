const TIMEOUT_MS = 90_000;
const FRIENDLY_FAIL = "Something went wrong. Please check the internet is on, then try again.";

async function post(body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch("/api/feedback", {
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

export function getFeedback({ imageDataUrl, yearLevel, genre }) {
  return post({ image: imageDataUrl, yearLevel, genre });
}

export function regenerateFeedback({ transcript, yearLevel, genre }) {
  return post({ transcript, yearLevel, genre });
}
