import test from 'node:test';
import assert from 'node:assert/strict';
import { writingStrength, writingStrengthLines, SKILL_GUIDE, skillExplanation, heroPowers, nextFocus, editingItems, editingCount, editingLines, spellingLines, spellingStatusText, missionRows, levelUpRequest, usedComparison } from '../js/feedback-visuals.js';
import { CRITERIA } from '../api/_criteria.js';

test('writing strength excludes editing and chooses the first power-up as the focus', () => {
  const result = writingStrength([
    { key: 'spelling', status: 'strength', label: 'Spelling' },
    { key: 'punctuation', status: 'next_step', label: 'Punctuation' },
    { key: 'ideas', status: 'strength', label: 'Ideas' },
    { key: 'vocabulary', status: 'steady', label: 'Vocabulary', powerUp: 1 },
  ]);
  assert.equal(result.strong, 1);
  assert.equal(result.areas.length, 2);
  assert.equal(result.keyStrength, 'Ideas');
  assert.equal(result.keyStrengthKey, 'ideas', 'the key opens the explanation for that skill');
  assert.equal(result.focus, 'Vocabulary');
  assert.equal(result.focusKey, 'vocabulary');
});

test('missing writing ratings do not invent a score', () => {
  assert.equal(writingStrength().areas.length, 0);
  assert.equal(writingStrength([{key:'ideas',status:'unknown'}]).areas.length, 0);
  assert.equal(writingStrength().keyStrengthKey, '', 'nothing to open');
  assert.equal(writingStrength().focusKey, '');
});

test('unassessed skills stay visible without becoming assessed scores, strengths or focus', () => {
  const criteria = [
    {key:'ideas',label:'Ideas',status:'strength',strength:'Your example explains the reason.'},
    {key:'paragraphing',label:'Paragraphing',status:'not_assessed',assessmentNote:'This is one sentence.',powerUp:1,strength:'Untrusted praise'},
  ];
  const summary = writingStrength(criteria);
  assert.equal(summary.areas.length, 2);
  assert.equal(summary.assessed, 1);
  assert.equal(summary.unassessed, 1);
  assert.equal(summary.strong, 1);
  assert.equal(summary.focusKey, '');
  assert.deepEqual(heroPowers(criteria).map(c=>c.key), ['ideas']);
  assert.ok(writingStrengthLines(criteria).includes('Paragraphing: Need more writing. This is one sentence.'));
  const all = writingStrength([criteria[1]]);
  assert.equal(all.assessed, 0);
  assert.equal(all.keyStrengthKey, '');
  assert.match(all.summary, /need more writing/);
});

test('every writing skill has a child-friendly explanation, in our own words', () => {
  assert.deepEqual(Object.keys(SKILL_GUIDE).sort(), Object.keys(CRITERIA).sort(), 'one explanation per area');
  for (const [key, guide] of Object.entries(SKILL_GUIDE)) {
    assert.ok(guide.what.length > 10 && guide.how.length > 20, key);
    assert.doesNotMatch(`${guide.what} ${guide.how}`, /NAPLAN|ACARA/, `${key}: no marking-guide text`);
    assert.ok(guide.what.split(/\s+/).length <= 20, `${key}: the first line is short enough for a young reader`);
  }
  assert.match(skillExplanation('audience').what, /reader/i);
  assert.equal(skillExplanation('nope').how, '', 'unknown keys never crash the card');
});

test('hero powers: craft areas first (strength, then on track), editing areas only fill the gaps, capped', () => {
  const powers = heroPowers([
    { key: 'audience', label: 'Audience', status: 'steady', strength: "'I got dumped!' makes your reader feel the splash." },
    { key: 'ideas', label: 'Ideas', status: 'next_step', strength: 'A great moment to build on.' },
    { key: 'cohesion', label: 'Cohesion', status: 'strength', strength: "'After that' links your events in order." },
    { key: 'paragraphing', label: 'Paragraphing', status: 'steady', strength: '' },
    { key: 'punctuation', label: 'Punctuation', status: 'strength', strength: 'Capitals and full stops are all in place.' },
    { key: 'spelling', label: 'Spelling', status: 'strength', strength: 'Every word is right.' },
  ]);
  assert.deepEqual(powers.map((p) => p.key), ['cohesion', 'audience', 'punctuation']);
  assert.equal(powers[0].text, "'After that' links your events in order.");
  const three = heroPowers([
    { key: 'punctuation', status: 'strength', strength: 'a' },
    { key: 'ideas', status: 'steady', strength: 'b' },
    { key: 'audience', status: 'strength', strength: 'c' },
    { key: 'cohesion', status: 'steady', strength: 'd' },
  ]);
  assert.deepEqual(three.map((p) => p.key), ['audience', 'ideas', 'cohesion'], 'three craft entries leave no room for editing areas');
  assert.deepEqual(heroPowers([{ key: 'ideas', status: 'steady', strength: 'x' }], 3).map((p) => p.key), ['ideas'], 'on-track areas fill the gaps');
  assert.deepEqual(heroPowers(), []);
});

