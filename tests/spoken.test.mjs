import test from 'node:test';
import assert from 'node:assert/strict';
import { plain, sentence, fit, joinOr, listensForYear, MAX_SPOKEN, SAY_ALOUD, staticSpoken, strengthsSpoken, focusSpoken, powerUpSpoken, wordPowerSpoken, challengeSpoken, editingSpoken, editingCountSpoken, missionSpoken, levelUpSpoken, NO_WINS } from '../js/spoken.js';

const power = {
  skill: 'Put your reader on the sand',
  why: "'I got dumped!' is short and punchy.",
  yourLine: 'The waves were huge and I got dumped!',
  rule: 'Add when it happened at the front with a comma.',
  example: { before: 'The dog ran off.', after: 'After lunch, the dog ran off down the muddy track.' },
  move: { name: 'Sentence expansion', rule: 'a long rule that is not shown' },
  nowYou: 'Add when and where to your line.',
};
const boost = {
  swaps: [{ from: 'huge', to: ['big', 'enormous', 'gigantic', 'colossal'] }],
  before: 'The waves were huge.',
  after: 'The gigantic snowdrift swallowed the sled.',
  challenge: [{ word: 'dumped' }, { word: 'beach' }, { word: 'had' }],
};

test('only Years 1 to 3 get a voice', () => {
  for (const y of [1, 2, 3, '2']) assert.equal(listensForYear(y), true);
  for (const y of [0, 4, 5, 6, null, undefined]) assert.equal(listensForYear(y), false);
});

test('plain turns arrows and brackets into words and drops symbols', () => {
  assert.equal(plain('cat -> dog'), 'cat becomes dog');
  assert.equal(plain('cat → dog'), 'cat becomes dog');
  assert.equal(plain('write a ^ here'), 'write a caret here');
  assert.equal(plain('a synonym (a word that means the same thing) for each one.'), 'a synonym, a word that means the same thing, for each one.');
  assert.equal(plain('  too   many \n spaces '), 'too many spaces');
  assert.equal(plain(undefined), '');
  assert.equal(plain(false), '');
});

test('sentence adds a full stop only when one is missing', () => {
  assert.equal(sentence('Hello there'), 'Hello there.');
  assert.equal(sentence('Wow!'), 'Wow!');
  assert.equal(sentence("He said 'go.'"), "He said 'go.'");
  assert.equal(sentence(''), '');
  assert.equal(sentence(null), '');
});

test('joinOr reads a list in plain words', () => {
  assert.equal(joinOr(['a']), 'a');
  assert.equal(joinOr(['a', 'b', 'c']), 'a, b or c');
  assert.equal(joinOr([]), '');
});

test('fit keeps a request under the server cap and cuts on a whole sentence', () => {
  const long = Array.from({ length: 300 }, (_, i) => `Sentence number ${i}.`).join(' ');
  const cut = fit(long);
  assert.ok(cut.length <= MAX_SPOKEN);
  assert.ok(cut.endsWith('.'));
  assert.equal(fit('short.'), 'short.');
  assert.ok(fit('x'.repeat(2000)).length <= MAX_SPOKEN);
});

test('a power-up card is read in the order it is shown, with becomes for the arrow', () => {
  const text = powerUpSpoken(power, { sayAloud: true });
  assert.equal(
    text,
    "Put your reader on the sand. 'I got dumped!' is short and punchy. Find this line in your book. The waves were huge and I got dumped! Use the strategy, Sentence expansion. Add when it happened at the front with a comma. For example, The dog ran off becomes After lunch, the dog ran off down the muddy track. Do this. Add when and where to your line. " + SAY_ALOUD,
  );
  assert.ok(!/[→^]|->/.test(text));
  assert.ok(!powerUpSpoken(power).includes('out loud'), 'the partner line is only for the younger years');
  assert.ok(text.length <= MAX_SPOKEN);
});

test('a power-up with missing parts skips them without saying false or undefined', () => {
  const text = powerUpSpoken({ skill: 'Try this', nowYou: 'Do it.' });
  assert.equal(text, 'Try this. Do this. Do it.');
  assert.equal(powerUpSpoken(null), '');
  assert.ok(!/undefined|false|null/.test(powerUpSpoken({ skill: 'x', rule: 'Use a rule.' })));
});

test('a very long power-up still fits in one request', () => {
  const huge = { ...power, why: 'Because. '.repeat(300), rule: 'Rule. '.repeat(100) };
  assert.ok(powerUpSpoken(huge, { sayAloud: true }).length <= MAX_SPOKEN);
});

