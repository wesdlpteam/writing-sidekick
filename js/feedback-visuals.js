export const WRITING_STATUS_LABELS = {
  strength: "Strength", steady: "On track", next_step: "Next step", not_assessed: "Need more writing",
};

// Writing craft and editing are separate. Unassessed skills remain visible, but are
// never counted as a result or selected as a strength or improvement target.
export function writingStrength(criteria = []) {
  const areas = criteria.filter((area) => !["spelling", "punctuation"].includes(area.key)
    && Object.prototype.hasOwnProperty.call(WRITING_STATUS_LABELS, area.status));
  const assessed = areas.filter(area => area.status !== "not_assessed");
  const unassessed = areas.length - assessed.length;
  const strong = assessed.filter(area => area.status === "strength").length;
  const key = areas.find((area) => area.status === "strength");
  const focus = assessed.find((area) => area.powerUp === 1) || assessed.find((area) => area.status === "next_step");
  return {
    areas,
    assessed: assessed.length,
    unassessed,
    strong,
    // No counts and no scores: only a gentle note when there is too little writing to judge.
    summary: !assessed.length ? "We need more writing to check these skills." : unassessed ? "Some skills need more writing to check." : "",
    keyStrength: key?.label || (assessed.length ? "Keep building your writing skills" : "Need more writing"),
    keyStrengthKey: key?.key || "",
    focus: focus?.label || (assessed.length ? "Keep stretching your skills" : "Need more writing"),
    focusKey: focus?.key || "",
  };
}

// Shared by print and saved picture so uncertain areas cannot become implied strengths.
export function writingStrengthLines(criteria = []) {
  const summary = writingStrength(criteria);
  return [summary.summary, ...summary.areas.map(area =>
    `${area.label}: ${WRITING_STATUS_LABELS[area.status]}.${area.status === "not_assessed" && area.assessmentNote ? ` ${area.assessmentNote}` : ""}`)].filter(Boolean);
}

// What each writing skill means, in words a child can read. Tapping a skill on the writing
// strength card shows this, so "Audience" is never just a mystery word. Our own words, kept
// short; the ten area names follow the national writing criteria.
export const SKILL_GUIDE = {
  audience: {
    what: "Your reader. This skill is about pulling your reader in and keeping them with you.",
    how: "A hook at the start, a bit of fun or suspense, and enough detail that your reader is never lost.",
  },
  text_structure: {
    what: "The shape of your writing: a beginning, a middle and an end that fit together.",
    how: "A beginning that sets things up, a middle where things happen, and an ending that finishes it off instead of just stopping.",
  },
  ideas: {
    what: "What your writing is about, and how well you build it up.",
    how: "Ideas that stay on topic, connect to each other, and grow with details instead of being a list.",
  },
  character_setting: {
    what: "The who, the where and the when of your story.",
    how: "We get to know your characters by what they do, say, think and feel, and we can picture the place and the time.",
  },
  persuasive_devices: {
    what: "The ways you convince your reader to agree with you.",
    how: "Reasons, facts or examples, strong words like 'must' and 'should', questions that make the reader think, and talking straight to them.",
  },
  vocabulary: {
    what: "Your word choices.",
    how: "Exact, interesting words (crept, gigantic, whispered) instead of plain ones (went, big, said).",
  },
  cohesion: {
    what: "How your ideas link up so the writing flows as one piece.",
    how: "Transition words like 'Later' and 'However', pronouns that make sense, and a tense that stays the same all the way through.",
  },
  paragraphing: {
    what: "Chunking your ideas so the reader can follow along.",
    how: "A new paragraph for a new time, place, person or idea, with a topic sentence to start it.",
  },
  sentence_structure: {
    what: "Building good sentences.",
    how: "Complete sentences, a mix of short and long, different ways to start, and no run-ons joined with and, and, and.",
  },
  punctuation: {
    what: "The marks that help your reader: capitals, full stops, commas and more.",
    how: "A capital and a full stop on every sentence, then commas, apostrophes, speech marks and question or exclamation marks in the right spots.",
  },
  spelling: {
    what: "Getting words right.",
    how: "Spelling the words you know, and having a real go at harder ones.",
  },
};