test('no counts or scores in the strength summary or the print and picture lines', () => {
  const criteria = [
    { key: 'ideas', label: 'Ideas', status: 'strength', strength: 'x' },
    { key: 'audience', label: 'Audience', status: 'steady', strength: 'y' },
  ];
  assert.equal(writingStrength(criteria).summary, '');
  assert.doesNotMatch(writingStrengthLines(criteria).join(' '), /We checked|show strength|\d+ writing/);
  assert.equal(writingStrengthLines(criteria).length, 2, 'no empty line when there is no note');
  const part = [...criteria, { key: 'cohesion', label: 'Cohesion', status: 'not_assessed' }];
  assert.match(writingStrength(part).summary, /more writing/);
});

test('next focus: power-up 1 title, else the first next step, else nothing', () => {
  assert.deepEqual(nextFocus([], [{ skill: 'Put your reader on the sand' }]), { text: 'Put your reader on the sand', task: '', powerUp: 1 });
  // The job comes with the title, because a title alone can be cryptic.
  assert.deepEqual(nextFocus([], [{ skill: 'Finish your half sentence', nowYou: 'Add what happened to your When line.' }]),
    { text: 'Finish your half sentence', task: 'Add what happened to your When line.', powerUp: 1 });
  const criteria = [
    { key: 'ideas', status: 'steady', nextStep: 'not me' },
    { key: 'audience', status: 'next_step', nextStep: 'Start with the wave.' },
  ];
  assert.deepEqual(nextFocus(criteria, []), { text: 'Start with the wave.', powerUp: 0 });
  assert.equal(nextFocus([{ key: 'ideas', status: 'steady', nextStep: 'x' }], []), null);
  assert.equal(nextFocus(), null);
});

test('editing: capitals then the punctuation types the year has met, each with a tip', () => {
  const keys = (y) => editingItems(y).map((i) => i.key);
  assert.deepEqual(keys(1), ['capital_letters', 'full_stops']);
  assert.deepEqual(keys(2), ['capital_letters', 'full_stops', 'list_commas']);
  assert.deepEqual(keys(3), ['capital_letters', 'full_stops', 'list_commas', 'apostrophes']);
  for (const year of [4, 5, 6]) assert.deepEqual(keys(year), ['capital_letters', 'full_stops', 'list_commas', 'apostrophes', 'speech']);
  for (const year of [1, 2, 3, 4, 5, 6]) {
    assert.ok(editingItems(year).every((i) => /\w/.test(i.tip)), 'every row has a tip');
    assert.ok(editingItems(year).every((i) => !/[–—]/.test(i.tip)), 'no dashes in tips');
  }
  assert.deepEqual(editingItems(6).slice(1).map((i) => i.short), ['Sentence endings', 'Commas in lists', 'Apostrophes', 'Speech marks']);
  assert.match(editingItems(2)[0].tip, /first word of every sentence, names, and the word I/);
  assert.match(editingItems(2)[1].tip, /out loud/);
  assert.equal(editingCount({ full_stops: 2 }, 'full_stops'), 2);
  assert.equal(editingCount({}, 'full_stops'), null, 'a missing count is never guessed');
  assert.equal(editingCount({ full_stops: null }, 'full_stops'), null);
  assert.equal(editingCount({ spelling: -1 }, 'spelling'), null);
  assert.deepEqual(editingLines({ capital_letters: 0, full_stops: 3 }, 1), ['Capital letters: 0', 'Sentence endings: 3']);
  assert.deepEqual(editingLines({ capital_letters: 0 }, 2, { long: true }), ['Capital letter errors: 0', 'Sentence ending errors: Not available', 'Comma in list errors: Not available']);
  assert.deepEqual(editingLines({ capital_letters: 3, full_stops: 1, list_commas: 0, apostrophes: 2, speech: 4, spelling: 9 }, 4), ['Capital letters: 3', 'Sentence endings: 1', 'Commas in lists: 0', 'Apostrophes: 2', 'Speech marks: 4']);
  assert.equal(editingLines({}, 5, { long: true }).length, 5);
});

