#!/usr/bin/env node
/** Browser-rendered video discovery. Recording requires an explicit rights-cleared host. */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { isIP } from 'node:net';

const OUT = '/opt/klieg/data/experiments/playwright-video';
const INPUTS = [
  'https://www.etonline.com/recent/video',
  'https://www.nbcnews.com/pop-culture',
  'https://www.euronews.com/culture',
  'https://www.ign.com/videos',
  'https://www.gamespot.com/videos/',
];
const SAFE_HOSTS = new Set(['www.etonline.com','www.nbcnews.com','www.euronews.com','www.ign.com','www.gamespot.com']);
const ALLOWED_RECORD_HOSTS = new Set((process.env.KLIEG_RECORD_ALLOWED_HOSTS ?? '').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean));
const record = process.argv.includes('--record');
const targets = process.argv.filter(x=>x.startsWith('https://'));
const urls = targets.length ? targets : INPUTS;
function allowed(url) {
  try { const u = new URL(url);return u.protocol === 'https:' && !isIP(u.hostname) && !u.username && !u.password && SAFE_HOSTS.has(u.hostname); }
  catch { return false; }
}
if (urls.some(u=>!allowed(u))) { console.error('Only approved public HTTPS source hosts can be browsed');process.exit(2); }
if (record && urls.some(u=>!ALLOWED_RECORD_HOSTS.has(new URL(u).hostname))) {
  console.error('Recording blocked: configure KLIEG_RECORD_ALLOWED_HOSTS only for sources with verified reuse permission');process.exit(3);
}
await mkdir(OUT,{recursive:true});
const browser = await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
try {
  for (let i=0;i<urls.length;i++) {
    const url=urls[i]; const started=Date.now();const media=[];const errors=[];
    const context=await browser.newContext({viewport:{width:1280,height:720},recordVideo:record?{dir:OUT,size:{width:1280,height:720}}:undefined,serviceWorkers:'block'});
    const page=await context.newPage();
    page.on('response',r=>{
      const type=r.headers()['content-type']||'';
      if (/video\//i.test(type)||/\.(mp4|webm|m3u8)(\?|$)/i.test(r.url())) {
        if (media.length<100)media.push({url:r.url().slice(0,400),status:r.status(),type:type.slice(0,100)});
      }
    });
    // No authentication, DRM bypass, consent manipulation or automatic playback.
    try {
      const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:22000});
      await page.waitForTimeout(record?5000:1800);
      const info=await page.evaluate(()=>({title:document.title,videoElements:[...document.querySelectorAll('video')].slice(0,20).map(v=>({src:v.currentSrc||v.src||null,poster:v.poster||null,duration:Number.isFinite(v.duration)?v.duration:null})),embeddedPlayers:document.querySelectorAll('iframe').length}));
      await page.screenshot({path:join(OUT,`source-${i+1}.png`),fullPage:false,timeout:8000});
      results.push({source:url,status:response?.status(),...info,mediaRequests:media,elapsedMs:Date.now()-started,recorded:record});
    } catch(e){errors.push(String(e).slice(0,240));results.push({source:url,errors,mediaRequests:media,elapsedMs:Date.now()-started,recorded:false});}
    const video=record?page.video():null;
    await context.close();
    if(video){
      const raw=await video.path();const out=join(OUT,`source-${i+1}.mp4`);
      const conversion=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',raw,'-t','15','-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-an',out],{timeout:60000});
      results[results.length-1].recording=conversion.status===0?out:`ffmpeg failed: ${String(conversion.stderr).slice(0,140)}`;
    }
    console.log('BROWSED',url,results[results.length-1].status,'video tags',results[results.length-1].videoElements?.length??0,'media requests',media.length);
  }
} finally {await browser.close();}
const path=join(OUT,'report.json');await writeFile(path,JSON.stringify({checkedAt:new Date().toISOString(),mode:record?'rights-cleared-recording':'research-only',results,published:false,queued:false},null,2)+'\n');console.log('REPORT',path);
