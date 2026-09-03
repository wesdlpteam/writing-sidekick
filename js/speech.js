import { speak } from "./api.js";

// Tap-to-listen for each feedback card. One shared audio context is unlocked on the first tap:
// iPad Safari only lets sound start inside a tap, but a context resumed in a tap stays usable
// once the audio has downloaded. Audio for each card is kept in memory so a second tap is instant.

const LABELS = { idle: "Listen", loading: "Stop", playing: "Stop" };

let context = null;
let playing = null; // { source, button }
const cache = new Map(); // text -> AudioBuffer

function getContext() {
  if (!context) context = new (window.AudioContext || window.webkitAudioContext)();
  return context;
}

function setState(button, state) {
  button.dataset.state = state;
  button.setAttribute("aria-pressed", state === "playing" ? "true" : "false");
  button.querySelector(".listen-label").textContent = LABELS[state];
}

export function stopSpeaking() {
  if (!playing) return;
  const { source, button } = playing;
  playing = null;
  try {
    source.stop();
  } catch {
    // already finished
  }
  setState(button, "idle");
}

export function clearSpeechCache() {
  stopSpeaking();
  cache.clear();
}

async function bufferFor(text) {
  if (cache.has(text)) return cache.get(text);
  const bytes = await speak(text);
  const buffer = await getContext().decodeAudioData(bytes);
  cache.set(text, buffer);
  return buffer;
}

// A Listen button for `text` (a string, or a function that builds the text when tapped).
// Errors are raised as a bubbling "speech-error" event so the app can show its usual banner.
export function listenButton(text, { compact = false, label = "Listen to this feedback" } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = compact ? "listen compact" : "listen";
  button.setAttribute("aria-label", label);
  const icon = document.createElement("span");
  icon.className = "listen-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "🔊";
  const labelSpan = document.createElement("span");
  labelSpan.className = "listen-label";
  button.append(icon, labelSpan);
  setState(button, "idle");

  button.addEventListener("click", async () => {
    // Same button again: stop (or cancel while still loading). The label says "Stop" meanwhile.
    if (playing && playing.button === button) {
      stopSpeaking();
      return;
    }
    if (button.dataset.state === "loading") {
      setState(button, "idle");
      return;
    }
    stopSpeaking();
    const ctx = getContext();
    ctx.resume().catch(() => {});
    setState(button, "loading");
    try {
      const buffer = await bufferFor(typeof text === "function" ? text() : text);
      if (button.dataset.state !== "loading") return;
      stopSpeaking();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        if (playing && playing.source === source) {
          playing = null;
          setState(button, "idle");
        }
      };
      playing = { source, button };
      setState(button, "playing");
      source.start();
    } catch (error) {
      setState(button, "idle");
      button.dispatchEvent(new CustomEvent("speech-error", { bubbles: true, detail: error.message }));
    }
  });
  return button;
}
