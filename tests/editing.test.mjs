import test from 'node:test';
import assert from 'node:assert/strict';
import { editingTotals, inspectEditing, unavailableTotals } from '../api/_editing.js';
import { handleFeedback, powerUpProblems, hasIndependentPassages } from '../api/feedback.js';

const entry = (quote, correction, category = 'spelling', occurrence = 1) => ({quote, correction, category, occurrence});
const count = (transcript, errors, complete = true) => editingTotals({complete, errors}, transcript);

test('counts evidenced occurrences, not model totals or a five-error limit', () => {
  assert.deepEqual(count(Array(12).fill('becos').join(' '), Array.from({length:12}, (_,i)=>entry('becos','because','spelling',i+1))), {spelling:12,punctuation:0,capital_letters:0});
  assert.deepEqual(count('really hayfever Wednesdays mozzies', []), {spelling:0,punctuation:0,capital_letters:0});
  assert.deepEqual(count('becos', [entry('becos','because'),entry('becos','because')]), {spelling:1,punctuation:0,capital_letters:0});
});

test('separates punctuation, capitals and spacing from spelling', () => {
  assert.deepEqual(count('dont summer any thing', [entry('dont',"don't",'punctuation'),entry('summer','Summer','capital_letters'),entry('any thing','anything','spacing')]), {spelling:0,punctuation:1,capital_letters:1});
  assert.deepEqual(count('dont',[entry('dont',"don't")]),{spelling:0,punctuation:1,capital_letters:0});
  assert.deepEqual(count('summer',[entry('summer','Summer')]),{spelling:0,punctuation:0,capital_letters:1});
  for (const [quote, correction] of [['any thing','anything'],['hayfever','hay fever']]) {
    assert.deepEqual(count(quote,[entry(quote,correction)]), {spelling:0,punctuation:0,capital_letters:0});
  }
  for (const [quote, correction] of [['mozzies','mosquitoes'],['really','realy']]) {
    assert.deepEqual(count(quote,[entry(quote,correction)]), {spelling:null,punctuation:0,capital_letters:0});
  }
});

test('different editing categories can correct the same word independently', () => {
  assert.deepEqual(count('dont', [entry('dont','Dont','capital_letters'),entry('dont',"don't",'punctuation')]),{spelling:0,punctuation:1,capital_letters:1});
  assert.deepEqual(count('becos', [entry('becos','because'),entry('becos','Becos','capital_letters'),entry('becos','becos.','punctuation')]),{spelling:1,punctuation:1,capital_letters:1});
  assert.deepEqual(count('dont',[entry('dont',"don't",'spelling'),entry('dont',"don't",'punctuation')]),{spelling:0,punctuation:1,capital_letters:0});
});

test('occurrence numbering ignores matches embedded in longer words', () => {
  assert.deepEqual(count('We went home. we slept.',[entry('we','We','capital_letters')]),{spelling:0,punctuation:0,capital_letters:1});
  assert.deepEqual(count('the he he',[entry('he','He','capital_letters',2)]),{spelling:0,punctuation:0,capital_letters:1});
  assert.deepEqual(count('cats',[entry('cat','Cat','capital_letters')]),{spelling:0,punctuation:0,capital_letters:null});
});

test('invalid evidence affects its category; mixed corrections flag every affected category', () => {
  assert.deepEqual(count('famly dont', [entry('famly','family'),entry('missing','missing.','punctuation')]),{spelling:1,punctuation:null,capital_letters:0});
  assert.deepEqual(count('dont',[entry('dont',"Don't",'punctuation')]),{spelling:0,punctuation:null,capital_letters:null});
  assert.deepEqual(count('becos',[entry('becos','Because.','spelling')]),unavailableTotals());
  assert.deepEqual(count('cat',[entry('cat','cats'),entry('cat','cut')]),{spelling:null,punctuation:0,capital_letters:0});
  assert.equal(inspectEditing({complete:true,errors:[]},'[unclear]').retryable,false);
});

test('unverifiable audits never fabricate a total or zero', () => {
  for (const errors of [[entry('absent','word')],[entry('cat','dog')],[entry('cats','cat','spelling',2)],[entry('cats','Cats','punctuation')],[entry('cats','dogs','capital_letters')],[entry('cats','dogs','spacing')],[entry('cats','cat'),entry('cats','dog')], [entry('[unclear]','word')]]) {
    assert.deepEqual(count('cats [unclear]',errors), unavailableTotals());
  }
  assert.deepEqual(count('correct',[],false),unavailableTotals());
  assert.deepEqual(editingTotals(null,'correct'),unavailableTotals());
  assert.deepEqual(count('[unclear]',[]),unavailableTotals());
});

