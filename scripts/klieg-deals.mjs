// Klieg Tech & Gaming Deals. Node 20+, no additional dependencies.
// Sources: https://www.gamerpower.com/api-read (credit with link),
// https://apidocs.cheapshark.com/ (mandatory redirect links),
// https://promomagpie.com/feeds (cite and link each offer; do not quote codes).
import { readFile, writeFile, rename, mkdir, mkdtemp, rm, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

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
function candidate({source, id, type, title, offer, url, region, score, group, expiry, detail = '', sale, regular, savings, platform = '', merchant = '', rating, image = ''}) {
  title = shorten(title, 115);
  offer = shorten(offer, 85);
  detail = shorten(detail, 72);
  if (!title || !offer || !url || !Number.isFinite(score) || (expiry && expiry <= now + 30*60000)) return null;
  const free = offer.startsWith('FREE');
  const percent = savings ?? Number(offer.match(/^(\d+)%/)?.[1]);
  const key = hash(source+':'+id);
  const variants = free ? ['🎁 FREE GAME ALERT','🚨 FREE TO CLAIM','🎮 GRAB THIS GAME FOR FREE'] : type==='tech' ? ['⚡ TECH DEAL','🔥 HARDWARE PRICE DROP','💻 TECH SAVINGS'] : ['🎮 GAMING DEAL','🔥 GAME PRICE DROP','⚡ PC GAME DEAL'];
  const heading = variants[parseInt(key.slice(0,2),16)%variants.length] + (!free && Number.isFinite(percent) ? ' · '+percent+'% OFF' : '');
  const price = free ? 'FREE'+(regular>0?' (listed $'+regular.toFixed(2)+')':'') : Number.isFinite(sale) ? '$'+regular.toFixed(2)+' → $'+sale.toFixed(2) : offer;
  const info = [platform ? '🎮 '+platform : '', merchant ? '🛒 '+merchant : '', Number.isFinite(rating)&&rating>=70?'⭐ '+rating+'% positive on Steam':'', expiry?'⏳ Ends '+new Date(expiry).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}):''].filter(Boolean);
  const market = '🇺🇸 US offer'+(type==='gaming'?' · other regions may vary':'');
  const linkLabel = free?'Claim on '+source:'Shop on '+source;
  const make = () => [heading,'',title,'','💸 '+price, ...info, market,'',linkLabel+': '+url].join('\n');
  const length = t=>Array.from(t.replace(/https:\/\/[^\s]+/g,'x'.repeat(23))).reduce((s,c)=>s+(c.codePointAt(0)>127?2:1),0);
  let text=make();
  while(length(text)>280 && info.length){info.pop();text=make();}
  if(length(text)>280)return null;
  return {source,id:key,type,title,offer,text,score,group:hash(group),expiry:expiry||null,price,percent:Number.isFinite(percent)?percent:null,free,platform,merchant,image};
}
const entities=s=>String(s??'').replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi,m=>{const map={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '};if(map[m])return map[m];const n=m.startsWith('&#x')?parseInt(m.slice(3,-1),16):parseInt(m.slice(2,-1),10);return Number.isInteger(n)&&n>=0&&n<=0x10ffff?String.fromCodePoint(n):m;});
const usd=s=>money(String(s).replace(/[$,]/g,''));
function steamFeatured(j){
  if(!Array.isArray(j.specials?.items))throw Error('Steam featured invalid');
  return j.specials.items.flatMap(x=>{
    if(x.type!==0||!x.discounted||x.currency!=='USD'||!Number.isInteger(x.id)||x.final_price<=0||x.original_price<=x.final_price||x.discount_percent<40)return [];
    const expiry=Number(x.discount_expiration)*1000;
    const c=candidate({source:'Steam',id:x.id+':'+x.final_price,type:'gaming',title:x.name,offer:'Sale',url:'https://store.steampowered.com/app/'+x.id+'/',region:'US',score:85+x.discount_percent/4,group:'game:'+norm(x.name),expiry:Number.isFinite(expiry)?expiry:null,sale:x.final_price/100,regular:x.original_price/100,savings:x.discount_percent,platform:'Steam',image:x.large_capsule_image||x.header_image});
    return c?[c]:[];
  });
}
function steamSearch(j){
  if(typeof j.results_html!=='string')throw Error('Steam search invalid');
  return [...j.results_html.matchAll(/<a\b([^>]*\bdata-ds-itemkey="App_(\d+)"[^>]*)>([\s\S]*?)<\/a>/g)].flatMap(m=>{
    const [,attrs,id,h]=m;
    const name=entities(h.match(/<span class="title">([^<]+)<\/span>/)?.[1]);
    const d=h.match(/\bdata-discount="(\d+)"/), old=h.match(/class="discount_original_price">([^<]+)</), current=h.match(/class="discount_final_price">([^<]+)</);
    const rating=h.match(/(\d+)% of the ([\d,]+) user reviews/);
    const image=h.match(/<div class="search_capsule"><img src="([^"]+)"/)?.[1];
    if(!name||!d||!old||!current||!image||!rating||Number(rating[1])<70||Number(rating[2].replace(/,/g,''))<100||!/href="https:\/\/store\.steampowered\.com\/app\//.test(attrs))return [];
    const sale=usd(current[1]),regular=usd(old[1]),savings=Number(d[1]);
    if(!Number.isFinite(sale)||!Number.isFinite(regular)||sale<=0||regular<=sale||savings<40||Math.abs((1-sale/regular)*100-savings)>1.1)return [];
    const c=candidate({source:'Steam',id:id+':'+Math.round(sale*100),type:'gaming',title:name,offer:'Sale',url:'https://store.steampowered.com/app/'+id+'/',region:'US',score:55+savings/4+Number(rating[1])/20,group:'game:'+norm(name),sale,regular,savings,platform:'Steam',rating:Number(rating[1]),image:entities(image)});
    return c?[c]:[];
  });
}
function epic(j){
  const rows=j.data?.Catalog?.searchStore?.elements;
  if(!Array.isArray(rows))throw Error('Epic invalid');
  return rows.flatMap(x=>{
    const p=x.price?.totalPrice, promo=x.promotions?.promotionalOffers?.flatMap(y=>y.promotionalOffers||[]).find(y=>time(y.startDate)<=now&&time(y.endDate)>now);
    const slug=x.catalogNs?.mappings?.find(y=>y.pageType==='productHome')?.pageSlug||x.offerMappings?.find(y=>y.pageType==='productHome')?.pageSlug;
    const image=x.keyImages?.find(y=>y.type==='OfferImageWide')?.url;
    if(x.status!=='ACTIVE'||x.offerType!=='BASE_GAME'||!p||p.currencyCode!=='USD'||p.currencyInfo?.decimals!==2||p.discountPrice!==0||p.originalPrice<=0||!promo||!slug||!/^[a-z0-9-]+$/i.test(slug)||!image)return [];
    const c=candidate({source:'Epic Games',id:x.id,type:'gaming',title:x.title,offer:'FREE',url:'https://store.epicgames.com/en-US/p/'+slug,region:'US',score:120,group:'game:'+norm(x.title),expiry:time(promo.endDate),regular:p.originalPrice/100,platform:'Epic Games Store',image});
    return c?[c]:[];
  });
}
function corsair(html){
  const products=new Map();
  for(const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)){
    try{const j=JSON.parse(m[1]);if(j['@type']==='ItemList')for(const e of j.itemListElement||[]){const p=e.item;if(p?.url)products.set(new URL(p.url).pathname,p);}}catch{}
  }
  if(!products.size)throw Error('Corsair product schema missing');
  const cards=html.split(/<div role="group" aria-label="product card"/).slice(1);
  return cards.flatMap(h=>{
    const attrs=h.split('>')[0],sku=attrs.match(/data-product-sku="([^"]+)"/)?.[1],stock=attrs.match(/data-product-availability="([^"]+)"/)?.[1],price=money(attrs.match(/data-product-price="([^"]+)"/)?.[1]);
    const link=h.match(/href="(https:\/\/www\.corsair\.com\/us\/en\/p\/[^"]+)"/)?.[1], prices=h.match(/Current price: (\$[\d,.]+) - Original price: (\$[\d,.]+) - Discount: (\$[\d,.]+)/);
    if(!sku||stock!=='in-stock'||!attrs.includes('data-product-currency="USD"')||!link||!prices)return [];
    const url=new URL(entities(link));url.search='';url.hash='';
    const p=products.get(url.pathname),sale=usd(prices[1]),regular=usd(prices[2]),saved=usd(prices[3]);
    if(!p||p.offers?.priceCurrency!=='USD'||money(p.offers?.price)!==sale||sale!==price||!Number.isFinite(regular)||regular<=sale||Math.abs(regular-sale-saved)>0.02||!url.pathname.toLowerCase().includes('/'+sku.toLowerCase()+'/'))return [];
    const savings=Math.floor((1-sale/regular)*100+1e-8);
    if(savings<15)return [];
    const image=Array.isArray(p.image)?p.image[0]:p.image;
    const c=candidate({source:'Corsair',id:sku+':'+sale,type:'tech',title:p.name,offer:'Sale',url:url.href,region:'US',score:70+savings/2,group:'tech:'+sku.toLowerCase(),sale,regular,savings,merchant:'Corsair',image});
    return c?[c]:[];
  });
}
const officialShops=[['HyperX','https://hyperx.com'],['Keychron','https://www.keychron.com'],['Glorious','https://www.gloriousgaming.com'],['Sabrent','https://sabrent.com']];
async function shopify(source,base){
  const [cart,j]=await Promise.all([get(base+'/cart.js'),get(base+'/collections/all/products.json?limit=250&page=1')]);
  if(cart.currency!=='USD'||!Array.isArray(j.products))throw Error('USD catalog unavailable');
  return j.products.flatMap(p=>{
    if(!/^[a-z0-9-]+$/.test(p.handle)||!p.title||!p.vendor||!p.variants?.length||!/keyboard|mouse|mice|headset|headphone|microphone|ssd|nvme|hard drive|memory|ram\b|dock|charger|power bank|hub\b|controller|keycap|switch\b|webcam|storage|adapter|enclosure|monitor/i.test(p.title)||/shipping|gift card|replacement|refurbished|open box|accessory -|hx3d|topper|warranty|service fee/i.test(p.title))return [];
    const options=p.variants.flatMap(v=>{
      const sale=money(v.price),regular=money(v.compare_at_price);
      if(!v.available||!v.requires_shipping||!Number.isSafeInteger(v.id)||!Number.isFinite(sale)||!Number.isFinite(regular)||sale<10||regular<=sale)return [];
      const savings=Math.floor((1-sale/regular)*100+1e-8);if(savings<20)return [];
      const image=v.featured_image?.src||p.images?.find(i=>i.variant_ids?.includes(v.id))?.src||(p.variants.length===1?p.images?.[0]?.src:null);
      if(!image)return [];
      const title=p.title+(v.title==='Default Title'?'':' — '+v.title);
      const c=candidate({source,id:p.id+':'+v.id+':'+sale,type:'tech',title,offer:'Sale',url:base+'/products/'+p.handle+'?variant='+v.id,region:'US',score:72+savings/2,group:'shop:'+source+':'+p.id,sale,regular,savings,merchant:source,image});
      return c?[c]:[];
    });return options.sort((a,b)=>b.score-a.score).slice(0,1);
  });
}
function gog(j){
 if(!Array.isArray(j.products))throw Error('GOG catalog invalid');
 return j.products.flatMap(p=>{
 const sale=money(p.price?.finalMoney?.amount),regular=money(p.price?.baseMoney?.amount);
 if(p.productType!=='game'||p.productState!=='default'||p.price?.finalMoney?.currency!=='USD'||p.price?.baseMoney?.currency!=='USD'||!Number.isFinite(sale)||!Number.isFinite(regular)||sale<=0||regular<=sale||p.reviewsCount<20||!p.coverHorizontal)return [];
 const savings=Math.round((1-sale/regular)*100);if(savings<40||p.price.discount!=='-'+savings+'%')return [];
 const url=validURL(p.storeLink,'www.gog.com');if(!url||!new URL(url).pathname.startsWith('/en/game/'))return [];
 const c=candidate({source:'GOG',id:p.id+':'+sale,type:'gaming',title:p.title,offer:'Sale',url,region:'US',score:70+savings/4,group:'game:'+norm(p.title),sale,regular,savings,platform:'GOG',image:p.coverHorizontal});return c?[c]:[];
 });
}
async function get(url,html=false){
  const r=await fetch(url,{headers:{'user-agent':UA,accept:html?'text/html':'application/json'},signal:AbortSignal.timeout(18000)});
  if(!r.ok)throw Error('HTTP '+r.status);
  return html?r.text():r.json();
}
async function collect(){
  const steam='https://store.steampowered.com/search/results/?query&count=50&dynamic_data=&sort_by=Reviews_DESC&specials=1&infinite=1&cc=us&l=english&start=';
  const sources=[
    ['Steam featured','https://store.steampowered.com/api/featuredcategories?cc=us&l=english',steamFeatured],
    ...[0,50,100].map(n=>['Steam search '+n,steam+n,steamSearch]),
    ['Epic Games','https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US',epic],
    ...['memory','keyboards','gaming-headsets','data-storage','psu'].map(s=>['Corsair '+s,'https://www.corsair.com/us/en/c/'+s,corsair,true])
  ];
  sources.push(['GOG','https://catalog.gog.com/v1/catalog?limit=48&order=desc%3Abestselling&discounted=true&countryCode=US&currencyCode=USD&locale=en-US',gog]);
  for(const [name,base] of officialShops)sources.push([name,base,null]);
  const settled=await Promise.allSettled(sources.map(async ([name,url,parse,html])=>{const a=parse?parse(await get(url,html)):await shopify(name,url);console.log(name+': '+a.length+' eligible');return a;}));
  const all=[];settled.forEach((v,i)=>{if(v.status==='fulfilled')all.push(...v.value);else console.error(sources[i][0]+': '+v.reason.message);});
  if(settled.every(x=>x.status==='rejected'))throw Error('All sources failed');
  const unique=new Map();for(const c of all.sort((a,b)=>b.score-a.score))if(c.image&&!unique.has(c.group))unique.set(c.group,c);
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
// Use only the exact merchant-provided product/game image. Never synthesize a replacement.
async function realImage(c){
  let u;try{u=new URL(c.image);}catch{return null;}
  const allowed=c.source==='Steam'?['shared.akamai.steamstatic.com','shared.fastly.steamstatic.com','cdn.akamai.steamstatic.com','cdn.cloudflare.steamstatic.com']:c.source==='Epic Games'?['cdn1.epicgames.com','cdn2.unrealengine.com','cdn1.unrealengine.com']:c.source==='Corsair'?['assets.corsair.com']:c.source==='GOG'?['images.gog-statics.com']:officialShops.some(([name])=>name===c.source)?['cdn.shopify.com']:[];
  if(u.protocol!=='https:'||u.username||u.password||!allowed.includes(u.hostname))return null;
  if(c.source==='Steam'&&!u.pathname.includes('/steam/apps/'+new URL(c.text.match(/https:\/\/store\.steampowered\.com\/app\/\d+\//)?.[0]||'https://store.steampowered.com/').pathname.split('/')[2]+'/'))return null;
  // Download only from the known merchant CDN, without redirects; use a bounded image size.
  const r=await fetch(u,{redirect:'error',headers:{'user-agent':UA,accept:'image/jpeg,image/png,image/webp'},signal:AbortSignal.timeout(12000)});
  if(!r.ok||!/^image\/(?:jpeg|png|webp)(?:;|$)/i.test(r.headers.get('content-type')||''))return null;
  const max=8*1024*1024;if(Number(r.headers.get('content-length'))>max)return null;
  const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>max)return null;chunks.push(chunk);}if(size<1024)return null;
  const dir=process.env.POPCULTURE_MEDIA_DIRECTORY,base=process.env.POPCULTURE_MEDIA_BASE_URL;
  if(!dir||!base)throw Error('Media hosting not configured');
  const name='real-'+c.id.slice(0,24)+'.jpg',output=resolve(dir,name);
  const tmp=await mkdtemp('/tmp/klieg-real-');
  try{
    const input=resolve(tmp,'input');await writeFile(input,Buffer.concat(chunks));
    const {stdout}=await exec('/usr/bin/ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',input],{timeout:8000});
    const v=JSON.parse(stdout).streams?.[0];if(!v||v.width<220||v.height<80||v.width*v.height>24000000)return null;
    await exec('/usr/bin/ffmpeg',['-hide_banner','-loglevel','error','-y','-i',input,'-vf','scale=1600:1600:force_original_aspect_ratio=decrease','-frames:v','1','-threads','1','-q:v','3',output],{timeout:12000});
    await chmod(output,0o644);
    const url=new URL(name,base.endsWith('/')?base:base+'/').href;
    const check=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(8000)});
    return check.ok&&check.headers.get('content-type')?.startsWith('image/')?url:null;
  }finally{await rm(tmp,{recursive:true,force:true});}
}
async function publish(c) {
  const token=process.env.POPCULTURE_BUFFER_ACCESS_TOKEN?.trim();
  const actual=process.env.POPCULTURE_BUFFER_X_CHANNEL_ID?.trim();
  if(!token||actual!==channel||actual===process.env.BUFFER_X_CHANNEL_ID?.trim()||actual===process.env.BUFFER_LINKEDIN_CHANNEL_ID?.trim())throw Error('Klieg channel guard failed');
  if(process.env.POPCULTURE_DRY_RUN!=='false'||process.env.POPCULTURE_PUBLISH_ENABLED!=='true')throw Error('Publishing gate closed');
  const imageUrl=c.verifiedImage;
  if(!imageUrl)throw Error('Real image required');
  console.log('Real image ready '+imageUrl);
  const r=await fetch('https://api.buffer.com',{method:'POST',headers:{accept:'application/json','content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({query:'mutation CreatePost($text: String!, $channelId: ChannelId!, $assets: [AssetInput!]!) { createPost(input: { text: $text, channelId: $channelId, schedulingType: automatic, mode: shareNow, needsApproval: false, assets: $assets }) { ... on PostActionSuccess { post { id status } } ... on MutationError { message } } }',variables:{text:c.text,channelId:actual,assets:[{image:{url:imageUrl}}]}}),signal:AbortSignal.timeout(20000)});
  if(!r.ok){const e=Error('Buffer HTTP '+r.status);e.rateLimited=r.status===429;throw e;}
  const j=await r.json();const p=j.data?.createPost?.post;
  if(!p?.id||j.errors?.length)throw Error('Buffer did not confirm post creation');
  return {id:p.id,status:p.status};
}
function selfTest(){
 const a=steamFeatured({specials:{items:[{type:0,discounted:true,currency:'USD',id:1,name:'Test game',final_price:499,original_price:999,discount_percent:50,large_capsule_image:'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1/header.jpg'}]}});
 assert.equal(a.length,1);assert.match(a[0].text,/50% OFF/);assert.match(a[0].text,/https:\/\/store\.steampowered\.com\/app\/1\//);assert.equal(pick(a,[]).id,a[0].id);assert.equal(pick(a,[{id:a[0].id,at:now-DAY}]),null);
 assert.equal(steamFeatured({specials:{items:[{type:0,discounted:true,currency:'USD',id:1,final_price:0,original_price:999,discount_percent:100}]}}).length,0);
 console.log('Self-test OK');
}
async function main(){
  if(process.argv.includes('--self-test'))return selfTest();
  const all=await collect();
  console.log('Eligible unique: '+all.length+' (tech '+all.filter(x=>x.type==='tech').length+', gaming '+all.filter(x=>x.type==='gaming').length+')');
  if(process.argv.includes('--preview-card')){const c=all.find(x=>x.type==='tech')||all[0];if(!c)throw Error('No eligible preview');console.log('Preview: '+await realImage(c));}
  if(!process.argv.includes('--publish')){
    for(const type of ['tech','gaming'])for(const x of all.filter(c=>c.type===type).slice(0,3))console.log('\n'+x.text);
    return;
  }
  const state=await readState();let c;const remaining=[...all];
  for(let i=0;i<5;i++){const next=pick(remaining,state.history);if(!next)break;try{next.verifiedImage=await realImage(next);if(next.verifiedImage){c=next;break;}}catch(e){console.error('Image unavailable: '+next.title+' '+e.message);}remaining.splice(remaining.indexOf(next),1);}
  if(!c){console.log('No new eligible offer or cadence limit');return;}
  // Reserve before the API call. Ambiguous failures require inspection rather than duplicate retries.
  const entry={id:c.id,group:c.group,type:c.type,at:now,status:'reserved',title:c.title};
  state.history=state.history.filter(h=>now-h.at<90*DAY);
  state.history.push(entry);await save(state);
  try{const p=await publish(c);entry.status='buffer-accepted';entry.bufferId=p.id;entry.bufferStatus=p.status;await save(state);console.log('Buffer accepted '+p.id+' '+p.status+' '+c.title);}
  catch(e){entry.status=e.rateLimited?'rate-limited':'needs-review';await save(state);throw e;}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
