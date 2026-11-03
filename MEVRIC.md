# Mevric

Mevric is an automated English-language US news feed for X. It collects recent NPR RSS headlines, stores them in a separate SQLite database and schedules attributed posts through a dedicated Buffer channel. DeepSeek rewrites the headline into a short, neutral English news sentence, using the headline as the only factual input. Mevric adds the NEWS label and up to two topic hashtags when space allows. The article HTML is fetched only when RSS omits media, to extract its social preview image; article text is not used for AI rewriting. This initial version uses one publisher and neither independently verifies the original story nor guarantees that a generated rewrite is accurate.

Node.js 20+ is required. Install dependencies with `npm ci`. The default commands run Mevric:

```sh
npm run collect
npm run publish -- --dry-run
npm start
```

On the managed cloud instance, Node 24 can use the configured proxy with `NODE_USE_ENV_PROXY=1`; keep the inherited proxy and CA settings. The scheduler collects and schedules at most one story every 2 minutes. Set `DEEPSEEK_API_KEY` for rewriting, including dry runs; `DEEPSEEK_MODEL` defaults to `deepseek-chat`. If rewriting fails or returns an invalid response, the story is not sent to Buffer. The scheduler defaults to dry-run; set `DRY_RUN=false`, `BUFFER_ACCESS_TOKEN`, and `MEVRIC_BUFFER_CHANNEL_ID` in the environment to enable unattended Buffer scheduling. Connect the Mevric X account to its own Buffer channel. Keep credentials out of source control. `MEVRIC_DATABASE_PATH` overrides the default `data/mevric.db`; persist this file across restarts to retain deduplication history. A failed or ambiguous Buffer request remains marked attempted to prevent accidental duplicate posts; inspect Buffer and the SQLite record before manually retrying. Posts over 280 characters including attribution and URL are skipped. The account, credentials, persistent hosting, and network access to `feeds.npr.org`, `api.deepseek.com` and `api.buffer.com` must be configured separately.

When an RSS item provides an image or video (`media:content`, `media:thumbnail`, or a typed `enclosure`) on an NPR media domain, Mevric includes it in the post. If RSS has no media, Mevric attempts to extract the primary `og:image` or `twitter:image` from the NPR article HTML (NPR-hosted URLs only); if unavailable it falls back to a text-and-link post. Article fetches are bounded, restricted to NPR, and do not follow redirects. A dry run prints the media URL when present. Media are passed to Buffer as an image or video asset; Buffer must be able to retrieve the URL. NPR image metadata is NOT a license to repost a photograph: confirm photographer and license or obtain reuse permission before enabling live publication. The staging deployment must remain in `DRY_RUN=true` until rights and Buffer/X media compatibility are checked. The current media flow and live feeds have not been verified against the remote services in this environment.

## Candidate news sources

The source checker below tests eight public endpoints without publishing. They are candidates, not verified integrations: NPR (US and politics), ABC News (US), CBS News (US), The New York Times (US), BBC (US and Canada), USGS significant earthquake data, and National Weather Service active alerts. The two government feeds contain events or alerts, not editorial articles. Zero earthquake or weather events can be a valid response. The checker reports article counts, dates and media references for RSS, and event counts for GeoJSON. It does not establish rights to republish media, editorial reliability, or whether Mevric's current NPR-only parser can ingest another source. Confirm each source's terms before use.

```sh
python3 scripts/check-news-sources.py
```

On this managed cloud environment these endpoints returned proxy HTTP 403 on 2026-11-02; host additions have been saved in the environment configuration draft. Review, save and publish that configuration, then rerun the checker. Redirects may require further destination access. Only integrate sources after checking their actual responses, freshness, media and terms.

## Publishing format

Posts start with `NEWS 🚨`, the rewritten headline and a topical hashtag; **the article link is not included in the visible text**. If a feed provides an eligible video, it is preferred to its image; otherwise the collector tries an RSS image and then the article's social image. Buffer receives one media attachment when available. **Text-only publication remains permitted** when no usable media is available. The original article URL is retained internally for deduplication and traceability.

Image/video extraction does not grant republication rights. Obtain appropriate rights before publishing third-party media.

**Fast news:** Once enabled, the scheduler checks RSS every two minutes and uses Buffer `shareNow` for immediate delivery requests (actual X delivery depends on Buffer and X). It remains disabled in staging with `DRY_RUN=true`. Clearly labelled file/archive hero photos are rejected and fall back to text-only, but this is not full visual verification or proof of media reuse rights.

## Automation safety

When enabled the scheduler polls every 2 minutes, publishes only stories at most 2 hours old, and limits output to one post every 10 minutes. The Buffer `shareNow` request is used for rapid delivery; X may take longer to show the post. `MEVRIC_MEDIA_APPROVED=false` is the safe default: articles can still publish as NEWS text, but NPR images/videos are not attached without prior media rights and relevance approval.

## Buffer & X quota protection

The production scheduler is pinned to the `MevricNews` channel ID, never `Nox_alkimo`. Local hard stops: **24 attempted posts per UTC day**, **4 per rolling hour**, and **1 per 10 minutes**. Attempts with ambiguous Buffer results still count toward limits. The Buffer organization reports two configured channels and a 5,000-scheduled-post capacity; that capacity is not a daily X allowance. Actual X/Buffer posting restrictions can be lower and may change. If Buffer reports a limit error, do not retry automatically; investigate before increasing volume.
