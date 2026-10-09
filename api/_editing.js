// Evidence stays server-side. Totals are counted here, never supplied by the model.
export const unavailableTotals = () => ({ spelling: null, punctuation: null, capital_letters: null });

export const EDITING_RULES = `Audit the WHOLE transcript independently. Return editing: {complete:true, errors:[{category:"spelling"|"punctuation"|"capital_letters"|"spacing", quote:"exact smallest affected word or phrase", occurrence:1, correction:"corrected version of quote"}]}.
occurrence is the 1-based whole-word or whole-phrase occurrence of that exact quote in the transcript; do not count a word embedded inside a longer word. For missing punctuation quote the adjacent word(s) and include the mark in correction. One entry per error occurrence; repeated misspellings require separate entries. Each correction changes ONLY its named category. If one word needs a capital and an apostrophe, return two entries sharing the original quote: dont -> Dont for capital_letters and dont -> don't for punctuation. Do not bundle several kinds of fix into one correction. Keep the quote's original spelling and case when fixing punctuation. Never estimate a total. Return complete:false if you cannot finish the audit.
Only include definite errors: check each proposed correction again in context. Preserve acceptable Australian English, colloquial words (mozzie/mozzies), names, topic words and deliberate poetic choices. Really, Wednesdays and hayfever must not be treated as misspelt merely because they occurred in a difficult handwriting sample. Apostrophes belong ONLY to punctuation; capitals ONLY to capital_letters; joining any thing into anything or hay fever into hayfever is spacing, not spelling. Grammar and word choice are not spelling. Do not count the same underlying error twice. Exclude [unclear] and neighbouring punctuation whose presence cannot be known. An empty verified list means zero. This audit is private; never mention the corrections in student-facing feedback.`;

const apostrophes = (s) => s.replace(/[’‘]/g, "'");
const accepted = new Set(["mozzie", "mozzies", "really", "wednesdays", "hayfever"]);

// Each entry is turned into the exact changes it makes, at their places in the transcript:
// a word whose letters change is one spelling error, a word whose capitals change is one capital
// error, and each place where a mark is missing, extra or wrong is one punctuation error. So a
// note that bundles several kinds of fix still counts each kind once, a mistake described twice
// counts once, and two mistakes in overlapping notes count twice. Spacing is never counted.
const isWordChar = (ch) => /[\p{L}\p{N}]/u.test(ch || "");
const isMark = (ch) => !!ch && !isWordChar(ch) && !/\s/.test(ch);
// Same-length clean-up, so positions found in it are positions in the transcript.
const plain = (s) => s.replace(/[’‘`]/g, "'").replace(/[“”]/g, '"').replace(/\s/g, " ");

function findQuote(transcript, quote, occurrence) {
  const tries = [[transcript, quote], [plain(transcript), plain(quote)]];
  const lower = [plain(transcript).toLowerCase(), plain(quote).toLowerCase()];
  if (lower[0].length === transcript.length && lower[1].length === quote.length) tries.push(lower);
  for (const [text, q] of tries) {
    let start = -1;
    let seen = 0;
    while (seen < occurrence) {
      start = text.indexOf(q, start + 1);
      if (start < 0) break;
      const end = start + q.length;
      const insideWord = (isWordChar(q[0]) && isWordChar(text[start - 1])) || (isWordChar(q[q.length - 1]) && isWordChar(text[end]));
      if (!insideWord) seen++;
    }
    if (start >= 0) return start;
  }
  return -1;
}

function lcsPairs(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return pairs;
}

// Curly double quotes keep their direction: a closing mark used to open speech is an error.
// A straight double quote stands in for either curly one; any other difference is a change.
const isDoubleQuote = (ch) => ch === '"' || ch === "“" || ch === "”";
const sameMarks = (a, b) => a.length === b.length && [...a].every((ch, i) => ch === b[i] || ((ch === '"' || b[i] === '"') && isDoubleQuote(ch) && isDoubleQuote(b[i])));

// The changes one entry makes, as offsets into its quote: letters respelt, letters recapitalised,
// and punctuation places. A place is "gap|side": gap is the offset of the quote letter the mark
// follows (-1 before the first letter); side is "end" for marks hanging off that letter's word
// (a full stop, a closing speech mark) and "start" for marks opening the next word.
export function changesIn(quote, correction) {
  const keepQuotes = (s) => s.replace(/[’‘`]/g, "'").replace(/\s/g, " ");
  const q = keepQuotes(quote), c = keepQuotes(correction);
  const qPos = [...q].map((_, i) => i).filter((i) => isWordChar(q[i]));
  const cPos = [...c].map((_, i) => i).filter((i) => isWordChar(c[i]));
  const pairs = lcsPairs(qPos.map((i) => q[i].toLowerCase()), cPos.map((i) => c[i].toLowerCase()));
  const qMatched = new Map(pairs);
  const cToQ = new Map(pairs.map(([a, b]) => [b, a]));
  const spelling = new Set(), capital = new Set(), punctuation = new Set();
  qPos.forEach((pos, k) => { if (!qMatched.has(k)) spelling.add(pos); });
  // An added letter belongs to the word it lands in: anchor it on a kept letter of that same word.
  const cWord = (k) => c.slice(0, cPos[k]).split(" ").length;
  cPos.forEach((_, k) => {
    if (cToQ.has(k)) return;
    const same = pairs.find(([, b]) => cWord(b) === cWord(k));
    const before = [...pairs].reverse().find(([, b]) => b < k);
    const anchor = same || before || pairs[0];
    spelling.add(anchor ? qPos[anchor[0]] : (qPos[0] ?? 0));
  });
  for (const [a, b] of pairs) if (q[qPos[a]] !== c[cPos[b]]) capital.add(qPos[a]);
  const gapOfQ = (k) => (k < 0 ? -1 : qPos[k]);
  const gapOfC = (k) => { while (k >= 0 && !cToQ.has(k)) k--; return k < 0 ? -1 : qPos[cToQ.get(k)]; };
  const marks = (s, pos, gapOf) => {
    const combined = new Map(), bySide = new Map();
    for (let i = 0; i < s.length; i++) {
      if (!isMark(s[i])) continue;
      let k = -1;
      pos.forEach((p, idx) => { if (p < i) k = idx; });
      const next = pos.find((p) => p > i);
      const side = k >= 0 ? (/ /.test(s.slice(pos[k] + 1, i)) ? "start" : "end") : (next === undefined || / /.test(s.slice(i + 1, next)) ? "end" : "start");
      const gap = gapOf(k);
      combined.set(gap, (combined.get(gap) || "") + s[i]);
      bySide.set(`${gap}|${side}`, (bySide.get(`${gap}|${side}`) || "") + s[i]);
    }
    return { combined, bySide };
  };
  const qm = marks(q, qPos, gapOfQ), cm = marks(c, cPos, gapOfC);
  for (const gap of new Set([...qm.combined.keys(), ...cm.combined.keys()])) {
    if (sameMarks(qm.combined.get(gap) || "", cm.combined.get(gap) || "")) continue; // moved across a space: spacing
    for (const side of ["end", "start"]) {
      const key = `${gap}|${side}`;
      if (!sameMarks(qm.bySide.get(key) || "", cm.bySide.get(key) || "")) punctuation.add(key);
    }
  }
  return { spelling, capital, punctuation };
}