test('transition models must change the transition', () => {
  assert.deepEqual(powerUpProblems({power_ups:[{move:'transition',example_before:'Firstly, dogs are noisy. They bark.',example_after:'Firstly, dogs are noisy. They keep us awake until the next day.'}]}),['transition unchanged']);
  assert.deepEqual(powerUpProblems({power_ups:[{move:'transition',example_before:'Dogs damage gardens. They dig holes.',example_after:'Secondly, dogs damage gardens. They dig holes through flowerbeds.'}]}),[]);
});

const reply = (value) => ({ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(value)}}]})});
const env = {OPENAI_API_KEY:'test'};
const image = 'data:image/jpeg;base64,/9j/AAAA';

test('image verification corrects draft reading errors but preserves student mistakes and uncertainty', async () => {
  const bodies=[];
  const r=await handleFeedback({yearLevel:4,image},{env,fetchImpl:async (_url,options)=>{
    bodies.push(JSON.parse(options.body));
    return reply({transcript:bodies.length===1?'realy heyfever becos':'really hayfever becos [unclear]'});
  }});
  assert.equal(r.payload.transcript,'really hayfever becos [unclear]');
  assert.equal(r.payload.verification,'checked');
  assert.equal(bodies.length,2);
  assert.ok(bodies[1].messages[1].content.some(p=>p.type==='image_url'));
  assert.match(bodies[1].messages[1].content[0].text,/Correct only reading errors/);
});

test('unavailable verification returns draft with an explicit warning', async () => {
  let calls=0;
  const r=await handleFeedback({yearLevel:2,image},{env,fetchImpl:async()=>{
    if (++calls===1) return reply({transcript:'My famly'});
    throw new Error('timeout');
  }});
  assert.equal(r.payload.transcript,'My famly');
  assert.equal(r.payload.verification,'unavailable');
});

const draft = {
  headline:'Your reason is clear.',
  areas:Object.fromEntries(['audience','text_structure','ideas','vocabulary','cohesion','paragraphing','sentence_structure','punctuation','spelling'].map(key=>[key,{status:'steady',strength:'A reason.',next_step:'Develop your reason.'}])),
  power_ups:[{area:'ideas',skill:'Develop your reason',why:'Your reason is clear.',your_line:'My famly likes cats.',move:'elaborate',rule:'Add a detail.',example_before:'Birds are noisy.',example_after:'Birds are noisy. Their calls echo through the street before sunrise.',now_you:'Explain why.'}],
  error_totals:{spelling:10,punctuation:10,capital_letters:10},
};

test('reviewed evidence determines totals; corrections stay private', async () => {
  let calls=0;
  const r=await handleFeedback({yearLevel:4,transcript:'My famly likes cats.'},{env,fetchImpl:async()=>reply(++calls===1?draft:{approved:true,feedback:null,editing:{complete:true,errors:[entry('famly','family')]}})});
  assert.equal(r.status,200);
  assert.deepEqual(r.payload.errorTotals,{spelling:1,punctuation:0,capital_letters:0});
  assert.equal(JSON.stringify(r.payload).includes('family'),false);
  assert.equal(r.payload.editing,undefined);
});

test('review failure and a repaired-but-still-invalid transition fail safely', async () => {
  for (const review of [null,{approved:false},{approved:true,feedback:{...draft,power_ups:[{...draft.power_ups[0],move:'transition'}]}}]) {
    let calls=0;
    const r=await handleFeedback({yearLevel:4,transcript:'My famly likes cats.'},{env,fetchImpl:async()=>reply(++calls===1?draft:review)});
    assert.equal(r.status,502);
    assert.match(r.payload.error,/try again/i);
  }
});

test('the final editor can repair malformed generation JSON in its one review pass', async () => {
  let calls=0;
  const r=await handleFeedback({yearLevel:4,transcript:'My famly likes cats.'},{env,fetchImpl:async()=>{
    if (++calls===1) return {ok:true,json:async()=>({choices:[{message:{content:'{"headline":"unfinished",'}}]})};
    return reply({approved:true,feedback:draft,editing:{complete:true,errors:[entry('famly','family')]}});
  }});
  assert.equal(r.status,200);
  assert.equal(calls,2);
  assert.equal(r.payload.errorTotals.spelling,1);
});

test('younger writers receive at most two power-ups and no raw strategy keys', async () => {
  const extra = {...draft,power_ups:[
    {...draft.power_ups[0],skill:'Use sentence_expansion'},
    {...draft.power_ups[0],area:'vocabulary'},
    {...draft.power_ups[0],area:'cohesion'},
  ]};
  let calls=0;
  const r=await handleFeedback({yearLevel:2,transcript:'My famly likes cats.'},{env,fetchImpl:async()=>reply(++calls===1?extra:{approved:true,feedback:extra})});
  assert.equal(r.status,200);
  assert.equal(r.payload.powerUps.length,2);
  assert.equal(r.payload.powerUps[0].skill,'Use Sentence expansion');
});

