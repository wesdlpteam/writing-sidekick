// Tap-to-listen for each feedback card, read by the device's own built-in voice
// (the Web Speech API, speechSynthesis). Nothing is sent anywhere and it costs nothing.
// iPad Safari only lets speech start inside a tap, so speak() is called straight from the
// click handler. The text is cut into sentences and each one is queued as its own utterance,
// because long utterances can stall on iOS.

const LABELS = { idle: "Listen", playing: "Stop" };
const RATE = 0.95;
const MAX_PART = 200; // a run-on sentence longer than this is cut at a comma or space

let current = null; // { button, id, left } while a voice is speaking
let nextId = 0;
let voice = null; // the chosen voice, once the device has told us its list

const synth = () => (typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function" ? window.speechSynthesis : null);

// ---- choosing the voice ---------------------------------------------------------

// Funny voices that ship with iPads and Macs: never the pick for a child's feedback.
const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|pipe organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy)\b/i;

const tier = (v) => {
  const lang = String(v.lang || "").replace("_", "-").toLowerCase();
  if (lang === "en-au") return 3;
  if (lang === "en-gb") return 2;
  if (lang === "en" || lang.startsWith("en-")) return 1;
  return 0;
};

// en-AU first, then en-GB, then any English; inside a tier a name with Enhanced or Premium wins.
// null means "no English voice found": the device picks its own default.
export function pickVoice(voices) {
  let best = null;
  let bestScore = 0;
  for (const v of voices || []) {
    const t = tier(v);
    if (!t || NOVELTY.test(v.name || "")) continue;
    const score = t * 10 + (/enhanced|premium/i.test(v.name || "") ? 5 : 0) + (v.localService ? 1 : 0);
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best;
}

function refreshVoice() {
  const s = synth();
  if (!s) return;
  const list = s.getVoices();
  if (list && list.length) voice = pickVoice(list);
}

// Some browsers hand over their voice list a moment late.
if (synth()) {
  refreshVoice();
  synth().addEventListener?.("voiceschanged", refreshVoice);
}

// ---- cutting the text into sentences ------------------------------------------------

// Cuts a long sentence at the last comma (or space) before the limit.
function chop(sentence) {
  const parts = [];
  let rest = sentence;
  while (rest.length > MAX_PART) {
    let at = Math.max(rest.lastIndexOf(", ", MAX_PART), rest.lastIndexOf("; ", MAX_PART));
    if (at < MAX_PART / 3) at = rest.lastIndexOf(" ", MAX_PART);
    if (at < 1) at = MAX_PART;
    parts.push(rest.slice(0, at + 1).trim());
    rest = rest.slice(at + 1).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

// A sentence ends at . ! ? or an ellipsis (a closing quote or bracket may follow), so "3.5" stays whole.
export function sentencesOf(text) {
  const out = [];
  let line = [];
  for (const word of String(text || "").split(/\s+/).filter(Boolean)) {
    line.push(word);
    if (/[.!?…]["'”’)]*$/.test(word)) {
      out.push(line.join(" "));
      line = [];
    }
  }
  if (line.length) out.push(line.join(" "));
  return out.flatMap(chop);
}

// ---- the button -----------------------------------------------------------------------

// The spoken name of the button follows its state, and always says what it reads.
function setState(button, state) {
  button.dataset.state = state;
  const what = button.dataset.what;
  button.setAttribute("aria-label", state === "playing" ? `Stop listening to ${what}` : `Listen to ${what}`);
  button.querySelector(".listen-label").textContent = LABELS[state];
}

function finish(id) {
  if (!current || current.id !== id) return; // a voice that was already stopped or replaced
  setState(current.button, "idle");
  current = null;
}

// Stops the voice, and the sentences still waiting behind it.
export function stopSpeaking() {
  const was = current;
  current = null; // first, so the cancel events that follow are ignored
  if (was) setState(was.button, "idle");
  synth()?.cancel();
}

// Nothing is kept any more, so this only stops the voice (the name stays for the app's clear-up).
export function clearSpeechCache() {
  stopSpeaking();
}

// A Listen button for `text` (a string, or a function that builds the text when tapped).
// `what` names what it reads, for screen readers ("Listen to power-up 1").
// Problems are raised as a bubbling "speech-error" event so the app can show its usual banner.
// Where the device has no built-in voice there is no button at all (an empty fragment).
export function listenButton(text, { what = "this feedback" } = {}) {
  const s = synth();
  if (!s) return document.createDocumentFragment();

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

  button.addEventListener("click", () => {
    // Same button again: stop.
    if (current && current.button === button) {
      stopSpeaking();
      return;
    }
    stopSpeaking(); // one voice at a time: a new tap cancels the last
    const parts = sentencesOf(typeof text === "function" ? text() : text);
    if (!parts.length) return;

    refreshVoice();
    const id = ++nextId;
    current = { button, id };
    setState(button, "playing");
    let left = parts.length;
    // Everything is queued now, inside the tap, which is what iOS requires.
    for (const part of parts) {
      const u = new window.SpeechSynthesisUtterance(part);
      if (voice) u.voice = voice;
      u.lang = voice?.lang || "en-AU";
      u.rate = RATE;
      u.onend = () => {
        left -= 1;
        if (left <= 0) finish(id);
      };
      u.onerror = (event) => {
        const stopped = event?.error === "canceled" || event?.error === "interrupted";
        const mine = current && current.id === id;
        finish(id);
        if (mine && !stopped) {
          s.cancel(); // drop the rest of this card's sentences
          button.dispatchEvent(new CustomEvent("speech-error", { bubbles: true, detail: "The voice could not play on this device." }));
        }
      };
      try {
        s.speak(u);
      } catch {
        finish(id);
        button.dispatchEvent(new CustomEvent("speech-error", { bubbles: true, detail: "The voice could not play on this device." }));
        return;
      }
    }
  });
  return button;
}
