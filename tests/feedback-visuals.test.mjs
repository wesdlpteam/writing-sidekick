import test from 'node:test';
import assert from 'node:assert/strict';
import { writingStrength, SKILL_GUIDE, skillExplanation, heroPowers } from '../js/feedback-visuals.js';
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

test('hero powers: real strengths first, quoting the writing, then on-track areas with something named, capped', () => {
  const powers = heroPowers([
    { key: 'audience', label: 'Audience', status: 'steady', strength: "'I got dumped!' makes your reader feel the splash." },
    { key: 'ideas', label: 'Ideas', status: 'next_step', strength: 'A great moment to build on.' },
    { key: 'cohesion', label: 'Cohesion', status: 'strength', strength: "'After that' links your events in order." },
    { key: 'paragraphing', label: 'Paragraphing', status: 'steady', strength: '' },
    { key: 'punctuation', label: 'Punctuation', status: 'strength', strength: 'Capitals and full stops are all in place.' },
    { key: 'spelling', label: 'Spelling', status: 'strength', strength: 'Every word is right.' },
  ]);
  assert.deepEqual(powers.map((p) => p.key), ['cohesion', 'punctuation', 'spelling']);
  assert.equal(powers[0].text, "'After that' links your events in order.");
  assert.deepEqual(heroPowers([{ key: 'ideas', status: 'steady', strength: 'x' }], 3).map((p) => p.key), ['ideas'], 'on-track areas fill the gaps');
  assert.deepEqual(heroPowers(), []);
});