export function skillExplanation(key) {
  return SKILL_GUIDE[key] || { what: "One of the skills writers use.", how: "" };
}

// The child's real strengths, quoting their writing: writing-craft areas first (full strengths,
// then areas that are on track but still have something worth naming). Spelling and punctuation
// only fill the gaps when there are fewer than `max` craft entries. What the first slide shows.
export function heroPowers(criteria = [], max = 3) {
  const named = criteria.filter((area) => area.strength);
  const pick = (areas) => [
    ...areas.filter((area) => area.status === "strength"),
    ...areas.filter((area) => area.status === "steady"),
  ];
  const isEditing = (area) => area.key === "spelling" || area.key === "punctuation";
  const ordered = [...pick(named.filter((area) => !isEditing(area))), ...pick(named.filter(isEditing))];
  return ordered.slice(0, max).map((area) => ({ key: area.key, label: area.label, text: area.strength }));
}

// What to do next, in plain words: power-up 1's skill title (with its number, so the first slide
// can offer a button to it), or else the first next-step area's own words. Null if neither.
export function nextFocus(criteria = [], powerUps = []) {
  // The title alone can be cryptic ("Finish the When thought"), so the job itself comes too.
  if (powerUps.length && powerUps[0].skill) return { text: powerUps[0].skill, task: powerUps[0].nowYou || "", powerUp: 1 };
  const area = criteria.find((c) => c.status === "next_step" && c.nextStep);
  return area ? { text: area.nextStep, powerUp: 0 } : null;
}

// The editing counts shown to the child: capitals, then one row per punctuation type the year
// has met (Y1 sentence endings, Y2 + commas in lists, Y3 + apostrophes, Y4-6 + speech marks),
// each with a short how-to-hunt tip. Spelling is not a count: it is a list of words (below).
// A count that is missing or not a whole number is never guessed (it shows "?" and "Not available").
const EDITING_CAPITALS = {
  key: "capital_letters", short: "Capitals", plain: "Capital letters", errorLabel: "Capital letter errors", symbol: "Aa",
  tip: "Check the first word of every sentence, names, and the word I.",
};
const EDITING_FULL_STOPS = {
  key: "full_stops", short: "Sentence endings", plain: "Sentence endings", errorLabel: "Sentence ending errors", symbol: ".",
  tip: "Read it out loud. Where your voice stops and a new idea starts, check for a full stop, question mark or exclamation mark.",
};
const EDITING_LIST_COMMAS = {
  key: "list_commas", short: "Commas in lists", plain: "Commas in lists", errorLabel: "Comma in list errors", symbol: ",",
  tip: "Find any list of things, like red, green and blue. Check there is a comma between the things.",
};
const EDITING_APOSTROPHES = {
  key: "apostrophes", short: "Apostrophes", plain: "Apostrophes", errorLabel: "Apostrophe errors", symbol: "'",
  tip: "Look for short words like don't and for things that belong to someone, like Mia's dog. Check each one has its apostrophe.",
};
const EDITING_SPEECH = {
  key: "speech", short: "Speech marks", plain: "Speech marks", errorLabel: "Speech mark errors", symbol: "“”",
  tip: "Find the words someone says. Check they have speech marks around them, and a comma before the speaker, like \"Hello,\" said Mia.",
};

export function editingItems(yearLevel) {
  const year = Number(yearLevel);
  const items = [EDITING_CAPITALS, EDITING_FULL_STOPS];
  if (year >= 2) items.push(EDITING_LIST_COMMAS);
  if (year >= 3) items.push(EDITING_APOSTROPHES);
  if (year >= 4) items.push(EDITING_SPEECH);
  return items;
}

