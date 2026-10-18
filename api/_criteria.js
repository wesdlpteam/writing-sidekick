// The ten areas writing markers look at (the categories used in Australia's national writing
// assessment), described here in our own words for the model and for the child. Story-style
// pieces judge "Characters and setting"; persuasive pieces judge "Persuasive devices"; reports
// and poems use the nine shared areas. Also: the writing strategies the school teaches (The Writing
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
      "Does the piece have the shape its type needs, and do the parts work together? Story or recount: a beginning that sets things up, a problem or main event, and an ending that finishes the story rather than just stopping. Persuasive: an introduction that states the position, a body with one reason at a time, a conclusion that comes back to the position (in Years 1 to 4, a clear position up front followed by real reasons, in one paragraph or several, is enough; a call to action at the end is a strength). Report: an opening statement, grouped facts, an ending. Poem: a deliberate shape of lines and verses.",
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
    sub: "the ways to convince",
    guide:
      "The ways a writer convinces a reader: an opinion backed by reasons, modal words (should, must, might), rhetorical questions, talking straight to the reader, emotive words, repetition, facts or examples, answering the other side. Judge the quality of the reasons (a fact, an example or an explanation, not the opinion said again; personal experience counts) and whether the devices actually work, never just how many are used. In Years 1 to 4 this is an opinion piece: a clear position up front and real reasons are the goal, and evidence or answering the other side are stretches, never a next step. In Years 5 and 6 the writer may answer the other side in one 'Although ...' sentence or in its own paragraph, never raising and rebutting in the same paragraph.",
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
      "Does the writing flow as one piece? Pronouns that clearly refer back, transition words that link sentences and also paragraphs (then, later, meanwhile, however, because, for example), word families and synonyms instead of repeating the same noun, and tense that stays steady.",
  },
  paragraphing: {
    label: "Paragraphing",
    sub: "chunking your ideas",
    guide:
      "Is the text chunked so the reader can follow it? A new paragraph for a new time, place, person or idea in a story; one main idea per paragraph, so a paragraph holding two main ideas should be split; in persuasive writing one paragraph per reason, each body paragraph opening with a topic sentence, and the whole piece finishing with ONE concluding statement (a single paragraph ends with its own concluding sentence); verses in a poem. One block of text is the normal starting point for the youngest writers, so judge by year level.",
  },
  sentence_structure: {
    label: "Sentence structure",
    sub: "building good sentences",
    guide:
      "Are sentences complete and correct (no half sentences left hanging), and is there variety? Look for a mix of short and long sentences, simple, compound and complex sentences, sentences that begin with a subordinating conjunction, expanded sentences that say when, where, why and how, and no run-on sentences joined with and, and, and.",
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

export const STATUSES = ["strength", "steady", "next_step", "not_assessed"];

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
- "not_assessed": this sample does not provide enough evidence to judge this area; give a brief assessment_note explaining the limitation, and leave strength and next_step empty
Be honest and judge only what is on the page. A short extract or separate practice exercise may not show whole-text structure or paragraphing: use "not_assessed", never "steady" as a substitute for uncertainty. Do not invent a weakness, praise or remedial task for an unassessable area. Still assess skills visible in a short sample, such as a complete sentence; do not mark everything unassessable just because it is brief. Judge against the task and year: a young writer's appropriately short piece need not demonstrate older students' paragraphing. Strong work can have mostly strengths. Never mark everything as a strength when the writing has not earned it.`;
}

// The writing strategies the school teaches, following The Writing Revolution approach (sentences
// first, then paragraphs; revise before you edit). Names are the ones children hear in class,
// written out in full; the explanations and examples are our own. minYear sets eligibility,
// not task difficulty. Section III supports simple expansion/elaboration in Year 1 and
// supported combining in Year 2; retain later gates for appositives and essay scaffolds.
export const MOVES = {
  sentence_types: {
    name: "Sentence types",
    minYear: 1,
    rule: "Say an idea as a statement, a question, a command or an exclamation. Swapping one in changes the pace and wakes the reader up.",
    example: "What a monster wave that was!",
  },
  // The book's own term, kept with its meaning. Its fragment example is a missing who or what
  // (a missing subject) or a missing verb; the book holds back dependent-clause fragments.
  fragment_fix: {
    name: "Sentences and fragments",
    minYear: 1,
    rule: "A fragment (a half sentence that is only part of an idea) leaves the reader waiting, like 'Ran down the hill.' It does not say who ran. Ask two questions: who is it about, and what did they do? Add the answer that is missing.",
    example: "The dog ran down the hill.",
  },
  run_on_fix: {
    name: "Run-on sentences",
    minYear: 1,
    rule: "A run-on keeps going with and, so, but then and then, so the reader never gets a rest. Find where one whole idea finishes, put a full stop there, and start the next one with a capital letter. Do not start the new sentence with and, but or so. Keep only the and, but or so that really helps.",
    example: "The bell rang for lunch. We grabbed our bags and ran for the oval.",
  },
  // Because and but come first; so (the result) arrives in Year 2.
  because_but_so: {
    name: "Because, but, so",
    minYear: 1,
    rule: "Finish a thin sentence with because (the reason), but (a change of direction) or so (the result of that reason or event). Each one pushes you to say more.",
    ruleFor: (year) => (year >= 2
      ? undefined
      : "Finish a thin sentence with because (the reason) or but (a change of direction). Each one pushes you to say more."),
    example: "The dog barked because a possum was on the fence.",
  },
  // Years 1 and 2 answer when, where and why; how joins from Year 3.
  sentence_expansion: {
    name: "Sentence expansion",
    minYear: 1,
    rule: "Start with a kernel sentence (a short sentence that makes sense on its own). Pick the questions worth answering (when, where, why or how), jot quick notes, then add those details inside the same sentence. Keep the words you started with, and put the when at the front.",
    ruleFor: (year) => (year >= 3
      ? undefined
      : "Start with a kernel sentence (a short sentence that makes sense on its own). Pick the questions worth answering (when, where or why), jot quick notes, then add those details inside the same sentence. Keep the words you started with, and put the when at the front."),
    example: "At sunrise, the surfer paddled out past the break to catch the first wave.",
  },
  // The book's order. Years 1 to 3 teach the first four; Year 4 and up the full list.
  subordinating_conjunction: {
    name: "Subordinating conjunction start",
    minYear: 1,
    rule: "Begin with a subordinating conjunction (After, Before, If, When, Even though, Although, Whenever, Since, While or Unless), write that first part, add a comma, then finish the sentence.",
    ruleFor: (year) => (year >= 4
      ? undefined
      : "Begin with a subordinating conjunction (After, Before, If or When), write that first part, add a comma, then finish the sentence."),
    example: "When the bell rang, we sprinted to the oval.",
  },
  // Years 2 and 3 teach time and sequence, conclusion and illustration; Year 4 adds change of
  // direction and emphasis. Transitions link paragraphs as well as sentences.
  transition: {
    name: "Transition word",
    minYear: 2,
    rule: "A transition word or phrase at the start of a sentence or paragraph that links it to the one before: First, Next, Later or Finally for time and sequence; For example to illustrate; However or On the other hand to change direction; Therefore or In the end to conclude; In addition, Most importantly or In particular to emphasise. Choose the relationship first: Secondly starts a new ordered reason with a topic sentence and supporting detail; For example develops that same reason; However introduces a contrast. They are not interchangeable. Show the previous reason when using an ordered transition.",
    ruleFor: (year) => (year >= 4
      ? undefined
      : "A transition word or phrase at the start of a sentence or paragraph that links it to the one before: First, Next, Later or Finally for time and sequence; Therefore or In the end to conclude; For example to illustrate. Choose the relationship first: Secondly starts a new ordered reason with a topic sentence and supporting detail; For example develops that same reason. They are not interchangeable. Show the previous reason when using an ordered transition."),
    example: "Later, the rain finally stopped.",
  },
  vary_vocabulary: {
    name: "Vary vocabulary",
    minYear: 2,
    rule: "Swap a plain or repeated word for one that says exactly what you mean: went becomes trudged, big becomes towering, said becomes whispered.",
    example: "The exhausted hikers trudged up the final hill.",
  },
  elaborate: {
    name: "Elaborate",
    minYear: 1,
    rule: "Add a whole new sentence after a thin one that gives a detail, an example or what happened next, so the reader can see the moment.",
    example: "The monkey grabbed the hat. It held it high above its head and screeched at us.",
  },
  sentence_combining: {
    name: "Sentence combining",
    minYear: 2,
    rule: "Join two or three short sentences into one using and, but, because or so, a pronoun, or a describing phrase, while keeping all their information and adding no new facts.",
    example: "The tent was tiny and wet, so nobody slept.",
  },
  paragraph_focus: {
    name: "Keep ideas on topic",
    minYear: 1,
    rule: "Read the paragraph's main idea. Remove a sentence that does not support it, or that only says the same thing as another sentence. Keep the useful sentences in their original order and wording. Check that the paragraph still makes sense.",
    example: "The pond supports wildlife. Frogs shelter among its reeds.",
  },
  // The four strategies below are for paragraph-style writing: stories and poems do not get them.
  topic_sentence: {
    name: "Topic sentence",
    minYear: 3,
    paragraphOnly: true,
    rule: "The first sentence of a paragraph tells the reader its main idea. In persuasive writing, keep it short and concise, stating your side or one main reason. Put evidence and elaboration in the supporting sentences after it. A question or an exclamation can be a topic sentence too. Do not make an effective topic sentence longer just to make it sound advanced.",
    offer: (year) => `A topic sentence may give the writer's position with the reasons in the details that follow, or, in a piece of several paragraphs, one reason. A flat one can be lifted with a different sentence type, a subordinating conjunction start${year >= 4 ? " or an appositive" : ""}: add words, never evidence. A question or exclamation topic sentence is not a defect.`,
    example: "Our school needs a bigger playground for three reasons.",
  },
  concluding_sentence: {
    name: "Concluding sentence",
    minYear: 3,
    paragraphOnly: true,
    rule: "The last sentence of a paragraph. It says the topic sentence's idea again in new words, never word for word, so the paragraph feels finished. It can give your opinion or say what should happen, and it can start with a concluding transition like In the end or Therefore.",
    offer: "A single paragraph ends with a concluding sentence. A piece of several paragraphs needs topic sentences on its body paragraphs and ONE final concluding statement (or a closing paragraph that mirrors the introduction), never one on every paragraph. It must not copy the topic sentence's structure. A call to action (using so, for what should happen) is a good ending.",
    example: "That is why a bigger playground would make every lunchtime better.",
  },
  appositive: {
    name: "Appositive",
    minYear: 4,
    rule: "A noun or noun phrase that renames a person or thing, placed straight after it between commas. Take it out and the sentence still works. A who/which clause is a different structure.",
    example: "Our teacher, a huge footy fan, wore her scarf to school.",
  },
  general_to_specific_intro: {
    name: "General to specific introduction",
    minYear: 5,
    paragraphOnly: true,
    rule: "Open with a broad statement about the topic, narrow to a specific one, then state your position or main idea as the last sentence of the introduction.",
    offer: "Offer this only when the piece is already several paragraphs. The introduction needs at least three sentences with the position last, and the conclusion later rewords that position.",
    example: "Every school has a playground. Ours is the smallest in the district. It is time we built a bigger one.",
  },
  specific_to_general_conclusion: {
    name: "Specific to general conclusion",
    minYear: 5,
    paragraphOnly: true,
    rule: "Do the introduction in reverse: restate your position, sum up your specific points, then finish with a broad closing thought.",
    offer: "Offer this only for a piece that already has an introduction and body paragraphs; the conclusion rewords the position from the introduction.",
    example: "A bigger playground is worth every cent. It would ease the crowding and give every class room to run. Good schools give children space to play.",
  },
};

