import test from 'node:test';
import assert from 'node:assert/strict';
import { handleFeedback, hintLeaks } from '../api/feedback.js';

const env = { OPENAI_API_KEY: 'test' };
const reply = (value) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }) });
const systemText = (body) => [].concat(body?.messages?.[0]?.content ?? '').map(p => typeof p === 'string' ? p : p.text).join('');
const stageOf = (body) => { const sys = systemText(body); return sys.startsWith('QUALITY_REVIEW:') ? 'review' : sys.startsWith('EDITING_AUDIT:') ? 'audit' : 'draft'; };
const entry = (quote, correction, category = 'spelling', occurrence = 1) => ({ quote, correction, category, occurrence });

const draft = {
  headline: 'Your reason is clear.',
  areas: Object.fromEntries(['audience', 'text_structure', 'ideas', 'vocabulary', 'cohesion', 'paragraphing', 'sentence_structure', 'punctuation', 'spelling'].map(key => [key, { status: 'steady', strength: 'A reason.', next_step: 'Develop your reason.' }])),
  power_ups: [{ area: 'ideas', skill: 'Develop your reason', why: 'Your reason is clear.', your_line: 'My famly is big', move: 'elaborate', rule: 'Add a detail.', example_before: 'Birds are noisy.', example_after: 'Birds are noisy. Their calls echo through the street before sunrise.', now_you: 'Explain why.' }],
  error_totals: { spelling: 10, punctuation: 10, capital_letters: 10 },
};

const feedbackFor = (transcript, errors) => handleFeedback({ yearLevel: 3, transcript }, {
  env,
  fetchImpl: async (_url, options) => {
    const stage = stageOf(JSON.parse(options.body));
    return reply(stage === 'draft' ? draft : stage === 'audit' ? { editing: { complete: true, errors } } : { approved: true, feedback: null });
  },
});

test('payload carries the spelling words and status', async () => {
  const r = await feedbackFor('My famly is big', [entry('famly', 'family')]);
  assert.equal(r.status, 200);
  assert.equal(r.payload.spellingStatus, 'words');
  assert.equal(r.payload.spellingWords.length, 1);
  assert.deepEqual({ wrote: r.payload.spellingWords[0].wrote, correct: r.payload.spellingWords[0].correct, kind: r.payload.spellingWords[0].kind }, { wrote: 'famly', correct: 'family', kind: 'sounds' });
  assert.equal(r.payload.spellingWords[0].sentence, 'My famly is big');
  assert.equal(typeof r.payload.errorTotals.list_commas, 'number');
});

test('a sentence that already holds the right spelling is blanked', async () => {
  const r = await feedbackFor('My family is big and my famly is kind', [entry('famly', 'family')]);
  assert.equal(r.payload.spellingWords[0].sentence, '');
});

const check = (spellingCheck, fetchImpl, yearLevel = 3) => handleFeedback({ yearLevel, spellingCheck }, { env, fetchImpl });
const noFetch = async () => { throw new Error('should not call the model'); };
const base = { wrote: 'famly', correct: 'family', attempt: 'family', sentence: 'My famly is big', kind: 'sounds', tryNumber: 1 };

test('right answer needs no model call, and a trailing space is fine', async () => {
  for (const attempt of ['family', 'Family ', 'FAMILY']) {
    const r = await check({ ...base, attempt }, noFetch);
    assert.equal(r.status, 200);
    assert.equal(r.payload.verdict, 'right');
    assert.equal(r.payload.highlight, undefined);
  }
});

test('same as before is answered without the model', async () => {
  const r = await check({ ...base, attempt: 'famly' }, noFetch);
  assert.equal(r.payload.verdict, 'same');
  assert.equal(r.payload.hint, "That's the same spelling as before. Try a different spelling for the highlighted part.");
  assert.ok(Array.isArray(r.payload.highlight));
});

test('sound-alike first try gets the fixed hint without the model', async () => {
  const r = await check({ wrote: 'there', correct: 'their', attempt: 'thare', sentence: 'We packed there bags', kind: 'sound_alike', tryNumber: 1 }, noFetch);
  assert.equal(r.payload.verdict, 'try_again');
  assert.match(r.payload.hint, /^This word sounds right, but another word sounds the same/);
});

test('a hint that gives the word away falls back', async () => {
  const r = await check({ ...base, attempt: 'famaly' }, async () => reply({ hint: 'Try spelling it family' }));
  assert.equal(r.payload.verdict, 'try_again');
  assert.equal(r.payload.hint, 'Most of your sounds are right. Look at the highlighted part. Which other spelling could make that sound?');
});

test('a hint with a banned term falls back', async () => {
  const r = await check({ ...base, attempt: 'famaly' }, async () => reply({ hint: 'Think about the digraph near the end.' }));
  assert.match(r.payload.hint, /^Most of your sounds are right/);
});

test('model failure falls back and never 502s', async () => {
  const r = await check({ ...base, attempt: 'famaly' }, async () => { throw new Error('down'); });
  assert.equal(r.status, 200);
  assert.match(r.payload.hint, /^Most of your sounds are right/);
});

test('a good hint passes through with a highlight inside the attempt', async () => {
  const bodies = [];
  const r = await check({ ...base, attempt: 'famely' }, async (_u, o) => { bodies.push(JSON.parse(o.body)); return reply({ hint: 'The start of your word is right. Look at the sound near the end: what is another way to spell it?' }); });
  assert.equal(r.payload.verdict, 'try_again');
  assert.match(r.payload.hint, /^The start of your word is right/);
  const [s, e] = r.payload.highlight;
  assert.ok(s >= 0 && e <= 'famely'.length && e > s);
  assert.equal(bodies[0].reasoning_effort, 'none');
  assert.equal(bodies[0].max_completion_tokens, 150);
});

test('bad input gets a 400', async () => {
  for (const patch of [{ attempt: 'fam ly' }, { attempt: '' }, { attempt: 'fam1ly' }, { tryNumber: 4 }, { kind: 'other' }, { correct: 'x'.repeat(31) }]) {
    const r = await check({ ...base, ...patch }, noFetch);
    assert.equal(r.status, 400, JSON.stringify(patch));
    assert.ok(r.payload.error);
  }
});

test('hintLeaks', () => {
  assert.equal(hintLeaks('Try Family again', 'family', 'ly'), true);
  assert.equal(hintLeaks('Think of the ough sound', 'thought', 'ough'), true);
  assert.equal(hintLeaks('The word thoughtful is long', 'thought', 'ough'), false);
  assert.equal(hintLeaks('Look at the end', 'family', 'l'), false);
  assert.equal(hintLeaks('Which silent letter is it?', 'family', ''), true);
  assert.equal(hintLeaks('Good start. What else spells that sound?', 'family', 'ly'), false);
});
