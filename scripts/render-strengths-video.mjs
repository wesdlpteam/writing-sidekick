// Local motion graphic from Nathan's supplied character artwork. Requires ffmpeg.
// Usage on Windows: node scripts/render-strengths-video.mjs path/to/sidekick.jpg
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';

const source = process.argv[2];
if (!source || !fs.existsSync(source)) throw new Error('Supply the original Sidekick image path.');
const bold = 'C\\:/Windows/Fonts/arialbd.ttf';
const symbols = 'C\\:/Windows/Fonts/seguisym.ttf';
const alpha = start => `min(1,max(0,(t-${start})/0.7))`;
const title = (text,y,size=46,start=0.25) => `drawtext=fontfile='${bold}':text='${text}':fontcolor=0x392459:fontsize=${size}:x=42:y=${y}:alpha='${alpha(start)}'`;
const star = (x,y,start,size) => `drawtext=fontfile='${symbols}':text='★':fontcolor=0xD5A02A:fontsize=${size}:x='${x}+8*sin(min(t,3.5)*0.7)':y='${y}-8*sin(min(t,3.5)*0.8)':alpha='${alpha(start)}'`;
const filters = [
  '[0:v]scale=1240:-2,format=rgba,fade=t=in:st=0:d=0.9:alpha=1[hero]',
  "[1:v][hero]overlay=x='20+18*(1-min(t/1.6,1))':y=22:shortest=1[scene]",
  '[scene]' + [
    'drawbox=x=0:y=0:w=9:h=720:color=0xC77DFF:t=fill',
    title('WRITING',62,76), title('STRENGTHS',150,76),
    'drawbox=x=44:y=247:w=135:h=7:color=0xFFC233:t=fill',
    star(1130,42,1.1,45), star(1120,565,2.0,35), star(133,295,2.7,37),
    'format=yuv420p',
  ].join(',') + '[out]',
].join(';');

function run(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner','-loglevel','error','-y',...args], {stdio:'inherit'});
  if (result.status !== 0) throw new Error('Video rendering failed.');
}
run(['-loop','1','-i',source,'-f','lavfi','-i','color=c=white:s=1280x720:r=30',
  '-filter_complex',filters,'-map','[out]','-t','5','-r','30','-an','-c:v','libx264','-crf','21','-preset','medium','-movflags','+faststart','art/strengths.mp4']);
run(['-ss','4.5','-i','art/strengths.mp4','-frames:v','1','-update','1','-q:v','2','art/strengths.jpg']);
console.log('Created art/strengths.mp4 (5 seconds) and matching poster.');
