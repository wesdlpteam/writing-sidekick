// The ten areas writing markers look at (the categories used in Australia's national writing
// assessment), described here in our own words for the model and for the child. Story-style
// pieces judge "Characters and setting"; persuasive pieces judge "Persuasive devices"; reports
// and poems use the nine shared areas. Also: the writing moves the school teaches (The Writing
// Revolution approach), which the feedback names when a power-up shows one, each with a plain
// explanation and an example of our own.

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
      "Does the writing flow as one piece? Pronouns that clearly refer back, transition words (then, later, meanwhile, however, because, for example), word families and synonyms instead of repeating the same noun, and tense that stays steady.",
  },
  paragraphing: {
    label: "Paragraphing",
    sub: "chunking your ideas",
    guide:
      "Is the text chunked so the reader can follow it? A new paragraph for a new time, place, person or idea in a story; one paragraph per reason in persuasive writing, opening with a topic sentence and closing with a concluding sentence; verses in a poem. One block of text is the normal starting point for the youngest writers, so judge by year level.",
  },
  sentence_structure: {
    label: "Sentence structure",
    sub: "building good sentences",
    guide:
      "Are sentences complete and correct (no fragments), and is there variety? Look for a mix of short and long sentences, simple, compound and complex sentences, different sentence openers such as subordinating conjunctions, expanded sentences that say when, where, why and how, and no run-on sentences joined with and, and, and.",
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

// The writing moves the school teaches, following The Writing Revolution approach (sentences
// first, then paragraphs; revise before you edit). Names are the ones children hear in class,
// written out in full; the explanations and examples are our own. minYear follows the usual
// order the moves are introduced, so a Year 2 is never handed an appositive.
export const MOVES = {
  sentence_types: {
    name: "Sentence types",
    minYear: 1,
    rule: "Say an idea as a statement, a question, a command or an exclamation. Swapping one in changes the pace and wakes the reader up.",
    example: "What a monster wave that was!",
  },
  fragment_fix: {
    name: "Sentences and fragments",
    minYear: 1,
    rule: "A fragment is only a piece of a sentence, like 'Because it was raining.' Add the missing who and what to make it a whole sentence.",
    example: "We stayed inside because it was raining.",
  },
  because_but_so: {
    name: "Because, but, so",
    minYear: 1,
    rule: "Finish a thin sentence with because (the reason), but (a change of direction) or so (what happened next). Each one pushes you to say more.",
    example: "The dog barked because a possum was on the fence.",
  },
  sentence_expansion: {
    name: "Sentence expansion",
    minYear: 2,
    rule: "Start with a bare kernel sentence like 'The surfer paddled out.' and add when, where, why or how. The when usually goes at the front, followed by a comma.",
    example: "At sunrise, the surfer paddled out past the break to catch the first wave.",
  },
  subordinating_conjunction: {
    name: "Subordinating conjunction start",
    minYear: 2,
    rule: "Begin with a joining word like Although, When, Since, After, Before, If or Even though, write that first part, add a comma, then finish the sentence.",
    example: "When the bell rang, we sprinted to the oval.",
  },
  transition: {
    name: "Transition word",
    minYear: 2,
    rule: "A signpost word at the start of a sentence that links it to the one before: First, Next, Later or Finally for time; For example to illustrate; However or On the other hand to change direction; Therefore or In the end to conclude.",
    example: "Later, the rain finally stopped.",
  },
  vary_vocabulary: {
    name: "Vary vocabulary",
    minYear: 2,
    rule: "Swap a plain or repeated word for one that says exactly what you mean: went becomes trudged, big becomes towering, said becomes whispered.",
    example: "The exhausted hikers trudged up the final hill.",
  },
  sentence_combining: {
    name: "Sentence combining",
    minYear: 3,
    rule: "Join two or three short sentences into one using and, but, because or so, a pronoun, or a describing phrase, so the writing stops sounding choppy.",
    example: "The tent was tiny and wet, so nobody slept.",
  },
  topic_sentence: {
    name: "Topic sentence",
    minYear: 3,
    rule: "The first sentence of a paragraph, telling the reader what the whole paragraph is about.",
    example: "Our school needs a bigger playground for three reasons.",
  },
  concluding_sentence: {
    name: "Concluding sentence",
    minYear: 3,
    rule: "The last sentence of a paragraph, saying the topic sentence's idea again in a new way so the paragraph feels finished.",
    example: "That is why a bigger playground would make every lunchtime better.",
  },
  appositive: {
    name: "Appositive",
    minYear: 4,
    rule: "A short description tucked in straight after a person or thing, between commas. Take it out and the sentence still works.",
    example: "Our teacher, a huge footy fan, wore her scarf to school.",
  },
  general_to_specific_intro: {
    name: "General to specific introduction",
    minYear: 5,
    rule: "Open with a broad statement about the topic, narrow to a specific one, then state your position or main idea as the last sentence of the introduction.",
    example: "Every school has a playground. Ours is the smallest in the district. It is time we built a bigger one.",
  },
  specific_to_general_conclusion: {
    name: "Specific to general conclusion",
    minYear: 5,
    rule: "Do the introduction in reverse: restate your position, sum up your specific points, then finish with a broad closing thought.",
    example: "A bigger playground is worth every cent. It would ease the crowding and give every class room to run. Good schools give children space to play.",
  },
};

export function movesFor(yearLevel) {
  return Object.entries(MOVES)
    .filter(([, m]) => m.minYear <= yearLevel)
    .map(([key, m]) => ({ key, ...m }));
}

export function movesPrompt(yearLevel) {
  const lines = movesFor(yearLevel).map((m) => `- ${m.key}: ${m.name}. ${m.rule}`);
  return `Writing moves the school teaches (the child practises these in class, so build power-ups on them wherever they fit, and phrase "now_you" as a task that uses the move on their own writing, for example "Find your sentence about the waves and expand it: add when and where"). When a power-up's "try_this" clearly shows one of these moves, name it with the exact key in "move"; otherwise use null:
${lines.join("\n")}
Revising comes before editing: power-ups are revising moves. Spelling and punctuation are editing and belong in practice_words and the spelling and punctuation areas.`;
}

// The explanation shown to the child, or null if the key is unknown or too advanced for the year.
export function describeMove(key, yearLevel) {
  const m = MOVES[key];
  if (!m || m.minYear > yearLevel) return null;
  return { key, name: m.name, rule: m.rule, example: m.example };
}