test('strengths and next focus', () => {
  const criteria = [
    { key: 'ideas', label: 'Ideas', status: 'strength', strength: 'Great ideas here.' },
    { key: 'audience', label: 'Audience', status: 'steady', strength: 'You hooked me' },
  ];
  assert.equal(strengthsSpoken(criteria), 'What you did well. Ideas. Great ideas here. Audience. You hooked me.');
  assert.equal(strengthsSpoken([]), '');
  assert.equal(focusSpoken(criteria, [{ skill: 'Start with While' }]), 'Your next focus. Start with While.');
  assert.equal(focusSpoken([], []), '');
});

test('word power reads each word, its four upgrades and both example sentences', () => {
  const text = wordPowerSpoken(boost);
  assert.ok(text.startsWith('Word power. Each word gets four upgrades'));
  assert.ok(text.includes('Instead of huge, try big, enormous, gigantic or colossal.'));
  assert.ok(text.includes('In your writing. The waves were huge. Like this. The gigantic snowdrift swallowed the sled.'));
  assert.equal(wordPowerSpoken(null), '');
  assert.ok(!/\b0\b|false/.test(wordPowerSpoken({ swaps: [] })));
});

test('the synonym challenge reads its instructions and the words', () => {
  const text = challengeSpoken('Type a synonym (a word that means the same thing) for each one.', boost.challenge);
  assert.equal(text, 'Your turn, synonym challenge. Type a synonym, a word that means the same thing, for each one. The words are dumped, beach or had.');
});

test('editing reads each count with its tip, then the advice', () => {
  const junior = editingSpoken({ capital_letters: 0, full_stops: 1 }, 2);
  assert.ok(junior.includes('Capitals. No errors found. Check the first word of every sentence'));
  assert.ok(junior.includes('Full stops. 1 error to find. Read it out loud.'));
  assert.ok(junior.includes('Go back to your writing.'));
  assert.ok(junior.endsWith('may not be exact.'));
  const year3 = editingSpoken({ spelling: 4, punctuation: null, capital_letters: 2 }, 3);
  assert.ok(year3.includes('Spelling. 4 errors to find.'));
  assert.ok(year3.includes('Punctuation. Not available.'));
  assert.equal(editingCountSpoken(null), 'Not available');
  assert.equal(editingCountSpoken(0), 'No errors found');
});

test('the mission recap reads each job, short', () => {
  const text = missionSpoken({ powerUps: [{ yourLine: 'I got dumped!', nowYou: 'Add when and where.' }], wordBoost: boost }, 2);
  assert.ok(text.startsWith('Your mission. Here are the jobs you ticked along the way. Tick any you have done since, then read it again. Power-up 1. Add when and where. Word power. Swap in stronger words where they fit.'));
  assert.ok(text.includes('Edit. Check your capital letters and full stops.'));
  assert.ok(text.endsWith('Does it sound even better?'));
});

test('static page text is tidied into sentences', () => {
  assert.equal(staticSpoken('Pick up your pencil', 'To add words, write a ^ where they go in.'), 'Pick up your pencil. To add words, write a caret where they go in.');
});

test('what got better reads the cheer, each win with its new words, then the next step', () => {
  const text = levelUpSpoken({
    cheer: "'After lunch, the dog ran off' tells us when. Well done!",
    wins: [{ what: 'Power-up 1 used: Sentence expansion', evidence: 'After lunch, the dog ran off down the track.' }, { what: 'New detail added', evidence: 'It was a sunny day!' }],
    next: 'Try a where start on one more sentence.',
  });
  assert.equal(text, "What got better. 'After lunch, the dog ran off' tells us when. Well done! Power-up 1 used: Sentence expansion. In your new writing. After lunch, the dog ran off down the track. New detail added. In your new writing. It was a sunny day! Your next step. Try a where start on one more sentence.");
});

test('what got better with no wins asks for one change; a "looks the same" reply reads only its own message', () => {
  assert.equal(levelUpSpoken({ cheer: 'Thanks for trying.', wins: [], next: '' }), `What got better. Thanks for trying. ${NO_WINS}`);
  assert.equal(levelUpSpoken({ cheer: 'This looks the same as your first version.', wins: [], unchanged: true }), 'This looks the same as your first version.');
  assert.equal(levelUpSpoken(null), '');
  assert.ok(levelUpSpoken({ cheer: 'Great.', wins: Array(4).fill({ what: 'Win', evidence: 'word '.repeat(80) }) }).length <= MAX_SPOKEN);
});
