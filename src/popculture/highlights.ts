import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

export type ClipRange = { start: number; duration: number };
export const HIGHLIGHT_VERSION = 'scene-v1';

/** Scene-cut candidates, not semantic understanding of a video's news value. */
export function parseSceneCuts(log: string, total: number): number[] {
  const times = [...log.matchAll(/pts_time:([\d.]+)/g)]
    .map(match => Number(match[1]))
    .filter(time => Number.isFinite(time) && time > 3 && time < total - 3);
  return [...new Set(times.map(time => Math.round(time * 10) / 10))].sort((a,b) => a-b);
}

/** Diversify clips over the source timeline; cuts anchor segment starts where available. */
export function chooseHighlightRanges(total: number, target: number, cuts: number[]): ClipRange[] {
  if (!Number.isFinite(total) || !Number.isFinite(target) || total <= 0 || target <= 0) throw Error('invalid highlight durations');
  const length = Math.min(total,target);
  if (total <= target + 8) return [{start:0,duration:length}];
  const count = length >= 42 ? 3 : length >= 24 ? 2 : 1;
  if (count === 1) return [{start:Math.min(total-length,Math.max(0,total/3)),duration:length}];
  const lengths = Array.from({length:count},(_,i)=>i===count-1 ? length-Math.floor(length/count)*(count-1) : Math.floor(length/count));
  const maxStart = total - length;
  const selected: ClipRange[] = [];
  for (let i=0;i<count;i++) {
    const nominal = i*(total/count)+Math.min(3,total/count/5);
    const maxAllowed = total - lengths[i];
    const nearby = cuts.filter(c => c >= Math.max(0,nominal-8) && c <= Math.min(maxAllowed,nominal+8));
    const preferred = nearby.length ? nearby.reduce((best,c)=>Math.abs(c-nominal)<Math.abs(best-nominal)?c:best) : nominal;
    let start = Math.max(0,Math.min(maxAllowed,preferred));
    if (selected.length) {
      const prev=selected[selected.length-1];
      start=Math.max(start,prev.start+prev.duration+0.1);
    }
    if (start+lengths[i]>total) start=total-lengths[i];
    if (selected.length && start < selected[selected.length-1].start+selected[selected.length-1].duration) {
      return [{start:0,duration:length}];
    }
    selected.push({start:Math.round(start*10)/10,duration:lengths[i]});
  }
  // Require meaningful source coverage before using a multi-cut montage.
  if (selected.at(-1)!.start < maxStart*0.6) return [{start:0,duration:length}];
  return selected;
}

/** ffmpeg detects actual scene changes from pixels; no AI or transcript is claimed. */
export async function detectSceneCuts(url: string, total: number): Promise<number[]> {
  if (!Number.isFinite(total) || total < 30) return [];
  const scan=Math.min(total,360);
  const {stderr}=await exec('ffmpeg',[
    '-nostdin','-hide_banner','-loglevel','info', '-rw_timeout','25000000',
    '-i',url,'-t',String(scan),'-an',
    '-vf',"fps=2,scale=320:-2,select='gt(scene,0.28)',showinfo",
    '-vsync','vfr','-f','null','-',
  ],{timeout:110_000,maxBuffer:2_000_000});
  return parseSceneCuts(stderr,scan);
}

export type MomentSignal = { time:number; motion:number };
export function parseMotion(log:string): MomentSignal[] {
  let time=0; const out:MomentSignal[]=[];
  for(const line of log.split('\n')) {
    const t=line.match(/pts_time:([\d.]+)/); if(t) time=Number(t[1]);
    const m=line.match(/lavfi.signalstats.YDIF=([\d.]+)/); if(m) out.push({time,motion:Number(m[1])});
  } return out;
}
/** A continuous active window, not a semantic or viral prediction. */
export function bestContinuousRange(total:number,target:number,signals:MomentSignal[]):ClipRange {
  const duration=Math.min(total,target); let best=0, bestScore=-Infinity;
  for(let start=0;start<=total-duration;start+=1){
    const samples=signals.filter(s=>s.time>=start&&s.time<start+duration);
    if(!samples.length)continue;
    const avg=samples.reduce((n,s)=>n+Math.min(s.motion,25),0)/samples.length;
    const opening=samples.filter(s=>s.time<start+3);
    const hook=opening.reduce((n,s)=>n+Math.min(s.motion,25),0)/Math.max(1,opening.length);
    const score=avg*.7+hook*.3;
    if(score>bestScore){bestScore=score;best=start;}
  } return {start:best,duration};
}
export async function detectMotion(url:string,total:number):Promise<MomentSignal[]> {
  const {stderr}=await exec('ffmpeg',['-nostdin','-hide_banner','-loglevel','info','-rw_timeout','25000000','-i',url,'-t',String(Math.min(total,360)),'-an','-vf','fps=2,scale=320:-2,signalstats,metadata=print:key=lavfi.signalstats.YDIF','-f','null','-'],{timeout:110000,maxBuffer:3000000});
  return parseMotion(stderr);
}
