import { speak } from "./api.js";

// Tap-to-listen for each feedback card, played through one shared <audio> element.
// iPad Safari only lets sound start inside a tap, so the first tap plays a moment of silence
// on the element ("unlocking" it); after that the downloaded voice can be loaded and played
// on the same element once it arrives. An <audio> element also plays with the iPad's silent
// switch on, which Web Audio does not: that was why Listen could seem to do nothing.
// Audio for each card is kept in memory so a second tap is instant.

const LABELS = { idle: "Listen", loading: "Stop", playing: "Stop" };

let player = null;
let unlocked = false;
let current = null; // { button }
const cache = new Map(); // text -> object URL of the mp3

// A tenth of a second of silence as a WAV, built once; used to unlock the element in a tap.
function silentClip() {
  const rate = 8000;
  const samples = rate / 10;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset, s) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
}

function getPlayer() {
  if (!player) {
    player = new Audio();
    player.preload = "auto";
    player.setAttribute("playsinline", "");
    player.addEventListener("ended", finish);
    player.addEventListener("error", finish);
  }
  return player;
}

function setState(button, state) {
  button.dataset.state = state;
  button.setAttribute("aria-pressed", state === "playing" ? "true" : "false");
  button.querySelector(".listen-label").textContent = LABELS[state];
}

function finish() {
  if (!current) return;
  setState(current.button, "idle");
  current = null;
}

export function stopSpeaking() {
  if (!current) return;
  const p = getPlayer();
  p.pause();
  try {
    p.currentTime = 0;
  } catch {
    // nothing loaded yet
  }
  finish();
}

export function clearSpeechCache() {
  stopSpeaking();
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
}

async function urlFor(text) {
  if (cache.has(text)) return cache.get(text);
  const bytes = await speak(text);
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
  cache.set(text, url);
  return url;
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
    if (current && current.button === button) {
      stopSpeaking();
      return;
    }
    if (button.dataset.state === "loading") {
      setState(button, "idle");
      return;
    }
    stopSpeaking();
    const p = getPlayer();
    if (!unlocked) {
      // Still inside the tap: a silent play now lets the real play through after the download.
      p.src = silentClip();
      p.play()
        .then(() => {
          unlocked = true;
        })
        .catch(() => {});
    }
    setState(button, "loading");
    try {
      const url = await urlFor(typeof text === "function" ? text() : text);
      if (button.dataset.state !== "loading") return;
      stopSpeaking();
      current = { button };
      setState(button, "playing");
      p.src = url;
      await p.play();
    } catch (error) {
      finish();
      setState(button, "idle");
      button.dispatchEvent(new CustomEvent("speech-error", { bubbles: true, detail: error.message || "The voice could not play on this device." }));
    }
  });
  return button;
}
