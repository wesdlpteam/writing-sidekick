// Evidence stays server-side. Totals are counted here, never supplied by the model.
export const unavailableTotals = () => ({ spelling: null, punctuation: null, capital_letters: null });

export const EDITING_RULES = `Audit the WHOLE transcript independently. Return editing: {complete:true, errors:[{category:"spelling"|"punctuation"|"capital_letters"|"spacing", quote:"exact smallest affected word or phrase", occurrence:1, correction:"corrected version of quote"}]}.
occurrence is the 1-based occurrence of that exact quote in the transcript. For missing punctuation quote the adjacent word(s) and include the mark in correction. One entry per error occurrence; repeated misspellings require separate entries. Never estimate a total. Return complete:false if you cannot finish the audit.
Only include definite errors: check each proposed correction again in context. Preserve acceptable Australian English, colloquial words (mozzie/mozzies), names, topic words and deliberate poetic choices. Really, Wednesdays and hayfever must not be treated as misspelt merely because they occurred in a difficult handwriting sample. Apostrophes belong ONLY to punctuation; capitals ONLY to capital_letters; joining any thing into anything or hay fever into hayfever is spacing, not spelling. Grammar and word choice are not spelling. Do not count the same underlying error twice. Exclude [unclear] and neighbouring punctuation whose presence cannot be known. An empty verified list means zero. This audit is private; never mention the corrections in student-facing feedback.`;

const letters = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const apostrophes = (s) => s.replace(/[’‘]/g, "'");
const accepted = new Set(["mozzie", "mozzies", "really", "wednesdays", "hayfever"]);

export function editingTotals(audit, transcript) {
  if (audit?.complete !== true || !Array.isArray(audit.errors)) return unavailableTotals();
  const totals = { spelling: 0, punctuation: 0, capital_letters: 0 };
  const seen = new Set();
  const spans = [];
  for (const entry of audit.errors) {
    if (!entry || ![...Object.keys(totals), "spacing"].includes(entry.category)
      || typeof entry.quote !== "string" || !entry.quote || typeof entry.correction !== "string"
      || entry.quote === entry.correction || !Number.isSafeInteger(entry.occurrence) || entry.occurrence < 1) return unavailableTotals();
    const { quote, correction, category } = entry;
    let start = -1;
    for (let i = 0; i < entry.occurrence; i++) {
      start = transcript.indexOf(quote, start + 1);
      if (start < 0) return unavailableTotals();
    }
    const end = start + quote.length;
    // A word quote cannot match the middle of another word.
    if ((/^[\p{L}\p{N}]/u.test(quote) && /[\p{L}\p{N}]/u.test(transcript[start - 1] || ""))
      || (/[\p{L}\p{N}]$/u.test(quote) && /[\p{L}\p{N}]/u.test(transcript[end] || ""))) return unavailableTotals();
    if (/\[unclear\]|~~/i.test(quote)) return unavailableTotals();
    const key = `${start}:${end}:${category}:${correction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (spans.some(([a, b]) => start < b && end > a)) return unavailableTotals();
    spans.push([start, end]);
    if (category === "spelling") {
      if (letters(quote) === letters(correction) || accepted.has(quote.toLowerCase())
        || !/^[\p{L}]+$/u.test(quote) || !/^[\p{L}]+$/u.test(correction)) return unavailableTotals();
    } else if (category === "capital_letters") {
      if (quote.toLowerCase() !== correction.toLowerCase()) return unavailableTotals();
    } else if (category === "punctuation") {
      if (quote.replace(/[^\p{L}\p{N}\s]/gu, "") !== correction.replace(/[^\p{L}\p{N}\s]/gu, "")) return unavailableTotals();
    } else if (apostrophes(quote).replace(/\s/g, "") !== apostrophes(correction).replace(/\s/g, "")) return unavailableTotals();
    if (category !== "spacing") totals[category]++;
  }
  // An unresolved reading makes a whole-piece error total unknowable.
  return /\[unclear\]/i.test(transcript) ? unavailableTotals() : totals;
}
