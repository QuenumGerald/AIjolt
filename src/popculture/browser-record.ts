import type { Page } from 'playwright-core';
import type { PopConfig } from './config.js';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, stat, chmod, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { assessVideo } from './video.js';
import { verifyNativeUrl } from './native.js';
const exec = promisify(execFile);
export function recordingAllowed(url: string, allowed = process.env.POPCULTURE_RECORD_AUTHORIZED_HOSTS || ''): boolean {
  try { return new URL(url).protocol === 'https:' && allowed.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).includes(new URL(url).hostname); } catch { return false; }
}
export async function recordPlayer(page: Page, url: string, config: PopConfig) {
  if (!config.mediaBaseUrl || !recordingAllowed(url) || !recordingAllowed(page.url())) return null;
  const raw = await page.evaluate(async () => {
    const videos = [...document.querySelectorAll('video')].filter(v=>v.getBoundingClientRect().width>=240 && v.getBoundingClientRect().height>=135 && !v.mediaKeys && Number.isFinite(v.duration) && v.duration>=5);
    if (videos.length !== 1) return null;
    const v = videos[0] as HTMLVideoElement & {captureStream?:()=>MediaStream};
    if (!v.captureStream || !MediaRecorder.isTypeSupported('video/webm')) return null;
    v.muted=false; v.volume=1; await v.play();
    const stream=v.captureStream();
    if (!stream.getVideoTracks().length || !stream.getAudioTracks().length) return null;
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm',videoBitsPerSecond:1500000});
    const chunks: Blob[]=[]; const start=v.currentTime;
    const result=await new Promise<string|null>(resolve=>{
      const stop=()=>{if(recorder.state==='recording')recorder.stop();};
      const timer=setTimeout(stop,15000);
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onerror=()=>{clearTimeout(timer);resolve(null);};
      recorder.onstop=async()=>{clearTimeout(timer);if(v.currentTime-start<4){resolve(null);return;} const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>resolve(null);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};
      v.addEventListener('ended',stop,{once:true}); recorder.start();
    });
    v.pause(); return result;
  });
  if (!raw) return null;
  const key=createHash('sha256').update('browser-record:'+url).digest('hex').slice(0,24);
  await mkdir(config.mediaDirectory,{recursive:true});
  const input=join(config.mediaDirectory,`record-${key}.webm`), output=join(config.mediaDirectory,`${key}.mp4`);
  try {
    await writeFile(input,Buffer.from(raw,'base64'),{mode:0o600});
    await exec('ffmpeg',['-nostdin','-v','error','-y','-i',input,'-vf','scale=-2:720','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',output],{timeout:45000});
    const probe=JSON.parse((await exec('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,codec_name','-of','json',output],{timeout:10000})).stdout);
    if(!probe.streams?.some((s:{codec_type:string;codec_name:string})=>s.codec_type==='video'&&s.codec_name==='h264') || Number(probe.format?.duration)<4) throw Error('invalid recording');
    if(!probe.streams?.some((s:{codec_type:string;codec_name:string})=>s.codec_type==='audio'&&s.codec_name==='aac')) throw Error('missing audio');
    const volume=await exec('ffmpeg',['-nostdin','-hide_banner','-i',output,'-af','volumedetect','-vn','-f','null','-'],{timeout:15000});
    const peak=Number(volume.stderr.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1]);
    if(!Number.isFinite(peak)||peak < -55) throw Error('silent recording');
    const result=assessVideo({url:new URL(`${key}.mp4`,config.mediaBaseUrl.replace(/\/?$/,'/')).href,mime:'video/mp4',bytes:(await stat(output)).size,durationSeconds:Number(probe.format.duration)});
    if(!result.attach)throw Error(result.rejection);
    await chmod(output,0o644);await verifyNativeUrl(result.url!);return result;
  } catch(e){await rm(output,{force:true});throw e;} finally{await rm(input,{force:true});}
}
