import { heroPowers, nextFocus, editingItems, editingCount, editingCaption, editingAdvice, spellingStatusText, ROUGH_NOTE, missionRows } from "./feedback-visuals.js?v=20261028-vocab";

// The words the Listen buttons read aloud (Years 1 to 3). Everything here is plain text built
// from the same feedback the cards show, so the voice and the page always agree. No browser
// code lives here, so it can be tested on its own.

// api/speak.js refuses anything longer than this.
export const MAX_SPOKEN = 1500;

// Younger writers say the new sentence to a partner before they write it (shown on the card too).
export const SAY_ALOUD = "Say your new sentence out loud to a partner first. Then write it.";

// Shown (and read) when the comparison finds nothing new. It asks for one change and no more,
// because each piece of writing is compared once.
export const NO_WINS = "I could not spot a change yet. Pick one power-up and make just that one change in your book. Then show your teacher.";

export const listensForYear = (yearLevel) => Number(yearLevel) >= 1 && Number(yearLevel) <= 3;

// Words only: no arrows or marks read out, brackets become pauses, spaces tidied.
export function plain(text) {
  return (typeof text === "string" ? text : "")
    .replace(/\s*(?:->|→|=>)\s*/g, " becomes ")
    .replace(/\^/g, "caret")
    .replace(/\s*\(([^)]*)\)/g, ", $1,")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*([.!?])/g, "$1")
    .replace(/[*_`#|~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// One tidy sentence: ends in a full stop unless it already ends in . ! ? or an ellipsis
// (a closing quote after the stop is fine). Empty stays empty.
export function sentence(text) {
  const t = plain(text);
  if (!t) return "";
  return /[.!?…]["'”’)]*$/.test(t) ? t : `${t}.`;
}

const noStop = (text) => plain(text).replace(/[.!?]+$/, "");

const join = (...parts) => parts.map(sentence).filter(Boolean).join(" ");

export const joinOr = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}` : items[0] || "");

// Keeps a request under the server's cap. Cuts at the end of the last whole sentence that fits.
export function fit(text, max = MAX_SPOKEN) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (stop > 0) return cut.slice(0, stop + 1);
  const space = cut.lastIndexOf(" ");
  return space > 0 ? cut.slice(0, space) : cut;
}

// Text that sits on the page already (the pencil steps, the challenge instructions), read in order.
export const staticSpoken = (...parts) => fit(join(...parts));

export function strengthsSpoken(criteria) {
  const powers = heroPowers(criteria);
  if (!powers.length) return "";
  return fit(join("What you did well", ...powers.flatMap((power) => [power.label, power.text])));
}

export function focusSpoken(criteria, powerUps) {
  const focus = nextFocus(criteria, powerUps);
  return focus ? fit(join("Your next focus", focus.text, focus.task && `Do this. ${focus.task}`)) : "";
}

// One power-up card, top to bottom as it shows: title, why, the line in the book, the strategy
// (name, rule, before and after), the job, and the say-it-out-loud line.
export function powerUpSpoken(p, { sayAloud = false } = {}) {
  if (!p) return "";
  return fit(
    join(
      p.skill,
      p.why,
      p.yourLine && "Find this line in your book",
      p.yourLine,
      p.move ? `Use the strategy, ${p.move.name}` : p.rule || p.example ? "See an example" : "",
      p.rule,
      p.example && `For example, ${noStop(p.example.before)} becomes ${p.example.after}`,
      p.nowYou && "Do this",
      p.nowYou,
      sayAloud && p.nowYou && SAY_ALOUD,
    ),
  );
}

// Word power: each word with its four stronger words, then the two example sentences.
export function wordPowerSpoken(boost) {
  if (!boost) return "";
  const swaps = (boost.swaps || []).map(({ from, to }) => `Instead of ${from}, try ${joinOr(to)}`);
  return fit(
    join(
      "Word power",
      swaps.length && "Each word gets four upgrades, from a small step up to a big one",
      ...swaps,
      boost.before && boost.after && "In your writing",
      boost.before && boost.after && boost.before,
      boost.before && boost.after && "Like this",
      boost.before && boost.after && boost.after,
    ),
  );
}

// The synonym challenge: its title and instructions, then the words to think about.
export function challengeSpoken(instructions, challenge = []) {
  const words = challenge.map((item) => item.word).filter(Boolean);
  return fit(join("Your turn, synonym challenge", instructions, words.length && `The words are ${joinOr(words)}`));
}

export function editingCountSpoken(value) {
  return value === null ? editingCaption(null) : value === 0 ? editingCaption(0) : `${value} ${editingCaption(value)}`;
}

// The editing card: each count with its tip, then the advice and the rough-guide note.
export function editingSpoken(errorTotals, yearLevel) {
  const items = editingItems(yearLevel);
  const counts = items.map((item) => editingCount(errorTotals, item.key));
  const confirmed = counts.filter((value) => value !== null).length;
  return fit(
    join(
      "Editing",
      "Here are the errors to find in your writing",
      ...items.flatMap((item, i) => [item.short, editingCountSpoken(counts[i]), item.tip]),
      editingAdvice(confirmed, items.length),
      ROUGH_NOTE,
    ),
  );
}

// The spelling block: instructions only. Never any word, the child's or the right one (the
// voice would mispronounce it or give the answer away).
export function spellingSpoken(status, count) {
  if (status !== "words") return fit(join("Spelling", spellingStatusText(status)));
  const n = Number.isSafeInteger(count) && count > 0 ? count : 0;
  const some = n === 1 ? "1 word" : n > 1 ? `${n} words` : "some words";
  return fit(
    join(
      "Spelling",
      `Look at ${some} to fix`,
      "Say each word slowly in parts. Type a new spelling in the box, then press Check",
    ),
  );
}

// A spelling hint, read aloud: the hint text only. The child's misspelt word and their tries are
// swapped for "your word", so the voice never mispronounces them (or gives anything away).
// Words of three letters or fewer are not swapped ("to" would garble the sentence). The page passes
// no words at all for sound-alikes, whose hints are about meaning.
export function spellingHintSpoken(hint, ...avoid) {
  let text = plain(hint);
  for (const word of avoid.filter((w) => typeof w === "string" && w.trim().length > 3)) {
    const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`(^|[^\\p{L}])${escaped}(?![\\p{L}])`, "giu"), "$1your word");
  }
  return fit(join(text));
}

// After the third wrong try only: the right word, then the tip. It is said as a word, never letter by letter.
export function spellingRevealSpoken(correct) {
  return fit(join(`The word is ${plain(correct)}`, "Say each sound as you write it in your book"));
}

// The Mission complete recap, row by row: each job, short, as it shows on the page.
export function missionSpoken(feedback, yearLevel) {
  const rows = missionRows(feedback, yearLevel).flatMap((row) => [
    row.label,
    row.job,
  ]);
  return fit(join("Your mission", "Here are the jobs you ticked along the way. Tick any you have done since, then read it again", ...rows));
}

// "What got better": the cheer, each win with the new words it came from, then the next step.
// A "looks the same" reply reads only its own message.
export function levelUpSpoken(result) {
  if (!result) return "";
  if (result.unchanged) return fit(join(result.cheer));
  const wins = result.wins || [];
  return fit(
    join(
      "What got better",
      result.cheer,
      ...(wins.length ? wins.flatMap((win) => [win.what, "In your new writing", win.evidence]) : [NO_WINS]),
      result.next && "Your next step",
      result.next,
    ),
  );
}