export function editingCount(errorTotals, key) {
  const value = errorTotals?.[key];
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

// The words under an editing count ("No errors found", "error to find"), and the advice line
// under the counts. Shared by the card and by the read-aloud text so the two always agree.
export function editingCaption(value) {
  return value === null ? "Not available" : value === 0 ? "No errors found" : value === 1 ? "error to find" : "errors to find";
}

export const EDITING_TASK = "Go back to your writing. Find and fix the errors, then read it again to check.";
// The audit's punctuation and capital calls vary from try to try, so the counts are a guide.
export const ROUGH_NOTE = "These numbers are a rough guide and may not be exact.";

export function editingAdvice(confirmed, total) {
  return confirmed === total ? EDITING_TASK : confirmed > 0
    ? "Use the counts shown to check your writing. Ask your teacher to help with any count marked Not available."
    : "We couldn't confirm the error counts this time. Read your writing with your teacher and check it together.";
}

// Print and saved picture lines, in the same order as the card. `long` picks the print wording
// ("Capital letter errors") over the picture's ("Capital letters").
export function editingLines(errorTotals, yearLevel, { long = false } = {}) {
  return editingItems(yearLevel).map((item) => {
    const count = editingCount(errorTotals, item.key);
    return `${long ? item.errorLabel : item.plain}: ${count === null ? "Not available" : count}`;
  });
}

// Spelling words for print and the saved picture. Only what the child wrote, never the right
// spelling: the blank line is where they write it in their book.
export const SPELLING_UNAVAILABLE = "We couldn't check spelling this time. Read it with your teacher.";
export const SPELLING_NONE_TO_PRACTISE = "No spelling words to practise this time.";
export const SPELLING_CLEAR = "Great job! We found no spelling words to fix.";

// The sentence for a spelling status that has no word list ("" while there are words to show).
export function spellingStatusText(status) {
  if (status === "words") return "";
  if (status === "clear") return SPELLING_CLEAR;
  if (status === "none_to_practise") return SPELLING_NONE_TO_PRACTISE;
  return SPELLING_UNAVAILABLE;
}

export function spellingLines(spellingStatus, spellingWords = []) {
  const words = (Array.isArray(spellingWords) ? spellingWords : []).map((item) => item?.wrote).filter(Boolean);
  if (spellingStatus === "words" && words.length) return words.map((wrote) => `${wrote}  ____________`);
  return [spellingStatus === "words" ? SPELLING_UNAVAILABLE : spellingStatusText(spellingStatus)];
}

// The mission jobs, built from the feedback: one row per power-up (its line and its job), a Word
// power row if there is word power, an Edit row for the year, then "read it again". `line` and
// `job` may be empty; the row then shows only what it has. `done` is the tick box wording the
// child sees on the page where they do that job; Mission complete shows them all again.
export function missionRows(feedback, yearLevel) {
  const rows = (feedback?.powerUps || []).map((p, index) => ({
    key: `power-${index}`,
    label: `Power-up ${index + 1}`,
    line: p.yourLine || "",
    job: p.nowYou || p.skill || "",
    done: `I did power-up ${index + 1} in my book.`,
  }));
  if (feedback?.wordBoost) rows.push({ key: "word", label: "Word power", line: "", job: "Swap in stronger words where they fit.", done: "I swapped in stronger words." });
  const junior = Number(yearLevel) <= 2;
  rows.push({
    key: "edit",
    label: "Edit",
    line: "",
    job: junior ? "Check your capital letters and full stops." : "Check your spelling, punctuation and capital letters.",
    done: junior ? "I checked my capital letters and full stops." : "I checked my spelling, punctuation and capital letters.",
  });
  rows.push({ key: "read", label: "Read it again", line: "", job: "Read it again like a reader would. Does it sound even better?", done: "I read it again like a reader." });
  return rows;
}

// ---- round 2: "Snap my writing again" -----------------------------------------------------

// What goes to the server to compare the first version with the revised one: the two typed
// copies and the power-ups the child was given (just what the comparison needs).
export function levelUpRequest(feedback, before, after) {
  return {
    before,
    after,
    powerUps: (feedback?.powerUps || []).map((p) => ({ skill: p.skill, area: p.areaLabel, nowYou: p.nowYou, move: p.move?.name })),
    practiceWords: [],
  };
}

// One AI comparison per piece of writing. A "looks the same" reply is answered for free without
// the model (the server marks it unchanged), so it does not use up the child's turn.
export const usedComparison = (reply) => Boolean(reply) && reply.unchanged !== true;
