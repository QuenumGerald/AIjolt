#!/usr/bin/env node
/** Browser-rendered multi-source video discovery with bounded diagnostic recording. */
import { chromium } from 'playwright-core';
import { mkdir, writeFile, readdir, stat, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { isIP } from 'node:net';

const OUT = '/opt/klieg/data/experiments/playwright-video';
const INPUTS = [
  'https://www.etonline.com/recent/video',
  'https://www.nbcnews.com/pop-culture',
  'https://www.euronews.com/culture',
  'https://www.ign.com/videos',
  'https://www.gamespot.com/videos/',
  'https://variety.com/v/video/',
  'https://deadline.com/vcategory/video/',
  'https://www.hollywoodreporter.com/video/',
  'https://www.billboard.com/video/',
  'https://www.rollingstone.com/video/',
  'https://www.nme.com/video',
  'https://www.thewrap.com/video/',
  'https://www.indiewire.com/video/',
  'https://www.theguardian.com/film/video',
  'https://www.theguardian.com/music/video',
  'https://www.bbc.com/culture',
  'https://www.cbsnews.com/entertainment/',
  'https://abcnews.go.com/Entertainment',
  'https://www.eonline.com/videos',
  'https://www.accessonline.com/videos',
  'https://www.gamesradar.com/news/',
  'https://www.polygon.com/videos',
  'https://www.videogameschronicle.com/',
  'https://www.consequence.net/video/',
];
const SAFE_HOSTS = new Set(INPUTS.map(url => new URL(url).hostname));
// Recording documents what the browser rendered. It is not permission to republish.
const record = !process.argv.includes('--no-record');
const maxSites = Math.min(30, Math.max(1, Number(process.env.KLIEG_BROWSER_MAX_SITES || '24')));
const targets = process.argv.filter(x=>x.startsWith('https://'));
const urls = (targets.length ? targets : INPUTS).slice(0,maxSites);
function allowed(url) {
  try { const u = new URL(url);return u.protocol === 'https:' && !isIP(u.hostname) && !u.username && !u.password && SAFE_HOSTS.has(u.hostname); }
  catch { return false; }
}
if (urls.some(u=>!allowed(u))) { console.error('Only approved public HTTPS source hosts can be browsed');process.exit(2); }
await mkdir(OUT,{recursive:true});
// Retain only recent diagnostic captures and avoid filling disk over time.
for (const name of await readdir(OUT)) {
  if (!/^(source-\d+\.(?:png|mp4)|[a-f0-9-]+\.webm)$/.test(name)) continue;
  const file = join(OUT,name);
  try { if (Date.now() - (await stat(file)).mtimeMs > 2*86400_000) await unlink(file); } catch {}
}

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
      await page.waitForTimeout(record?2600:1000);
      const info=await page.evaluate(()=>({title:document.title,videoElements:[...document.querySelectorAll('video')].slice(0,20).map(v=>({src:v.currentSrc||v.src||null,poster:v.poster||null,duration:Number.isFinite(v.duration)?v.duration:null})),embeddedPlayers:document.querySelectorAll('iframe').length}));
      await page.screenshot({path:join(OUT,`source-${i+1}.png`),fullPage:false,timeout:8000});
      results.push({source:url,status:response?.status(),...info,mediaRequests:media,elapsedMs:Date.now()-started,recorded:record});
    } catch(e){errors.push(String(e).slice(0,240));results.push({source:url,errors,mediaRequests:media,elapsedMs:Date.now()-started,recorded:false});}
    const video=record?page.video():null;
    await context.close();
    if(video){
      const raw=await video.path();const out=join(OUT,`source-${i+1}.mp4`);
      const conversion=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',raw,'-t','8','-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-an',out],{timeout:60000});
      results[results.length-1].recording=conversion.status===0?out:`ffmpeg failed: ${String(conversion.stderr).slice(0,140)}`;
      try { await unlink(raw); } catch {}
    }
    console.log('BROWSED',url,results[results.length-1].status,'video tags',results[results.length-1].videoElements?.length??0,'media requests',media.length);
  }
} finally {await browser.close();}
const path=join(OUT,'report.json');await writeFile(path,JSON.stringify({checkedAt:new Date().toISOString(),mode:record?'diagnostic-screen-recording':'research-only',results,published:false,queued:false},null,2)+'\n');console.log('REPORT',path);
