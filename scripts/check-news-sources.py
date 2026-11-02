#!/usr/bin/env python3
"""Read-only availability check for candidate Mevric sources."""
import concurrent.futures
import datetime as dt
import email.utils
import json
import urllib.request
import xml.etree.ElementTree as ET

SOURCES = [
    ('NPR — national', 'rss', 'https://feeds.npr.org/1003/rss.xml'),
    ('NPR — politics', 'rss', 'https://feeds.npr.org/1014/rss.xml'),
    ('ABC News — US', 'rss', 'https://abcnews.go.com/abcnews/usheadlines'),
    ('CBS News — US', 'rss', 'https://www.cbsnews.com/latest/rss/us'),
    ('NY Times — US', 'rss', 'https://rss.nytimes.com/services/xml/rss/nyt/US.xml'),
    ('BBC — US & Canada', 'rss', 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml'),
    ('USGS — significant earthquakes', 'geojson', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_day.geojson'),
    ('National Weather Service — alerts', 'geojson', 'https://api.weather.gov/alerts/active?status=actual'),
]


def local(tag):
    return tag.rsplit('}', 1)[-1].lower()


def inspect_rss(data):
    root = ET.fromstring(data)
    items = [element for element in root.iter() if local(element.tag) in ('item', 'entry')]
    now = dt.datetime.now(dt.timezone.utc)
    recent = dated = media = 0
    for item in items:
        for child in item:
            if local(child.tag) in ('pubdate', 'published', 'updated', 'date') and child.text:
                try:
                    try:
                        stamp = email.utils.parsedate_to_datetime(child.text.strip())
                    except (ValueError, TypeError):
                        stamp = dt.datetime.fromisoformat(child.text.strip().replace('Z', '+00:00'))
                    if stamp.tzinfo is None:
                        stamp = stamp.replace(tzinfo=dt.timezone.utc)
                    dated += 1
                    if dt.timedelta(0) <= now - stamp <= dt.timedelta(hours=24):
                        recent += 1
                except (ValueError, TypeError, OverflowError):
                    pass
                break
        for element in item.iter():
            kind = local(element.tag)
            mime = element.attrib.get('type', '')
            if (kind in ('content', 'thumbnail') and element.tag.startswith('{http://search.yahoo.com/mrss/')) or (kind == 'enclosure' and (mime.startswith('image/') or mime.startswith('video/'))):
                if element.attrib.get('url'):
                    media += 1
                    break
    return f'{len(items)} articles, {dated} dated, {recent} in the last 24h, {media} with media references', bool(items)


def check(source):
    name, kind, url = source
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mevric source research/1.0 (contact: newsroom administrator)', 'Accept': 'application/rss+xml, application/xml, application/geo+json, application/json;q=0.9, */*;q=0.1'})
        with urllib.request.urlopen(req, timeout=15) as response:
            data = response.read(5_000_001)
            if len(data) > 5_000_000:
                raise ValueError('response exceeds 5 MB')
            if kind == 'rss':
                summary, ok = inspect_rss(data)
            else:
                payload = json.loads(data)
                if payload.get('type') != 'FeatureCollection' or not isinstance(payload.get('features'), list):
                    raise ValueError('expected GeoJSON FeatureCollection')
                summary, ok = f"{len(payload['features'])} current features", True
            return name, f'HTTP {response.status}; {summary}', ok
    except Exception as error:
        return name, f'ERROR {type(error).__name__}: {error}', False


def main():
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(SOURCES)) as pool:
        results = list(pool.map(check, SOURCES))
    for name, result, _ in results:
        print(f'{name}: {result}')
    if not any(ok for _, _, ok in results):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