test('distinct opinion passages are assessed independently, without splitting a continuous narrative', () => {
  const text = 'Buses are useful because they carry people.\n\nLibraries are important because they have books.';
  assert.equal(hasIndependentPassages(text, 'persuasive'), true);
  assert.equal(hasIndependentPassages(text, 'narrative'), false);
  assert.equal(hasIndependentPassages('Trees are useful.\n\nThey are homes for birds.', 'persuasive'), false);
  assert.equal(hasIndependentPassages('Dogs are loud. Secondly, dogs damage gardens.', 'persuasive'), false);
});

test('a focused recheck recovers editing counts without changing teaching feedback', async () => {
  const requests=[];
  const r=await handleFeedback({yearLevel:4,transcript:'dont'},{env,fetchImpl:async(_url,options)=>{
    requests.push(JSON.parse(options.body));
    if(requests.length===1) return reply(draft);
    if(requests.length===2) return reply({approved:true,feedback:draft,editing:{complete:true,errors:[entry('dont',"Don't",'punctuation')]}});
    return reply({editing:{complete:true,errors:[entry('dont',"don't",'punctuation'),entry('dont','Dont','capital_letters')]}});
  }});
  assert.equal(r.status,200);
  assert.equal(requests.length,3);
  assert.match(requests[2].messages[0].content,/EDITING_RECHECK/);
  assert.deepEqual(r.payload.errorTotals,{spelling:0,punctuation:1,capital_letters:1});
  assert.equal(r.payload.headline,draft.headline);
  assert.equal(JSON.stringify(r.payload).includes('mixed changes'),false);
  assert.equal(r.payload.editing,undefined);
});

test('a failed audit recheck retains independently verified categories', async () => {
  let calls=0;
  const r=await handleFeedback({yearLevel:4,transcript:'My famly likes cats.'},{env,fetchImpl:async()=>{
    if(++calls===1) return reply(draft);
    if(calls===2) return reply({approved:true,feedback:draft,editing:{complete:true,errors:[entry('famly','family'),entry('missing','missing.','punctuation')]}});
    throw new Error('unavailable');
  }});
  assert.equal(r.status,200);
  assert.equal(calls,3);
  assert.deepEqual(r.payload.errorTotals,{spelling:1,punctuation:null,capital_letters:0});
});

test('valid shared-word evidence does not make an extra provider call', async () => {
  let calls=0;
  const r=await handleFeedback({yearLevel:4,transcript:'dont'},{env,fetchImpl:async()=>reply(++calls===1?draft:{approved:true,feedback:draft,editing:{complete:true,errors:[entry('dont',"don't",'punctuation'),entry('dont','Dont','capital_letters')]}})});
  assert.equal(calls,2);
  assert.deepEqual(r.payload.errorTotals,{spelling:0,punctuation:1,capital_letters:1});
});

test('audit recovery respects the remaining request budget', async t => {
  let elapsed=0,calls=0;
  t.mock.method(Date,'now',()=>elapsed);
  const r=await handleFeedback({yearLevel:4,transcript:'dont'},{env,fetchImpl:async()=>{
    if(++calls===1) return reply(draft);
    elapsed=109_500;
    return reply({approved:true,feedback:draft,editing:{complete:false,errors:[]}});
  }});
  assert.equal(calls,2,'do not start another call with less than one second remaining');
  assert.equal(r.status,200);
  assert.deepEqual(r.payload.errorTotals,unavailableTotals());
});

test('a stretch keeps genuine strength ratings and private attainment evidence stays private', async () => {
  const strong = structuredClone(draft);
  strong.areas.ideas.status = 'strength';
  const requests = [];
  const result = await handleFeedback({yearLevel:6,genre:'persuasive',transcript:'My famly likes cats.'},{env,fetchImpl:async(_url,options)=>{
    requests.push(JSON.parse(options.body));
    return reply(requests.length===1?strong:{approved:true,learning_check:{demonstrated_skills:['PRIVATE_ASSESSMENT'],targets:[]},feedback:strong,editing:{complete:true,errors:[]}});
  }});
  assert.equal(result.status,200);
  assert.equal(result.payload.powerUps.length,1,'a useful single target is valid for an older writer');
  assert.equal(result.payload.criteria.find(c=>c.key==='ideas').status,'strength');
  assert.equal(JSON.stringify(result.payload).includes('PRIVATE_ASSESSMENT'),false);
  assert.equal(requests[1].reasoning_effort,'medium');
  assert.match(requests[1].messages[0].content,/FEEDBACK OBJECT SCHEMA/);
  assert.match(requests[1].messages[0].content,/ASSESSMENT AREAS/);
});
