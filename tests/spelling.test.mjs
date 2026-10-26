import test from 'node:test';
import assert from 'node:assert/strict';
import { differingPart, isSoundAlike, pickSpellingWords } from '../api/_spelling.js';

const ev = (transcript, quote, correction, nth = 1) => {
  let at = -1;
  for (let i = 0; i < nth; i++) at = transcript.indexOf(quote, at + 1);
  return { quote, correction, start: at };
};
const pick = (evidence, transcript, yearLevel = 4, totalSpelling = evidence.length) =>
  pickSpellingWords(evidence, transcript, { yearLevel, totalSpelling });

test('differingPart finds the changed middle', () => {
  assert.deepEqual(differingPart('skool', 'school'), { attempt: [1, 2], target: [1, 3] });
  assert.deepEqual(differingPart('thort', 'thought'), { attempt: [3, 4], target: [3, 6] });
  assert.deepEqual(differingPart('becaus', 'because'), { attempt: [6, 6], target: [6, 7] });
  assert.deepEqual(differingPart('Skool', 'SCHOOL'), { attempt: [1, 2], target: [1, 3] });
});

test('isSoundAlike matches the built-in groups', () => {
  assert.equal(isSoundAlike('there', 'their'), true);
  assert.equal(isSoundAlike('Two', 'too'), true);
  assert.equal(isSoundAlike('skool', 'school'), false);
  assert.equal(isSoundAlike('there', 'there'), false);
});

test('picks a capitalised correction at a sentence start', () => {
  const t = 'Becos it rained. We hid.';
  const r = pick([ev(t, 'Becos', 'Because')], t);
  assert.equal(r.status, 'words');
  assert.equal(r.words[0].wrote, 'Becos');
  assert.equal(r.words[0].correct, 'Because');
  assert.equal(r.words[0].sentence, 'Becos it rained.');
  assert.equal(r.words[0].kind, 'sounds');
});

test('skips names mid-sentence and apostrophe-only changes', () => {
  const t = 'We saw sam. I dont know.';
  const r = pick([ev(t, 'sam', 'Sam'), ev(t, 'dont', "don't")], t);
  assert.equal(r.status, 'none_to_practise');
  assert.deepEqual(r.words, []);
});

test('skips pairs equal ignoring case', () => {
  const t = 'Then i ran. We Ran.';
  const r = pick([ev(t, 'i', 'I'), ev(t, 'Ran', 'ran')], t);
  assert.equal(r.status, 'none_to_practise');
});

test('splits multi-word quotes by index and strips edge punctuation', () => {
  const t = 'We went hom, becos it rained.';
  const r = pick([ev(t, 'hom, becos', 'home, because')], t);
  assert.deepEqual(r.words.map((w) => w.wrote), ['hom', 'becos']);
  const skipped = pick([ev(t, 'hom, becos', 'home')], t);
  assert.equal(skipped.status, 'none_to_practise');
});

test('most repeated word ranks first and is returned once', () => {
  const t = 'Becos a. becos b. Becos c. becos d. We saw wen it came.';
  const evidence = [
    ev(t, 'wen', 'when'),
    ev(t, 'Becos', 'Because'), ev(t, 'becos', 'because', 1), ev(t, 'Becos', 'Because', 2), ev(t, 'becos', 'because', 2),
  ];
  const r = pick(evidence, t);
  assert.equal(r.words.filter((w) => w.wrote.toLowerCase() === 'becos').length, 1);
  assert.equal(r.words[0].wrote.toLowerCase(), 'becos');
  assert.equal(r.words[1].wrote, 'wen');
});

test('caps at 3 for Year 2 and 5 for Year 5', () => {
  const t = 'aa bb cc dd ee ff gg.';
  const evidence = ['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg'].map((w) => ev(t, w, w + 'x'));
  assert.equal(pick(evidence, t, 2).words.length, 3);
  assert.equal(pick(evidence, t, 5).words.length, 5);
});

test('sound-alike words are flagged', () => {
  const t = 'We went to there house.';
  const r = pick([ev(t, 'there', 'their')], t);
  assert.equal(r.words[0].kind, 'sound_alike');
  assert.deepEqual(r.words[0].tricky, differingPart('there', 'their').target);
});

test('status: unavailable, clear, none_to_practise, words', () => {
  const t = 'Becos it rained.';
  const e = [ev(t, 'Becos', 'Because')];
  assert.deepEqual(pick(e, t, 4, null), { status: 'unavailable', words: [] });
  assert.deepEqual(pick([], t, 4, 0), { status: 'clear', words: [] });
  assert.equal(pick([ev(t, 'it', 'It')], t, 4, 1).status, 'none_to_practise');
  assert.equal(pick(e, t, 4, 1).status, 'words');
});

test('curly apostrophes in the right spelling are folded to straight', () => {
  const r = pickSpellingWords([{ quote: 'dosn’t', correction: 'doesn’t', start: 2 }], 'It dosn’t work.', { yearLevel: 3, totalSpelling: 1 });
  assert.equal(r.words[0].correct, "doesn't");
});
