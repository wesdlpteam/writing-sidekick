import fs from 'node:fs';
import {handleFeedback} from '../api/feedback.js';
import {qualitySamples} from '../tests/fixtures/quality-samples.mjs';
import {holdouts} from '../tests/fixtures/quality-holdouts.mjs';
for (const file of ['.env.local','.env']) { try { process.loadEnvFile(file); } catch {} }
const jobs = process.argv[3]==='holdouts' ? holdouts.filter(s=>!process.argv[4] || s.level.includes(process.argv[4])) : [1,2,3,4,5,6].flatMap(yearLevel=>qualitySamples.map(s=>({...s,yearLevel}))).filter(s=>!process.argv[3] || `${s.yearLevel}-${s.level}`.includes(process.argv[3]));
const dir = process.argv[2] || `output/quality-eval-${new Date().toISOString().replace(/[:.]/g,'-')}`;
fs.mkdirSync(dir,{recursive:true});
let next=0, failures=0;
const unusable = result => result.status!==200 || !result.payload?.powerUps?.length || result.payload.powerUps.some(p=>!p.example || !p.yourLine);
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
      const result=await handleFeedback(job,{env:process.env,fetchImpl:async(...args)=>{
        const response=await fetch(...args);
        fs.writeFileSync(`${dir}/${name}-call${++calls}.txt`,await response.clone().text());
        return response;
      }});
      fs.writeFileSync(`${dir}/${name}.json`,JSON.stringify({sample:job,...result,ms:Date.now()-started},null,2));
      if(unusable(result)) failures++;
      console.log(name,result.status,`${Date.now()-started}ms`);
    } catch(error) { failures++; console.log(name,'ERROR',error.name); }
  }
}));
console.log(`${jobs.length} cases; ${failures} delivery/structure failures. Results: ${dir}. Teaching quality still requires reading the outputs.`);
process.exitCode=failures?1:0;
