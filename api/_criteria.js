// The ten areas writing markers look at (the categories used in Australia's national writing
// assessment), described here in our own words for the model and for the child. Story-style
// pieces judge "Characters and setting"; persuasive pieces judge "Persuasive devices"; reports
// and poems use the nine shared areas. Also: the twelve sentence types the feedback can name
// when it rewrites one of the child's sentences, each with a plain explanation and an example.

export const CRITERIA = {
  audience: {
    label: "Audience",
    sub: "hooking and helping your reader",
    guide:
      "Does the writing pull the reader in and give them what they need to follow it? Look for a hook, a sense of who is speaking, humour or suspense, talking to the reader, and enough information that the reader is never lost.",
  },
  text_structure: {
    label: "Text structure",
    sub: "beginning, middle and end",
    guide:
      "Does the piece have the shape its type needs, and do the parts work together? Story or recount: a beginning that sets things up, a problem or main event, and an ending that finishes the story rather than just stopping. Persuasive: an introduction that states the position, a body with one reason at a time, a conclusion that comes back to the position. Report: an opening statement, grouped facts, an ending. Poem: a deliberate shape of lines and verses.",
  },
  ideas: {
    label: "Ideas",
    sub: "what your writing is about",
    guide:
      "Are the ideas on topic, connected, and developed with detail rather than just listed? Stronger pieces choose ideas that build one storyline or one line of argument; the strongest suggest a theme or a bigger point.",
  },
  character_setting: {
    label: "Characters and setting",
    sub: "who, where and when",
    guide:
      "Do we get to know the people through what they do, say, think and feel (not just their names), and can we picture where and when it happens, including the mood of the place?",
  },
  persuasive_devices: {
    label: "Persuasive devices",
    sub: "the moves that convince",
    guide:
      "The moves that convince a reader: an opinion backed by reasons, modal words (should, must, might), rhetorical questions, talking straight to the reader, emotive words, repetition, facts or examples, answering the other side. Judge how many are used and whether they actually work.",
  },
  vocabulary: {
    label: "Vocabulary",
    sub: "your word choices",
    guide:
      "Range and precision of word choices: exact verbs and nouns, well-chosen adjectives and adverbs, figurative language, words that suit the type of writing, instead of plain all-purpose words like went, big, nice and good.",
  },
  cohesion: {
    label: "Cohesion",
    sub: "how your ideas link up",
    guide:
      "Does the writing flow as one piece? Pronouns that clearly refer back, linking words (then, later, meanwhile, however, because), word families and synonyms instead of repeating the same noun, and tense that stays steady.",
  },
  paragraphing: {
    label: "Paragraphing",
    sub: "chunking your ideas",
    guide:
      "Is the text chunked so the reader can follow it? A new paragraph for a new time, place, person or idea in a story; one paragraph per reason, with a topic sentence, in persuasive writing; verses in a poem. One block of text is the normal starting point for the youngest writers, so judge by year level.",
  },
  sentence_structure: {
    label: "Sentence structure",
    sub: "building good sentences",
    guide:
      "Are sentences complete and correct, and is there variety? Look for a mix of short and long sentences, simple, compound and complex sentences, different sentence openers, and no run-on sentences joined with and, and, and.",
  },
  punctuation: {
    label: "Punctuation",
    sub: "capitals, full stops and more",
    guide:
      "Capital letters and end marks on every sentence first; then commas in lists and after openers, apostrophes, speech marks with the capitals and commas inside them, and question or exclamation marks used for effect.",
  },
  spelling: {
    label: "Spelling",
    sub: "getting words right",
    guide:
      "Accuracy on simple, common and harder words the child attempts, and whether they are having a go at ambitious words.",
  },
};

// Marker order. The genre slot is filled per kind of writing.
const ORDER = ["audience", "text_structure", "ideas", "GENRE", "vocabulary", "cohesion", "paragraphing", "sentence_structure", "punctuation", "spelling"];

const GENRE_SLOT = {
  narrative: ["character_setting"],
  recount: ["character_setting"],
  persuasive: ["persuasive_devices"],
  report: [],
  poetry: [],
  // Kind of writing not chosen: the model includes whichever of the two fits the piece.
  "": ["character_setting", "persuasive_devices"],
};

// Returns the areas to judge for this kind of writing, in marker order. `slot` is true for the
// genre-specific areas (when there are two, the model picks one).
export function criteriaFor(genre) {
  const slot = GENRE_SLOT[genre] ?? GENRE_SLOT[""];
  return ORDER.flatMap((key) =>
    key === "GENRE"
      ? slot.map((k) => ({ key: k, ...CRITERIA[k], slot: true, choice: slot.length > 1 }))
      : [{ key, ...CRITERIA[key], slot: false, choice: false }],
  );
}

export const STATUSES = ["strength", "steady", "next_step"];

