import test from 'node:test';
import assert from 'node:assert/strict';
import { writingStrength } from '../js/feedback-visuals.js';
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
  assert.equal(result.focus, 'Vocabulary');
});
test('missing writing ratings do not invent a score', () => {
  assert.equal(writingStrength().areas.length, 0);
  assert.equal(writingStrength([{key:'ideas',status:'unknown'}]).areas.length, 0);
});
