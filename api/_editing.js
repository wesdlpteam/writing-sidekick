// Evidence stays server-side. Totals are counted here, never supplied by the model.
export const unavailableTotals = () => ({ spelling: null, punctuation: null, capital_letters: null });

export const EDITING_RULES = `Audit the WHOLE transcript independently. Return editing: {complete:true, errors:[{category:"spelling"|"punctuation"|"capital_letters"|"spacing", quote:"exact smallest affected word or phrase", occurrence:1, correction:"corrected version of quote"}]}.
occurrence is the 1-based whole-word or whole-phrase occurrence of that exact quote in the transcript; do not count a word embedded inside a longer word. For missing punctuation quote the adjacent word(s) and include the mark in correction. One entry per error occurrence; repeated misspellings require separate entries. Each correction changes ONLY its named category. If one word needs a capital and an apostrophe, return two entries sharing the original quote: dont -> Dont for capital_letters and dont -> don't for punctuation. Do not bundle several kinds of fix into one correction. Keep the quote's original spelling and case when fixing punctuation. Never estimate a total. Return complete:false if you cannot finish the audit.
Only include definite errors: check each proposed correction again in context. Preserve acceptable Australian English, colloquial words (mozzie/mozzies), names, topic words and deliberate poetic choices. Really, Wednesdays and hayfever must not be treated as misspelt merely because they occurred in a difficult handwriting sample. Apostrophes belong ONLY to punctuation; capitals ONLY to capital_letters; joining any thing into anything or hay fever into hayfever is spacing, not spelling. Grammar and word choice are not spelling. Do not count the same underlying error twice. Exclude [unclear] and neighbouring punctuation whose presence cannot be known. An empty verified list means zero. This audit is private; never mention the corrections in student-facing feedback.`;

const letters = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const apostrophes = (s) => s.replace(/[’‘]/g, "'");
const accepted = new Set(["mozzie", "mozzies", "really", "wednesdays", "hayfever"]);

export function inspectEditing(audit, transcript) {
  if (/\[unclear\]/i.test(transcript)) return {totals:unavailableTotals(),issues:['unresolved reading'],retryable:false};
  if (audit?.complete !== true || !Array.isArray(audit.errors)) return {totals:unavailableTotals(),issues:['incomplete audit'],retryable:true};
  const totals = { spelling: 0, punctuation: 0, capital_letters: 0 };
  const issues = [];
  const invalid = new Set();
  const fail = (category, issue) => {
    // A bad spacing entry cannot invalidate a displayed spelling count.
    if (category !== 'spacing') invalid.add(category);
    issues.push(issue);
  };
  const seen = new Set();
  const spans = [];
  for (const [index, entry] of audit.errors.entries()) {
    const at = `entry ${index + 1}`;
    if (!entry || ![...Object.keys(totals), "spacing"].includes(entry.category)) {
      Object.keys(totals).forEach(key=>invalid.add(key));
      issues.push(`${at}: unknown category`);
      continue;
    }
    if (typeof entry.quote !== "string" || !entry.quote || typeof entry.correction !== "string"
      || !Number.isSafeInteger(entry.occurrence) || entry.occurrence < 1) {
      fail(entry.category,`${at}: invalid evidence fields`); continue;
    }
    const { quote, correction } = entry;
    let category = entry.category;
    const before = apostrophes(quote), after = apostrophes(correction);
    const rejectMixed = (reason) => {
      fail(category,`${at}: ${reason}`);
      // Bundled corrections can affect more than their declared category.
      // Keep those counts unknown until the recheck separates the evidence.
      if (letters(before) !== letters(after)) invalid.add('spelling');
      if ((before.match(/\p{Lu}/gu)||[]).join('') !== (after.match(/\p{Lu}/gu)||[]).join('')) invalid.add('capital_letters');
      if (before.replace(/[\p{L}\p{N}\s]/gu,'') !== after.replace(/[\p{L}\p{N}\s]/gu,'')) invalid.add('punctuation');
    };
    // Harmless quote typography and unchanged words are not errors. Pure case,
    // spacing or punctuation changes have a mechanically identifiable category.
    if (before === after) continue;
    if (before.toLowerCase() === after.toLowerCase()) category = 'capital_letters';
    else if (before.replace(/\s/g,'') === after.replace(/\s/g,'')) category = 'spacing';
    else if (before.replace(/[^\p{L}\p{N}\s]/gu,'') === after.replace(/[^\p{L}\p{N}\s]/gu,'')) category = 'punctuation';
    let start = -1;
    let occurrences = 0;
    while (occurrences < entry.occurrence) {
      start = transcript.indexOf(quote, start + 1);
      if (start < 0) break;
      const afterQuote = start + quote.length;
      const insideWord = (/^[\p{L}\p{N}]/u.test(quote) && /[\p{L}\p{N}]/u.test(transcript[start - 1] || ''))
        || (/[\p{L}\p{N}]$/u.test(quote) && /[\p{L}\p{N}]/u.test(transcript[afterQuote] || ''));
      if (!insideWord) occurrences++;
    }
    if (start < 0) { fail(category,`${at}: quote occurrence not found`); continue; }
    const end = start + quote.length;
    if (/~~/i.test(quote)) { fail(category,`${at}: crossed-out evidence`); continue; }
    const key = `${start}:${end}:${category}:${after}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Distinct categories can validly fix different features of the same word.
    if (spans.some(([a, b, kind]) => kind === category && start < b && end > a)) { fail(category,`${at}: conflicting or overlapping ${category} entries`); continue; }
    spans.push([start, end, category]);
    if (category === "spelling") {
      if (letters(quote) === letters(correction) || accepted.has(quote.toLowerCase())
        || !/^[\p{L}]+$/u.test(quote) || !/^[\p{L}]+$/u.test(correction)
        || (quote.match(/\p{Lu}/gu)||[]).join('') !== (correction.match(/\p{Lu}/gu)||[]).join('')) { rejectMixed('not an isolated spelling correction'); continue; }
    } else if (category === "capital_letters") {
      if (before.toLowerCase() !== after.toLowerCase()) { rejectMixed('mixed changes in capital correction'); continue; }
    } else if (category === "punctuation") {
      if (quote.replace(/[^\p{L}\p{N}\s]/gu, "") !== correction.replace(/[^\p{L}\p{N}\s]/gu, "")) { rejectMixed('mixed changes in punctuation correction'); continue; }
    } else if (before.replace(/\s/g, "") !== after.replace(/\s/g, "")) { rejectMixed('mixed changes in spacing correction'); continue; }
    if (category !== "spacing") totals[category]++;
  }
  for (const key of invalid) totals[key] = null;
  return {totals,issues,retryable:invalid.size > 0};
}

export const editingTotals = (audit, transcript) => inspectEditing(audit, transcript).totals;