test('spelling lines show what the child wrote with a blank, never the right spelling', () => {
  const lines = spellingLines('words', [{ wrote: 'becos', correct: 'because' }, { wrote: 'thort', correct: 'thought' }]);
  assert.deepEqual(lines, ['becos  ____________', 'thort  ____________']);
  assert.ok(!lines.join(' ').includes('because'));
  assert.deepEqual(spellingLines('unavailable', []), ["We couldn't check spelling this time. Read it with your teacher."]);
  assert.deepEqual(spellingLines('none_to_practise', []), ['No spelling words to practise this time.']);
  assert.deepEqual(spellingLines('clear', []), [spellingStatusText('clear')]);
  assert.deepEqual(spellingLines('words', []), ["We couldn't check spelling this time. Read it with your teacher."], 'words status with no words is not a clear');
  assert.deepEqual(spellingLines(undefined), ["We couldn't check spelling this time. Read it with your teacher."]);
});

test('spelling status sentences', () => {
  assert.equal(spellingStatusText('unavailable'), "We couldn't check spelling this time. Read it with your teacher.");
  assert.equal(spellingStatusText('none_to_practise'), 'No spelling words to practise this time.');
  assert.equal(spellingStatusText('clear'), 'Great job! We found no spelling words to fix.');
  assert.equal(spellingStatusText('words'), '');
  assert.ok(!/[–—]/.test(spellingStatusText('clear')));
});

test('mission rows: one per power-up, then word power if any, then edit for the year, then read it again', () => {
  const feedback = {
    powerUps: [
      { skill: 'Put your reader on the sand', yourLine: 'The waves were huge...', nowYou: 'Add when and where to your line.' },
      { skill: 'Start with While or When', yourLine: 'After that we had fish.', nowYou: '' },
    ],
    wordBoost: { swaps: [] },
  };
  const rows = missionRows(feedback, 2);
  assert.deepEqual(rows.map((r) => r.key), ['power-0', 'power-1', 'word', 'edit', 'read']);
  assert.equal(rows[0].line, 'The waves were huge...');
  assert.equal(rows[0].job, 'Add when and where to your line.');
  assert.equal(rows[1].job, 'Start with While or When', 'falls back to the skill title when there is no job');
  assert.equal(rows[3].job, 'Check your capital letters, full stops and commas in lists.');
  assert.equal(missionRows(feedback, 1)[3].job, 'Check your capital letters and full stops.');
  assert.equal(missionRows(feedback, 3)[3].job, 'Check your spelling words, capital letters, full stops, commas in lists and apostrophes.');
  assert.deepEqual(rows.map((r) => r.done), ['I did power-up 1 in my book.', 'I did power-up 2 in my book.', 'I swapped in stronger words.', 'I checked my capital letters, full stops and commas in lists.', 'I read it again like a reader.']);
  assert.equal(missionRows(feedback, 5)[3].job, 'Check your spelling words, capital letters, full stops, commas in lists, apostrophes and speech marks.');
  assert.deepEqual(missionRows({ powerUps: [] }, 3).map((r) => r.key), ['edit', 'read'], 'no power-ups and no word power');
  assert.deepEqual(missionRows().map((r) => r.key), ['edit', 'read']);
});

test('round 2 request: both versions plus the power-ups, mapped to the server field names', () => {
  const feedback = { powerUps: [
    { skill: 'Put your reader on the sand', areaLabel: 'Ideas', nowYou: 'Add when and where.', move: { key: 'sentence_expansion', name: 'Sentence expansion' }, yourLine: 'x', why: 'y', rule: 'z', tryThis: 'dead' },
    { skill: 'Join two ideas', areaLabel: 'Sentence structure', nowYou: 'Use because.', move: null },
  ] };
  assert.deepEqual(levelUpRequest(feedback, 'First.', 'Second.'), {
    before: 'First.',
    after: 'Second.',
    powerUps: [
      { skill: 'Put your reader on the sand', area: 'Ideas', nowYou: 'Add when and where.', move: 'Sentence expansion' },
      { skill: 'Join two ideas', area: 'Sentence structure', nowYou: 'Use because.', move: undefined },
    ],
    practiceWords: [],
  });
  assert.deepEqual(levelUpRequest(null, 'a', 'b').powerUps, []);
});

test('one comparison per piece: only a real reply uses it up, the free "looks the same" reply does not', () => {
  assert.equal(usedComparison({ cheer: 'Nice', wins: [], next: '' }), true, 'a real comparison with no wins still cost a model call');
  assert.equal(usedComparison({ cheer: 'Same', wins: [], unchanged: true }), false);
  assert.equal(usedComparison(null), false);
});