export function inspectEditing(audit, transcript) {
  if (/\[unclear\]/i.test(transcript)) return { totals: unavailableTotals(), issues: ["unresolved reading"], retryable: false };
  if (audit?.complete !== true || !Array.isArray(audit.errors)) return { totals: unavailableTotals(), issues: ["incomplete audit"], retryable: true };
  const found = { spelling: new Set(), punctuation: new Set(), capital_letters: new Set() };
  const unverified = { spelling: 0, punctuation: 0, capital_letters: 0 };
  const invalid = new Set();
  const issues = [];
  // The start of the word every letter belongs to, so a word is one key however it is quoted.
  const wordStart = [];
  for (let i = 0, start = 0; i < transcript.length; i++) {
    const joined = isWordChar(transcript[i - 1]) || (/['’]/.test(transcript[i - 1] || "") && isWordChar(transcript[i - 2]));
    if (isWordChar(transcript[i]) && !joined) start = i;
    wordStart[i] = start;
  }
  const wordAt = (i) => wordStart[i] ?? i;
  const letterBefore = (i) => { while (i >= 0 && !isWordChar(transcript[i])) i--; return i; };
  for (const [index, entry] of audit.errors.entries()) {
    const at = `entry ${index + 1}`;
    if (!entry || !["spelling", "punctuation", "capital_letters", "spacing"].includes(entry.category)) {
      Object.keys(found).forEach((key) => invalid.add(key));
      issues.push(`${at}: unknown category`);
      continue;
    }
    if (typeof entry.quote !== "string" || !entry.quote || typeof entry.correction !== "string"
      || !Number.isSafeInteger(entry.occurrence) || entry.occurrence < 1 || entry.quote.length > 300 || entry.correction.length > 300) {
      if (entry.category !== "spacing") invalid.add(entry.category);
      issues.push(`${at}: invalid evidence fields`);
      continue;
    }
    if (/~~/.test(entry.quote)) {
      if (entry.category !== "spacing") invalid.add(entry.category);
      issues.push(`${at}: crossed-out evidence`);
      continue;
    }
    const change = changesIn(entry.quote, entry.correction);
    const kinds = { spelling: change.spelling, capital_letters: change.capital, punctuation: change.punctuation };
    const start = findQuote(transcript, entry.quote, entry.occurrence);
    if (start < 0) {
      // Unverifiable: it never adds to a count, and a count it alone would leave at zero stays unknown.
      for (const [key, set] of Object.entries(kinds)) if (set.size) unverified[key]++;
      issues.push(`${at}: quote occurrence not found`);
      continue;
    }
    const respelt = new Set([...change.spelling].map((offset) => wordAt(start + offset)));
    if (respelt.size >= 3) { invalid.add("spelling"); issues.push(`${at}: rewrites several words`); continue; }
    for (const offset of change.spelling) {
      const word = wordAt(start + offset);
      const text = transcript.slice(word).match(/^[\p{L}\p{N}'’]+/u)?.[0] || "";
      if (accepted.has(apostrophes(text).toLowerCase())) { invalid.add("spelling"); issues.push(`${at}: accepted word marked as misspelt`); continue; }
      found.spelling.add(word);
    }
    for (const offset of change.capital) found.capital_letters.add(wordAt(start + offset));
    // A place is keyed by the transcript letter it follows, so it is the same however it was quoted.
    for (const place of change.punctuation) {
      const [gap, side] = place.split("|");
      found.punctuation.add(`${Number(gap) < 0 ? letterBefore(start - 1) : start + Number(gap)}|${side}`);
    }
  }
  const totals = {};
  for (const key of Object.keys(found)) {
    totals[key] = invalid.has(key) || (found[key].size === 0 && unverified[key] > 0) ? null : found[key].size;
  }
  return { totals, issues, retryable: false };
}

export const editingTotals = (audit, transcript) => inspectEditing(audit, transcript).totals;
