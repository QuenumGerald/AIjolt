#!/usr/bin/env python3
"""Daily Commons freshness audit; never downloads, queues or publishes video."""
import datetime as dt
import json
import pathlib
import urllib.parse
import urllib.request

API = 'https://commons.wikimedia.org/w/api.php'
UA = 'KliegFreshnessAudit/1.0 (https://github.com/QuenumGerald/AIjolt)'
CATEGORIES = [
    'Videos of concerts', 'Videos of festivals', 'Videos of music performances',
    'Videos of dancing', 'Videos of cosplay', 'Videos of video games',
    'Videos of street performances',
]
ALLOWED_LICENSES = {'CC0', 'Public domain', 'PD', 'CC0 1.0'}
NOW = dt.datetime.now(dt.timezone.utc)

def fetch(category):
    query = {
        'action': 'query', 'generator': 'categorymembers',
        'gcmtitle': 'Category:' + category, 'gcmtype': 'file',
        'gcmsort': 'timestamp', 'gcmdir': 'desc', 'gcmlimit': 'max',
        'prop': 'imageinfo', 'iiprop': 'url|mime|size|extmetadata|timestamp',
        'format': 'json', 'formatversion': '2',
    }
    request = urllib.request.Request(API + '?' + urllib.parse.urlencode(query), headers={'User-Agent': UA})
    with urllib.request.urlopen(request, timeout=25) as response:
        return json.load(response)

results = {}
errors = []
for category in CATEGORIES:
    try:
        response = fetch(category)
        if 'error' in response:
            raise ValueError(str(response['error'])[:150])
        for page in response.get('query', {}).get('pages', []):
            info = (page.get('imageinfo') or [{}])[0]
            title = page.get('title', '')
            mime = info.get('mime', '')
            size = info.get('size', 0)
            if not mime.startswith('video/') or not (1_000_000 <= size <= 65_000_000):
                continue
            timestamp = info.get('timestamp', '')
            try:
                age = (NOW - dt.datetime.fromisoformat(timestamp.replace('Z', '+00:00'))).total_seconds() / 86400
            except ValueError:
                continue
            if not (0 <= age <= 30):
                continue
            license_name = info.get('extmetadata', {}).get('LicenseShortName', {}).get('value', '')
            if license_name not in ALLOWED_LICENSES:
                continue
            url = info.get('url', '')
            if not url.startswith('https://'):
                continue
            results[title] = {
                'title': title, 'category': category, 'uploaded_at': timestamp,
                'age_days': round(age, 1), 'license': license_name,
                'mime': mime, 'bytes': size, 'url': url,
            }
    except Exception as error:
        errors.append({'category': category, 'error': str(error)[:180]})
report = {
    'checked_at': NOW.isoformat(), 'window_days': 30,
    'categories_checked': len(CATEGORIES), 'eligible_recent_count': len(results),
    'eligible_recent': sorted(results.values(), key=lambda x: x['uploaded_at'], reverse=True)[:50],
    'errors': errors, 'queued': False, 'published': False,
    'note': 'Audit only: video reuse, topic relevance, and freshness must be verified before publishing.',
}
path = pathlib.Path('/opt/klieg/data/experiments/commons-freshness.json')
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print('commons recent candidates:', len(results), 'errors:', len(errors), 'report:', path)