export function criteriaPrompt(genre) {
  const areas = criteriaFor(genre);
  const choice = areas.filter((a) => a.choice);
  const lines = areas.map((a) => `- ${a.key} (${a.label}): ${a.guide}`);
  const choiceNote = choice.length
    ? `\nThe kind of writing was not chosen. Include EITHER character_setting (stories, recounts, descriptions) OR persuasive_devices (opinion pieces, arguments), whichever fits this piece, not both.`
    : "";
  return `Judge the writing in each of these areas. These are the areas writing markers look at; use the exact keys given.
${lines.join("\n")}${choiceNote}

For every area give a status, judged against THIS year level (a Year 1 writer is not expected to paragraph; a Year 6 writer is):
- "strength": done well for this year and worth naming, so the child can do it again on purpose
- "steady": there and mostly working; one specific tweak would lift it
- "next_step": missing or weak for this year; these are the best candidates for a power-up
Be honest: a typical piece has two to four strengths, several steady areas and two or three next steps. Never mark everything as a strength.`;
}

// The sentence types the feedback may name when a power-up rewrites one of the child's sentences.
// Names follow the "12 ways to write a sentence" set many classrooms use; the explanations and
// examples are our own, written for primary readers. minYear keeps the type realistic for the year.
export const SENTENCE_TYPES = {
  simple: {
    name: "Simple sentence",
    minYear: 1,
    rule: "Starts with who or what it is about, then says what happens. One clear idea.",
    example: "The puppy chased the ball.",
  },
  very_short: {
    name: "Very short sentence",
    minYear: 1,
    rule: "Five words or fewer. It grabs attention, especially after a long sentence.",
    example: "Nobody moved.",
  },
  power: {
    name: "Power sentence",
    minYear: 3,
    rule: "Twelve words or fewer and straight to the point. Great for the first sentence of a paragraph.",
    example: "Our school needs a bigger playground.",
  },
  red_white_blue: {
    name: "Red, white and blue sentence",
    minYear: 2,
    rule: "Lists three things, with commas between them and 'and' before the last one.",
    example: "We packed towels, snacks and a big umbrella.",
  },
  adverb_start: {
    name: "Adverb start",
    minYear: 2,
    rule: "Begins with an -ly word like Suddenly, Quietly or Luckily, then a comma, then the rest.",
    example: "Suddenly, the lights went out.",
  },
  preposition_start: {
    name: "Preposition start",
    minYear: 2,
    rule: "Begins with a little place or time word (In, Under, After, Behind, At) and a short phrase, then a comma.",
    example: "Under the old bridge, a troll was snoring.",
  },
  ing_start: {
    name: "-ing start",
    minYear: 3,
    rule: "Begins with an -ing word phrase (Gripping the rope, Hoping to win), then a comma, then who did it and what happened.",
    example: "Gripping the rope, I stepped onto the wobbly bridge.",
  },
  ed_start: {
    name: "-ed start",
    minYear: 4,
    rule: "Begins with an -ed word (Exhausted, Delighted, Frozen) or a short -ed phrase, then a comma, then the rest.",
    example: "Exhausted, the runners collapsed on the grass.",
  },
  semicolon: {
    name: "Semi-colon sentence",
    minYear: 5,
    rule: "Two mini sentences that belong together, joined with a semi-colon (;) instead of 'and' or 'but'.",
    example: "The tent was tiny; the storm was enormous.",
  },
  em_dash: {
    name: "Dash sentence",
    minYear: 5,
    rule: "Drops a surprising extra phrase into the middle of a sentence, between two dashes.",
    example: "My brother — the world's slowest eater — finished last again.",
  },
  w_start: {
    name: "W-start sentence",
    minYear: 2,
    rule: "Begins with a W word (When, While, Where, Who, What, With), then a comma after the first part, then the rest.",
    example: "When the bell rang, we sprinted to the oval.",
  },
  explore_subject: {
    name: "Explore-the-subject sentence",
    minYear: 4,
    rule: "Names the subject, adds a comma and an interesting fact about it, adds another comma, then finishes the sentence.",
    example: "Our teacher, who never misses a footy game, wore her team scarf to school.",
  },
};

export function sentenceTypesFor(yearLevel) {
  return Object.entries(SENTENCE_TYPES)
    .filter(([, t]) => t.minYear <= yearLevel)
    .map(([key, t]) => ({ key, ...t }));
}

export function sentenceTypesPrompt(yearLevel) {
  const lines = sentenceTypesFor(yearLevel).map((t) => `- ${t.key}: ${t.name}. ${t.rule}`);
  return `Sentence types you may name (use the exact key) when a power-up's "try_this" is a whole rewritten sentence that clearly matches one of these; otherwise use null:
${lines.join("\n")}`;
}

// The explanation shown to the child, or null if the key is unknown or too advanced for the year.
export function describeSentenceType(key, yearLevel) {
  const t = SENTENCE_TYPES[key];
  if (!t || t.minYear > yearLevel) return null;
  return { key, name: t.name, rule: t.rule, example: t.example };
}
