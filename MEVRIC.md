# Mevric

Mevric is an automated English-language US news feed for X. It collects recent NPR RSS headlines, stores them in a separate SQLite database and schedules attributed posts through a dedicated Buffer channel. Posts contain the original headline, source and article URL. This initial version uses one publisher and does not independently verify or corroborate its reporting.

Node.js 20+ is required. Install dependencies with `npm ci`. The default commands run Mevric:

```sh
npm run collect
npm run publish -- --dry-run
npm start
```

On the managed cloud instance, Node 24 can use the configured proxy with `NODE_USE_ENV_PROXY=1`; keep the inherited proxy and CA settings. The scheduler collects and schedules at most one story every 30 minutes. It defaults to dry-run; set `DRY_RUN=false`, `BUFFER_ACCESS_TOKEN`, and `MEVRIC_BUFFER_CHANNEL_ID` in the environment to enable unattended Buffer scheduling. Connect the Mevric X account to its own Buffer channel. Keep credentials out of source control. `MEVRIC_DATABASE_PATH` overrides the default `data/mevric.db`; persist this file across restarts to retain deduplication history. A failed or ambiguous Buffer request remains marked attempted to prevent accidental duplicate posts; inspect Buffer and the SQLite record before manually retrying. Headlines over 280 characters including attribution and URL are skipped. The account, credentials, persistent hosting, and network access to `feeds.npr.org` and `api.buffer.com` must be configured separately.

When an RSS item provides an image or video (`media:content`, `media:thumbnail`, or a typed `enclosure`) on an NPR media domain, Mevric includes it in the post. Otherwise it schedules the text and source link alone. A dry run prints the media URL when present. Media are passed to Buffer as an image or video asset; Buffer must be able to retrieve the URL. Confirm media reuse rights and the Buffer/X integration before enabling live publication. The current media flow and live feeds have not been verified against the remote services in this environment.

## Candidate news sources

The source checker below tests eight public endpoints without publishing. They are candidates, not verified integrations: NPR (US and politics), ABC News (US), CBS News (US), The New York Times (US), BBC (US and Canada), USGS significant earthquake data, and National Weather Service active alerts. The two government feeds contain events or alerts, not editorial articles. Zero earthquake or weather events can be a valid response. The checker reports article counts, dates and media references for RSS, and event counts for GeoJSON. It does not establish rights to republish media, editorial reliability, or whether Mevric's current NPR-only parser can ingest another source. Confirm each source's terms before use.

```sh
python3 scripts/check-news-sources.py
```

On this managed cloud environment these endpoints returned proxy HTTP 403 on 2026-11-02; host additions have been saved in the environment configuration draft. Review, save and publish that configuration, then rerun the checker. Redirects may require further destination access. Only integrate sources after checking their actual responses, freshness, media and terms.
