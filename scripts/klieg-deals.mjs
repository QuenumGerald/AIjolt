// Klieg Tech & Gaming Deals. Node 20+, no additional dependencies.
// Sources: https://www.gamerpower.com/api-read (credit with link),
// https://apidocs.cheapshark.com/ (mandatory redirect links),
// https://promomagpie.com/feeds (cite and link each offer; do not quote codes).
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const UA = 'KliegDeals/1.0 (contact: https://github.com/QuenumGerald/AIjolt)';
const HOUR = 3600000;
const DAY = 24 * HOUR;
const now = Date.now();
const channel = '6b0090d3ece6dfde5f362098';
const statePath = resolve('data/klieg-deals-state.json');
const clean = v => String(v ?? '').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
const hash = v => createHash('sha256').update(v).digest('hex');
const time = v => v && v !== 'N/A' ? Date.parse(String(v).replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/, '$1T$2Z')) : NaN;
const validURL = (v, host) => { try { const u = new URL(v); return u.protocol === 'https:' && u.hostname === host && !u.username && !u.password ? u.href : null; } catch { return null; } };
const money = v => /^\d+(?:\.\d{1,2})?$/.test(String(v)) && Number.isFinite(Number(v)) ? Number(v) : NaN;
const pct = v => Math.round(v);
const norm = v => clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const tech = /\b(?:ram|ddr[345]|ssd|nvme|hdd|hard drive|memory kit|graphics card|gpu|rtx\s?\d|radeon|cpu|ryzen|processor|motherboard|mainboard|pc case|computer case|power supply|psu|gaming pc|desktop pc|mini pc|laptop|notebook|chromebook|monitor|keyboard|mouse|mice|headset|headphones|earbuds|webcam|microphone|router|wi-fi|wifi|nas|usb hub|docking station|dock|smartphone|tablet|power bank|charger|controller|console|handheld|gaming chair|gaming peripherals|gaming accessories|gaming gear|pc components|computer components|software|vpn|antivirus|mechanical keyboard)\b/i;
const exclude = /\b(?:first (?:order|purchase)|new customers?|student|military|membership|trade[- ]?in|rebate|financ(?:e|ing)|subscription|with purchase|buy .{0,80}(?:get|receive)|orders? over|free shipping|gift card|crypto|casino|gambling|refurbished|open box|preorder|pre-order|sweepstakes|giveaway|bundle|eligible|selected (?:items|products|models)|select (?:items|products|models)|up to|european markets|blacklisted|exclusions apply)\b/i;
const shorten = (v,n) => Array.from(clean(v)).length <= n ? clean(v) : '';
const dateText = v => new Date(v).toISOString().slice(0,10);
function candidate({source, id, type, title, offer, url, region, score, group, expiry, detail = ''}) {
  title = shorten(title, 115);
  offer = shorten(offer, 85);
  detail = shorten(detail, 72);
  if (!title || !offer || !url || !Number.isFinite(score) || (expiry && expiry <= now + 30*60000)) return null;
  const text = [
    type === 'tech' ? 'TECH DEAL' : (offer.startsWith('FREE') ? 'FREE GAME' : 'GAMING DEAL'),
    title, offer, detail, region, expiry ? 'Ends: ' + dateText(expiry) + ' (source date)' : '',
    'Check current terms & availability.', url,
  ].filter(Boolean).join('\n');
  // X counts URLs as 23 characters; conservatively count non-ASCII characters twice.
  const length = Array.from(text.replace(/https:\/\/[^\s]+/g,'x'.repeat(23))).reduce((s,c)=>s+(c.codePointAt(0)>127?2:1),0);
  if (length > 280) return null;
  return {source, id:hash(source+':'+id), type, title, offer, text, score, group:hash(group), expiry:expiry||null};
}
function gamerpower(rows) {
  if (!Array.isArray(rows)) throw Error('GamerPower unexpected response');
  return rows.flatMap(x => {
    const end = time(x.end_date);
    const start = time(x.published_date);
    const url = validURL(x.gamerpower_url,'www.gamerpower.com');
    if (x.status !== 'Active' || x.type !== 'Game' || !Number.isFinite(end) || !Number.isFinite(start) || start > now || now-start>14*DAY || !url) return [];
    // Avoid publishing inconsistent titles/descriptions; avoid mobile-only items.
    const raw = clean(x.title);
    if (!/\b(?:PC|Steam|Epic Games Store|GOG)\b/i.test(clean(x.platforms)) || /mobile|android|ios/i.test(raw)) return [];
    const title = raw.replace(/\s*\([^)]*\)\s*Giveaway$/i,'').replace(/\s+Giveaway$/i,'').trim();
    if (!title || !norm(x.description).includes(norm(title))) return [];
    const price = money(String(x.worth).replace(/^\$/,''));
    const c = candidate({source:'GamerPower',id:x.id,type:'gaming',title,offer:'FREE to claim'+(price>0?' (listed value $'+price.toFixed(2)+')':''),url,region:'Region may vary | via GamerPower',score:100+(end-now<DAY?10:0),group:'game:'+norm(title),expiry:end});
    return c?[c]:[];
  });
}
function cheapshark(rows) {
  if (!Array.isArray(rows)) throw Error('CheapShark unexpected response');
  return rows.flatMap(x=>{
    const sale=money(x.salePrice), regular=money(x.normalPrice), changed=Number(x.lastChange)*1000;
    if (x.isOnSale!=='1'||!Number.isFinite(sale)||!Number.isFinite(regular)||sale<=0||regular<=sale||!Number.isFinite(changed)||changed>now+5*60000||now-changed>14*DAY||!x.dealID) return [];
    const savings=pct((1-sale/regular)*100);
    if (savings<40 || Number(x.steamRatingCount)<20 || Number(x.steamRatingPercent)<70) return [];
    const id=String(x.dealID);
    let decoded;try{decoded=decodeURIComponent(id);}catch{return [];}
    const url='https://www.cheapshark.com/redirect?dealID='+encodeURIComponent(decoded);
    const c=candidate({source:'CheapShark',id:id+':'+sale,type:'gaming',title:x.title,offer:'$'+sale.toFixed(2)+' (listed $'+regular.toFixed(2)+', -'+savings+'%)',url,region:'USD listing | regional prices may vary',score:55+savings/4+Number(x.steamRatingPercent)/20,group:'game:'+norm(x.title)});
    return c?[c]:[];
  });
}
function magpie(feed) {
  if (feed.publisher?.country!=='US'||feed.publisher?.currency!=='USD'||!Array.isArray(feed.stores)||!Number.isFinite(time(feed.generated_at))||now-time(feed.generated_at)>3*HOUR) throw Error('Promo Magpie unexpected or stale US feed');
  return feed.stores.filter(s=>s.category==='Tech' && Array.isArray(s.offers)).flatMap(s=>s.offers.flatMap(x=>{
    const title=clean(x.title), terms=clean(x.terms), discount=clean(x.discount), end=time(x.expires_at), checked=time(x.last_checked_at), start=time(x.starts_at);
    if(x.status!=='active'||x.type!=='deal'||!Number.isFinite(checked)||checked>now+5*60000||now-checked>24*HOUR||(Number.isFinite(end)?end<=now+HOUR:now-checked>6*HOUR)||(Number.isFinite(start)&&start>now)||!tech.test(title)||exclude.test(title+' '+terms+' '+discount)||x.only_for?.length||x.conditions?.length) return [];
    if (!['merchant_feed','store_website','manual_check'].includes(x.verification?.method)) return [];
    // Prefer simple explicit percentage discounts. Never infer a product price.
    const match=discount.match(/^(\d{1,2})%\s*off$/i);
    if(!match||Number(match[1])<20||terms && norm(terms)!==norm(title)) return [];
    const url=validURL(x.url,'promomagpie.com');
    if(!url||!x.id||!s.name) return [];
    const c=candidate({source:'Promo Magpie',id:x.id,type:'tech',title,offer:discount+' | '+clean(s.name),url,region:'US | via Promo Magpie',score:70+Number(match[1])/3,group:'tech:'+norm(s.name)+' '+norm(title),expiry:Number.isFinite(end)?end:null});
    return c?[c]:[];
  }));
}
async function get(url) {
  const r=await fetch(url,{headers:{'user-agent':UA,accept:'application/json'},signal:AbortSignal.timeout(25000)});
  if(!r.ok) throw Error('HTTP '+r.status);
  return r.json();
}
async function collect() {
  const sources=[
    ['GamerPower','https://www.gamerpower.com/api/giveaways?type=game',gamerpower],
    ...Array.from({length:3},(_,i)=>['CheapShark page '+i,'https://www.cheapshark.com/api/1.0/deals?upperPrice=40&pageSize=60&onSale=1&sortBy=DealRating&pageNumber='+i,cheapshark]),
    ['CheapShark recent','https://www.cheapshark.com/api/1.0/deals?upperPrice=40&pageSize=60&onSale=1&sortBy=Recent',cheapshark],
    ['Promo Magpie','https://promomagpie.com/feeds/offers.json',magpie]
  ];
  const settled=await Promise.allSettled(sources.map(async ([name,url,parse])=>{const a=parse(await get(url));console.log(name+': '+a.length+' eligible');return a;}));
  const all=[];
  settled.forEach((v,i)=>{if(v.status==='fulfilled')all.push(...v.value);else console.error(sources[i][0]+': '+v.reason.message);});
  if(settled.every(x=>x.status==='rejected')) throw Error('All sources failed');
  const unique=new Map();
  for(const c of all.sort((a,b)=>b.score-a.score)) if(!unique.has(c.group)) unique.set(c.group,c);
  return [...unique.values()];
}
async function readState() {
  try {const s=JSON.parse(await readFile(statePath,'utf8'));if(!Array.isArray(s.history))throw Error('Invalid state');return s;} catch(e){if(e.code==='ENOENT')return {history:[]};throw e;}
}
async function save(s) {
  await mkdir(resolve('data'),{recursive:true});
  await writeFile(statePath+'.tmp',JSON.stringify(s,null,2),{mode:0o600});
  await rename(statePath+'.tmp',statePath);
}
function pick(all,history) {
  const recent=history.filter(h=>now-h.at<DAY);
  if(recent.some(h=>now-h.at<5*60000-1000)||recent.some(h=>h.status==='rate-limited'&&now-h.at<HOUR)) return null;
  const eligible=all.filter(c=>!history.some(h=>h.id===c.id||h.group===c.group&&now-h.at<7*DAY));
  if(!eligible.length)return null;
  const last=history.at(-1)?.type;
  return eligible.find(c=>c.type!==(last||'gaming'))||eligible[0];
}
async function publish(c) {
  const token=process.env.POPCULTURE_BUFFER_ACCESS_TOKEN?.trim();
  const actual=process.env.POPCULTURE_BUFFER_X_CHANNEL_ID?.trim();
  if(!token||actual!==channel||actual===process.env.BUFFER_X_CHANNEL_ID?.trim()||actual===process.env.BUFFER_LINKEDIN_CHANNEL_ID?.trim())throw Error('Klieg channel guard failed');
  if(process.env.POPCULTURE_DRY_RUN!=='false'||process.env.POPCULTURE_PUBLISH_ENABLED!=='true')throw Error('Publishing gate closed');
  const r=await fetch('https://api.buffer.com',{method:'POST',headers:{accept:'application/json','content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({query:'mutation CreatePost($text: String!, $channelId: ChannelId!, $assets: [AssetInput!]!) { createPost(input: { text: $text, channelId: $channelId, schedulingType: automatic, mode: shareNow, needsApproval: false, assets: $assets }) { ... on PostActionSuccess { post { id status } } ... on MutationError { message } } }',variables:{text:c.text,channelId:actual,assets:[]}}),signal:AbortSignal.timeout(20000)});
  if(!r.ok){const e=Error('Buffer HTTP '+r.status);e.rateLimited=r.status===429;throw e;}
  const j=await r.json();const p=j.data?.createPost?.post;
  if(!p?.id||j.errors?.length)throw Error('Buffer did not confirm post creation');
  return {id:p.id,status:p.status};
}
function selfTest(){
  const stamp=new Date(now).toISOString(), end=new Date(now+2*DAY).toISOString();
  const row={title:'32GB DDR5 RAM',discount:'40% off',status:'active',type:'deal',last_checked_at:stamp,expires_at:end,verification:{method:'merchant_feed'},id:1,url:'https://promomagpie.com/promo-codes/test#deal-1'};
  const fixture={publisher:{country:'US',currency:'USD'},generated_at:stamp,stores:[{name:'Test',category:'Tech',offers:[row,{...row,id:2,title:'Buy RAM and get 40% off'},{...row,id:3,expires_at:stamp},{...row,id:4,discount:'Up to 70% off'}]}]};
  assert.equal(magpie(fixture).length,1);
  const c=magpie(fixture)[0];assert.equal(c.type,'tech');assert.equal(pick([c],[]).id,c.id);
  assert.equal(pick([c],[{id:c.id,group:c.group,type:'tech',at:now-DAY}]),null);
  assert.equal(pick([c],[{id:'other',type:'gaming',at:now-60000}]),null);
  assert.equal(cheapshark([{isOnSale:'1',salePrice:'0.00'}]).length,0);
  assert.equal(validURL('https://evil.example/','promomagpie.com'),null);
  console.log('Self-test OK');
}
async function main(){
  if(process.argv.includes('--self-test'))return selfTest();
  const all=await collect();
  console.log('Eligible unique: '+all.length+' (tech '+all.filter(x=>x.type==='tech').length+', gaming '+all.filter(x=>x.type==='gaming').length+')');
  if(!process.argv.includes('--publish')){
    for(const type of ['tech','gaming'])for(const x of all.filter(c=>c.type===type).slice(0,3))console.log('\n'+x.text);
    return;
  }
  const state=await readState();const c=pick(all,state.history);
  if(!c){console.log('No new eligible offer or cadence limit');return;}
  // Reserve before the API call. Ambiguous failures require inspection rather than duplicate retries.
  const entry={id:c.id,group:c.group,type:c.type,at:now,status:'reserved',title:c.title};
  state.history=state.history.filter(h=>now-h.at<90*DAY);
  state.history.push(entry);await save(state);
  try{const p=await publish(c);entry.status='buffer-accepted';entry.bufferId=p.id;entry.bufferStatus=p.status;await save(state);console.log('Buffer accepted '+p.id+' '+p.status+' '+c.title);}
  catch(e){entry.status=e.rateLimited?'rate-limited':'needs-review';await save(state);throw e;}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
