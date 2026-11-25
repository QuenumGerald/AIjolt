#!/usr/bin/env python3
"""Video-first metadata audit. No download or publishing; no credentials required."""
import concurrent.futures
import datetime as dt
import json
import urllib.parse
import urllib.request

TOPICS = ("live music", "dance", "skateboard", "funny", "gaming", "animals", "concert", "street performance")

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Klieg/1.0 (public video discovery)"})
    with urllib.request.urlopen(req, timeout=12) as response:
        return json.load(response)

def search(topic):
    url = "https://sepiasearch.org/api/v1/search/videos?" + urllib.parse.urlencode(
        {"search": topic, "sort": "-publishedAt", "count": 30})
    return peertube(topic, url)

def peertube(topic, url):
    try:
        rows = fetch(url).get("data", [])
        cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=72)
        candidates = []
        for row in rows:
            if row.get("nsfw") is not False or not 0 < row.get("duration", 0) <= 140:
                continue
            published = dt.datetime.fromisoformat(row["publishedAt"].replace("Z", "+00:00"))
            if not cutoff <= published <= dt.datetime.now(dt.timezone.utc):
                continue
            candidates.append({"title": row.get("name"), "url": row.get("url"),
                "publishedAt": row["publishedAt"], "duration": row["duration"],
                "license": (row.get("licence") or {}).get("label"),
                "views": row.get("views"), "likes": row.get("likes")})
        return {"topic": topic, "scanned": len(rows), "shortRecent": len(candidates), "candidates": candidates}
    except Exception as exc:
        return {"topic": topic, "error": str(exc), "candidates": []}

def dailymotion():
    url = "https://api.dailymotion.com/videos?" + urllib.parse.urlencode({
        "fields": "id,title,created_time,duration,url,views_total",
        "channel": "music", "sort": "recent", "limit": 100})
    try:
        rows = fetch(url).get("list", [])
        now = dt.datetime.now(dt.timezone.utc)
        candidates = []
        for row in rows:
            published = dt.datetime.fromtimestamp(row["created_time"], dt.timezone.utc)
            if 0 < row.get("duration", 0) <= 140 and now - dt.timedelta(hours=72) <= published <= now:
                candidates.append({"title": row["title"], "url": row["url"], "publishedAt": published.isoformat(),
                    "duration": row["duration"], "views": row.get("views_total"), "license": None})
        return {"topic": "Dailymotion music", "scanned": len(rows), "shortRecent": len(candidates), "candidates": candidates}
    except Exception as exc:
        return {"topic": "Dailymotion music", "error": str(exc), "candidates": []}

if __name__ == "__main__":
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(search, TOPICS))
    for host in ("koreus.tv", "peertube.wtf"):
        results.append(peertube(host, f"https://{host}/api/v1/videos?sort=-publishedAt&count=100&isLocal=true"))
    results.append(dailymotion())
    unique = {c["url"] for result in results for c in result["candidates"] if c["url"]}
    print(json.dumps({"source": "SepiaSearch / PeerTube / Dailymotion", "uniqueCandidates": len(unique), "topics": results}, ensure_ascii=False, indent=2))
