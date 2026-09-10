import test from 'node:test';
import assert from 'node:assert/strict';
import { preservesExpansionKernel, removesWholeSentences, TWR_SENTENCE_GUIDANCE, TWR_ASSESSMENT_GUIDANCE } from '../api/_twr.js';
import { powerUpProblems, handleFeedback } from '../api/feedback.js';
import { MOVES } from '../api/_criteria.js';

test('expansion preserves the kernel while allowing details and pronoun replacement', () => {
  assert.equal(preservesExpansionKernel('The boat drifted.', 'Before sunrise, the boat drifted through the flooded streets to reach stranded families.'), true);
  assert.equal(preservesExpansionKernel('It drifted.', 'Before sunrise, the rescue boat drifted through flooded streets.'), true);
  assert.equal(preservesExpansionKernel('The boat drifted.', 'The boat raced through flooded streets.'), false);
  assert.equal(preservesExpansionKernel('The boat drifted.', 'The boat.'), false);
  assert.equal(preservesExpansionKernel('', 'The boat drifted.'), false);
  assert.deepEqual(powerUpProblems({power_ups:[{move:'sentence_expansion',example_before:'The boy went home.',example_after:'At dusk, the boy raced home.'}]}), ['expansion changed kernel']);
});

test('strategy definitions distinguish consequences, renamed nouns and preserved facts', () => {
  assert.match(MOVES.because_but_so.rule, /result/);
  assert.doesNotMatch(MOVES.because_but_so.rule, /what happened next/);
  assert.match(MOVES.appositive.rule, /noun or noun phrase that renames/);
  assert.match(MOVES.sentence_combining.rule, /adding no new facts/);
  assert.match(TWR_SENTENCE_GUIDANCE, /So that expresses purpose/);
  assert.match(TWR_SENTENCE_GUIDANCE, /not.*Australian school Years 1 and 2/);
});

test('transition checks accept an inserted phrase outside the example vocabulary', () => {
  const model = {move:'transition',example_before:'The hall should stay open. Staff would need a roster.',example_after:'The hall should stay open. To make this work, staff would need a roster.'};
  assert.deepEqual(powerUpProblems({power_ups:[model]}),[]);
  assert.deepEqual(powerUpProblems({power_ups:[{...model,example_after:model.example_before}]}),['transition unchanged']);
  assert.deepEqual(powerUpProblems({power_ups:[{...model,example_after:'The hall should stay open. Staff would need a clear roster.'}]}),['transition unchanged']);
});

test('both generation and final review receive the supplied section guidance', async () => {
  const prompts=[];
  const r=await handleFeedback({yearLevel:4,genre:'persuasive',transcript:'Parks are useful because children can play.'},{env:{OPENAI_API_KEY:'test'},fetchImpl:async(_url,options)=>{
    prompts.push(JSON.parse(options.body).messages[0].content);
    return {ok:true,json:async()=>({choices:[{message:{content:prompts.length===1?'{}':'{"approved":false}'}}]})};
  }});
  assert.equal(r.status,502);
  assert.equal(prompts.length,2);
  for (const prompt of prompts) {
    assert.ok(prompt.includes(TWR_SENTENCE_GUIDANCE));
    assert.ok(prompt.includes(TWR_ASSESSMENT_GUIDANCE));
    assert.match(prompt, /scaffold_in_task|Put this selected support in rule\/now_you/);
  }
});

test('paragraph focus removes whole sentences without rewriting useful ideas', () => {
  const before = 'The pond supports wildlife. My shoes are blue. Frogs shelter in its reeds.';
  const after = 'The pond supports wildlife. Frogs shelter in its reeds.';
  assert.equal(removesWholeSentences(before, after), true);
  for (const invalid of ['', before, 'The pond supports wildlife. Fish live there.', 'Frogs shelter in its reeds. The pond supports wildlife.', 'The pond supports frogs.']) {
    assert.equal(removesWholeSentences(before, invalid), false, invalid);
    assert.ok(powerUpProblems({power_ups:[{move:'paragraph_focus',example_before:before,example_after:invalid}]}).length);
  }
  assert.deepEqual(powerUpProblems({power_ups:[{move:'paragraph_focus',example_before:before,example_after:after}]}), []);
});
