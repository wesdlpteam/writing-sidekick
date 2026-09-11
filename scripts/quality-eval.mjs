import fs from 'node:fs';
import {handleFeedback} from '../api/feedback.js';
import {qualitySamples} from '../tests/fixtures/quality-samples.mjs';
import {holdouts} from '../tests/fixtures/quality-holdouts.mjs';
import {section3Samples} from '../tests/fixtures/quality-section3.mjs';
for (const file of ['.env.local','.env']) { try { process.loadEnvFile(file); } catch {} }
const suite = process.argv[3]==='section3' ? section3Samples : process.argv[3]==='holdouts' ? holdouts : null;
const jobs = suite ? suite.filter(s=>!process.argv[4] || `${s.yearLevel}-${s.level}`.includes(process.argv[4])) : [1,2,3,4,5,6].flatMap(yearLevel=>qualitySamples.map(s=>({...s,yearLevel}))).filter(s=>!process.argv[3] || `${s.yearLevel}-${s.level}`.includes(process.argv[3]));
const dir = process.argv[2] || `output/quality-eval-${new Date().toISOString().replace(/[:.]/g,'-')}`;
// Compare review settings without changing production defaults. Timings include
// receipt of the complete response body, not just its initial headers.
const reviewEffort = process.env.FEEDBACK_EVAL_REVIEW_EFFORT;
if (reviewEffort && !['low','medium','high'].includes(reviewEffort)) throw new Error('Unsupported review effort');
fs.mkdirSync(dir,{recursive:true});
let next=0, failures=0;
const unusable = result => result.status!==200 || !Array.isArray(result.payload?.powerUps) || (!result.payload.powerUps.length && result.payload.criteria.some(c=>!['spelling','punctuation'].includes(c.key) && c.status!=='not_assessed')) || result.payload.powerUps.some(p=>!p.example || !p.yourLine);
await Promise.all(Array.from({length:3},async()=>{
  while(next<jobs.length){
    const job=jobs[next++], name=`year${job.yearLevel}-${job.level}`;
    if(fs.existsSync(`${dir}/${name}.json`)) {
      const saved=JSON.parse(fs.readFileSync(`${dir}/${name}.json`,'utf8'));
      if(unusable(saved)) failures++;
      console.log(name,'reusing saved result',saved.status);
      continue;
    }
    const started=Date.now();
    try {
      let calls=0;
      const stages=[];
      const result=await handleFeedback(job,{env:process.env,fetchImpl:async(url,options)=>{
        const body=JSON.parse(options.body);
        const stage=body.messages?.[0]?.content?.startsWith('QUALITY_REVIEW:') ? 'teaching-review' : body.messages?.[0]?.content?.startsWith('EDITING_RECHECK:') ? 'editing-recheck' : body.messages?.[0]?.content?.startsWith('EDITING_AUDIT:') ? 'editing-audit' : 'draft';
        if (reviewEffort && stage==='teaching-review') body.reasoning_effort=reviewEffort;
        const callStarted=Date.now();
        const response=await fetch(url,{...options,body:JSON.stringify(body)});
        const raw=await response.clone().text();
        fs.writeFileSync(`${dir}/${name}-call${++calls}.txt`,raw);
        let usage;
        try { usage=JSON.parse(raw).usage; } catch {}
        stages.push({stage,model:body.model,reasoningEffort:body.reasoning_effort,ms:Date.now()-callStarted,usage});
        return response;
      }});
      fs.writeFileSync(`${dir}/${name}.json`,JSON.stringify({sample:job,...result,ms:Date.now()-started,stages},null,2));
      if(unusable(result)) failures++;
      console.log(name,result.status,`${Date.now()-started}ms`);
    } catch(error) { failures++; console.log(name,'ERROR',error.name); }
  }
}));
console.log(`${jobs.length} cases; ${failures} delivery/structure failures. Results: ${dir}. Teaching quality still requires reading the outputs.`);
process.exitCode=failures?1:0;
