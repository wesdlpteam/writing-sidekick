import {qualitySamples} from './quality-samples.mjs';

// Invented texts only. Paired samples test both age and demonstrated control.
export const section3Samples = [
  {yearLevel:2,level:'combining',genre:'report',transcript:'Wombats are mammals. Wombats live in burrows. The burrows are underground. Wombats eat grass.'},
  ...[1,4,6].flatMap(yearLevel => qualitySamples.filter(s=>['foundations','strong'].includes(s.level)).map(s=>({...s,yearLevel}))),
  {yearLevel:4,level:'short-extract',genre:'narrative',transcript:'Beneath the old bridge, the fox waited until the footsteps faded.'},
  {yearLevel:4,level:'irrelevant-detail',genre:'persuasive',transcript:'Walking to school helps children stay active. A short walk gives us exercise before lessons begin. My favourite sandwich is cheese and tomato. Walking with a friend can also make the journey enjoyable. This simple daily habit helps us build fitness.'},
];
