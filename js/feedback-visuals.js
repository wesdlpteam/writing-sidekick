export const WRITING_STATUS_LABELS = {
  strength: "Strength", steady: "On track", next_step: "Next step", not_assessed: "Need more writing",
};

// Writing craft and editing are separate. Unassessed skills remain visible, but are
// never counted as a result or selected as a strength or improvement target.
export function writingStrength(criteria = []) {
  const areas = criteria.filter((area) => !["spelling", "punctuation"].includes(area.key)
    && Object.hasOwn(WRITING_STATUS_LABELS, area.status));
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
    summary: [assessed.length ? `We checked ${assessed.length} writing ${assessed.length === 1 ? "skill" : "skills"}. ${strong} ${strong === 1 ? "shows" : "show"} strength.` : "We need more writing to check these skills.",
      assessed.length && unassessed ? `${unassessed} ${unassessed === 1 ? "needs" : "need"} more writing to check.` : ""].filter(Boolean).join(" "),
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
    `${area.label}: ${WRITING_STATUS_LABELS[area.status]}.${area.status === "not_assessed" && area.assessmentNote ? ` ${area.assessmentNote}` : ""}`)];
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

// The child's real strengths, quoting their writing: full strengths first, then areas that
// are on track but still have something worth naming. What the "hero powers" card shows.
export function heroPowers(criteria = [], max = 3) {
  const named = criteria.filter((area) => area.strength);
  const strong = named.filter((area) => area.status === "strength");
  const steady = named.filter((area) => area.status === "steady");
  return [...strong, ...steady].slice(0, max).map((area) => ({ key: area.key, label: area.label, text: area.strength }));
}