// Stories and poems are not offered the paragraph-structure strategies.
const NO_PARAGRAPH_STRATEGIES = new Set(["narrative", "poetry"]);
const allowedFor = (m, genre) => !(m.paragraphOnly && NO_PARAGRAPH_STRATEGIES.has(genre));
const ruleForYear = (m, yearLevel) => m.ruleFor?.(yearLevel) ?? m.rule;
const offerForYear = (m, yearLevel) => (typeof m.offer === "function" ? m.offer(yearLevel) : m.offer);

export function movesFor(yearLevel, genre = "") {
  return Object.entries(MOVES)
    .filter(([, m]) => m.minYear <= yearLevel && allowedFor(m, genre))
    .map(([key, { ruleFor: _drop, offer: _offer, ...m }]) => ({ key, ...m, rule: ruleForYear(MOVES[key], yearLevel), offer: offerForYear(MOVES[key], yearLevel) }));
}

export function movesPrompt(yearLevel, genre = "") {
  const lines = movesFor(yearLevel, genre).map((m) => `- ${m.key}: ${m.name}. ${m.rule}${m.offer ? ` (${m.offer})` : ""}`);
  const gated = NO_PARAGRAPH_STRATEGIES.has(genre)
    ? `\nThis piece is a ${genre === "poetry" ? "poem" : "story"}: do not ask for a topic sentence, a concluding sentence, or a general-to-specific introduction or specific-to-general conclusion, and do not name them in "move".`
    : "";
  return `Writing strategies the school teaches (the child practises these in class, so build power-ups on them wherever they fit, and phrase "now_you" as a task that uses the strategy on their own writing, for example "Find your sentence about the waves and expand it: add when and where"). When a power-up's "example_after" clearly shows one of these strategies, name it with the exact key in "move"; otherwise use null:
${lines.join("\n")}${gated}
Name a strategy only when "example_after" really does it: sentence_expansion adds when, where, why or how inside ONE sentence; sentence_combining joins two or more of the child's sentences into fewer sentences; run_on_fix is its opposite, splitting ONE over-long chained sentence into two or more complete sentences (never call that combining); elaborate adds a NEW sentence of detail after one of theirs; because_but_so extends a sentence with because, but or so. If none fits exactly, use null.
Revising comes before editing: power-ups are revising strategies. Spelling and punctuation are editing and belong in error_totals and the spelling and punctuation areas.
The year limits above apply only to what you TEACH. Never mark down a child's own correct use of a later conjunction or transition (Since, Although, On the other hand); name it as a strength.
Call them "writing strategies" (never moves, tricks or techniques) and use the strategy names above whenever you talk about one, so the child hears the same words as in class: say "transition word" (never signpost word, connective, linking word or time connective), "subordinating conjunction" (never joining word, opener or sentence starter), "topic sentence" and "concluding sentence" (never T.S., C.S. or SPO), "revise" for improving the writing and "edit" for fixing spelling and punctuation. The book terms "fragment" and "kernel sentence" are allowed, but the first time you write one in anything the child reads, put its meaning in brackets straight after it: fragment (a half sentence that is only part of an idea), kernel sentence (a short sentence that makes sense on its own). Never write "kernel" on its own. Say "keep the words you started with" when asking them to preserve a kernel sentence.
Phrase "now_you" the way the school's own feedback is phrased, pointing at a sentence: expand it (add when, where, why or how), combine sentences 2 and 3, split your long sentence where the first whole idea ends, insert a transition, begin it with a subordinating conjunction, vary vocabulary, give an example, or improve your topic sentence or concluding sentence.`;
}

// The explanation shown to the child, or null if the key is unknown, too advanced for the year,
// or not for this kind of writing.
export function describeMove(key, yearLevel, genre = "") {
  const m = MOVES[key];
  if (!m || m.minYear > yearLevel || !allowedFor(m, genre)) return null;
  return { key, name: m.name, rule: ruleForYear(m, yearLevel), example: m.example };
}
