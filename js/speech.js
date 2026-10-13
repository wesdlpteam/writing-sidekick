import { speak } from "./api.js?v=20260911-audit";

// Tap-to-listen for each feedback card, played through one shared <audio> element.
// iPad Safari only lets sound start inside a tap, so the first tap plays a moment of silence
// on the element ("unlocking" it); after that the downloaded voice can be loaded and played
// on the same element once it arrives. An <audio> element also plays with the iPad's silent
// switch on, which Web Audio does not: that was why Listen could seem to do nothing.
// Audio for each card is kept in memory so a second tap is instant.

const LABELS = { idle: "Listen", loading: "Loading", playing: "Stop" };

let player = null;
let unlocked = false;
let current = null; // { button } while a voice is playing
let pending = null; // the button whose voice is still downloading
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

// The spoken name of the button follows its state, and always says what it reads.
function setState(button, state) {
  button.dataset.state = state;
  const what = button.dataset.what;
  button.setAttribute(
    "aria-label",
    state === "playing" ? `Stop listening to ${what}` : state === "loading" ? `Loading ${what}. Tap to cancel` : `Listen to ${what}`,
  );
  button.querySelector(".listen-label").textContent = LABELS[state];
}

function finish() {
  if (!current) return;
  setState(current.button, "idle");
  current = null;
}

// Stops the voice, and cancels a download still under way.
export function stopSpeaking() {
  if (pending) {
    setState(pending, "idle");
    pending = null;
  }
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
// `what` names what it reads, for screen readers ("Listen to power-up 1").
// Errors are raised as a bubbling "speech-error" event so the app can show its usual banner.
export function listenButton(text, { what = "this feedback" } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "listen";
  button.dataset.what = what;
  const icon = document.createElement("span");
  icon.className = "listen-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "🔊";
  const labelSpan = document.createElement("span");
  labelSpan.className = "listen-label";
  button.append(icon, labelSpan);
  setState(button, "idle");

  button.addEventListener("click", async () => {
    // Same button again: stop (or cancel while still loading).
    if ((current && current.button === button) || button.dataset.state === "loading") {
      stopSpeaking();
      return;
    }
    stopSpeaking(); // one voice at a time: a new tap cancels the last
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
    pending = button;
    try {
      const url = await urlFor(typeof text === "function" ? text() : text);
      if (pending !== button) return; // cancelled while downloading
      pending = null;
      current = { button };
      setState(button, "playing");
      p.src = url;
      await p.play();
    } catch (error) {
      if (pending === button) pending = null;
      if (current && current.button === button) current = null;
      setState(button, "idle");
      if (error.name === "AbortError") return; // stopped by the child just as it started: not an error
      button.dispatchEvent(new CustomEvent("speech-error", { bubbles: true, detail: error.message || "The voice could not play on this device." }));
    }
  });
  return button;
}
