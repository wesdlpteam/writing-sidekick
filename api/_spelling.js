// Picks the child's own misspelt words to practise. Evidence comes from inspectEditing().spelling.
// Words are never invented: every word here is one the child wrote that the audit verified.
const SOUND_ALIKES = [
  ["there", "their", "they're"], ["to", "too", "two"], ["your", "you're"], ["where", "were", "wear"],
  ["no", "know"], ["here", "hear"], ["right", "write"], ["one", "won"], ["for", "four"], ["new", "knew"],
  ["by", "buy"], ["see", "sea"], ["our", "hour"], ["wood", "would"], ["whole", "hole"], ["which", "witch"],
  ["piece", "peace"], ["meet", "meat"], ["tail", "tale"],
];

const apostrophes = (s) => s.replace(/[’‘`]/g, "'");
const lower = (s) => apostrophes(s).toLowerCase();

export function isSoundAlike(wrote, correct) {
  const a = lower(wrote), b = lower(correct);
  return a !== b && SOUND_ALIKES.some((g) => g.includes(a) && g.includes(b));
}

// Common prefix, then common suffix that may not overlap it. Ranges are [start, end) in each word.
export function differingPart(attempt, target) {
  const a = attempt.toLowerCase(), t = target.toLowerCase();
  const most = Math.min(a.length, t.length);
  let p = 0;
  while (p < most && a[p] === t[p]) p++;
  let s = 0;
  while (s < most - p && a[a.length - 1 - s] === t[t.length - 1 - s]) s++;
  return { attempt: [p, a.length - s], target: [p, t.length - s] };
}

// Edge punctuation off; apostrophes inside a word stay.
const edgeTrim = (w) => w.replace(/^[^\p{L}\p{N}]+/u, "").replace(/[^\p{L}\p{N}]+$/u, "");

// Words of a phrase with their offsets inside it.
function wordsOf(phrase) {
  return [...phrase.matchAll(/\S+/g)].map((m) => {
    const word = edgeTrim(m[0]);
    return { word, at: m.index + (word ? m[0].indexOf(word) : 0) };
  });
}

// A capital mid-sentence means a name, so skip it. Sentence start: only spaces back to . ! ? a newline or the start.
function atSentenceStart(transcript, at) {
  let i = at - 1;
  while (i >= 0 && /[ \t\u00a0]/.test(transcript[i])) i--;
  return i < 0 || /[.!?\n\r]/.test(transcript[i]);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function sentenceFor(transcript, wrote) {
  const re = new RegExp(`(^|[^\\p{L}\\p{N}'])${escapeRe(wrote)}(?![\\p{L}\\p{N}'])`, "iu");
  const parts = transcript.split(/\n+|(?<=[.!?])\s+/);
  const hit = parts.find((s) => re.test(s));
  return hit ? hit.trim().slice(0, 200) : "";
}

export function pickSpellingWords(evidence, transcript, { yearLevel, totalSpelling } = {}) {
  if (totalSpelling === null) return { status: "unavailable", words: [] };
  if (totalSpelling === 0) return { status: "clear", words: [] };
  const found = new Map();
  for (const item of Array.isArray(evidence) ? evidence : []) {
    if (typeof item?.quote !== "string" || typeof item?.correction !== "string") continue;
    const wrote = wordsOf(item.quote);
    const correct = wordsOf(item.correction);
    if (!wrote.length || wrote.length !== correct.length) continue;
    wrote.forEach((w, i) => {
      const c = correct[i].word;
      if (!w.word || !c) return;
      if (w.word.toLowerCase() === c.toLowerCase()) return;
      if (lower(w.word).replace(/'/g, "") === lower(c).replace(/'/g, "")) return;
      const start = (Number.isInteger(item.start) ? item.start : 0) + w.at;
      if (/^\p{Lu}/u.test(c) && c !== "I" && !atSentenceStart(transcript, start)) return;
      const key = w.word.toLowerCase();
      const seen = found.get(key);
      if (seen) { seen.count++; seen.start = Math.min(seen.start, start); return; }
      found.set(key, { wrote: w.word, correct: c, count: 1, start });
    });
  }
  const cap = Number(yearLevel) <= 2 ? 3 : 5;
  const words = [...found.values()]
    .sort((a, b) => b.count - a.count || a.correct.length - b.correct.length || a.start - b.start)
    .slice(0, cap)
    .map(({ wrote, correct }) => ({
      wrote,
      correct,
      sentence: sentenceFor(transcript, wrote),
      kind: isSoundAlike(wrote, correct) ? "sound_alike" : "sounds",
      tricky: differingPart(wrote, correct).target,
    }));
  return { status: words.length ? "words" : "none_to_practise", words };
}
