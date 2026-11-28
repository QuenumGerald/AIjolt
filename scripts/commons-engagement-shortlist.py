#!/usr/bin/env python3
"""Read-only engagement candidate discovery; no Buffer publication or DB queue writes."""
import urllib.request,urllib.parse,json,re,datetime,concurrent.futures,pathlib
API='https://commons.wikimedia.org/w/api.php'; UA='KliegEngagementResearch/0.1 (https://github.com/QuenumGerald/AIjolt)'
CATS=['Videos of concerts','Videos of festivals','Videos of cats','Videos of music performances','Videos of street performances','Videos of cosplay','Videos of video games']
BOOST={'concert':12,'festival':9,'performance':8,'cosplay':15,'game':8,'dance':11,'funny':18,'surpris':13,'crowd':7,'live':6,'cat':8,'guitar':5,'viral':15,'reaction':12,'costume':9,'sing':5,'flash mob':18,'celebrity':16,'film':10,'premiere':14,'music':8,'spectacular':12}
PENALTY={'military':-25,'navy':-20,'archive':-20,'historic':-15,'speech':-16,'recording session':-12,'ceremony':-8,'test':-20,'documentary':-8}
def fetch(cat):
 q={'action':'query','generator':'categorymembers','gcmtitle':'Category:'+cat,'gcmtype':'file','gcmlimit':150,'prop':'imageinfo','iiprop':'url|mime|size|extmetadata|timestamp','format':'json'}
 req=urllib.request.Request(API+'?'+urllib.parse.urlencode(q),headers={'User-Agent':UA})
 with urllib.request.urlopen(req,timeout=25) as resp: payload=json.load(resp)
 return cat,list(payload.get('query',{}).get('pages',{}).values())
def score(title,cat,timestamp,bytes):
 text=title.lower();value=30;reasons=[]
 for term,weight in BOOST.items():
  if term in text:value+=weight;reasons.append(term)
 for term,weight in PENALTY.items():
  if term in text:value+=weight
 if 'concert' in cat.lower():value+=5
 if 'festival' in cat.lower():value+=4
 if bytes>150_000_000:value-=12
 elif bytes<3_000_000:value-=6
 try:
  age=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(timestamp.replace('Z','+00:00'))).days
  if age<30:value+=16
  elif age<180:value+=10
  elif age<365:value+=5
  elif age>1800:value-=8
 except Exception:age=None
 return value,reasons,age
records={};errors=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 futures={pool.submit(fetch,c):c for c in CATS}
 for future in concurrent.futures.as_completed(futures):
  try:cat,pages=future.result()
  except Exception as e:errors.append(f'{futures[future]}: {str(e)[:120]}');continue
  for page in pages:
   info=(page.get('imageinfo') or [{}])[0];mime=info.get('mime','');url=info.get('url','');size=info.get('size',0)
   if not mime.startswith('video/') or not url.startswith('https://') or size>65_000_000 or size<1_000_000:continue
   title=page.get('title','');value,reasons,age=score(title,cat,info.get('timestamp',''),size)
   if title not in records or value>records[title]['score']:
    records[title]={'title':title,'category':cat,'score':value,'signals':reasons,'age_days_since_upload':age,'size_bytes':size,'mime':mime,'url':url,'license':info.get('extmetadata',{}).get('LicenseShortName',{}).get('value','unknown')}
shortlist=sorted(records.values(),key=lambda x:(-x['score'],x['size_bytes']))[:25]
report={'created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mode':'test-only; scores are heuristics, not view predictions','scanned_categories':CATS,'eligible_video_count':len(records),'shortlist':shortlist,'errors':errors,'published':False,'queued':False}
path=pathlib.Path('/opt/klieg/data/experiments/commons-engagement-shortlist.json');path.write_text(json.dumps(report,indent=2))
print('ELIGIBLE',len(records),'ERRORS',errors)
for x in shortlist[:12]:print(x['score'],x['age_days_since_upload'],x['category'],x['title'][:105],x['license'])
print('REPORT',path)
