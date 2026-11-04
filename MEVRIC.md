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

Posts start with `NEWS 🚨`, the rewritten headline and a topical hashtag; **the article link is included in the visible post text**. If a feed provides an eligible video, it is preferred to its image; otherwise the collector tries an RSS image and then the article's social image. Buffer receives one media attachment when available. **Text-only publication remains permitted** when no usable media is available. The original article URL is retained internally for deduplication and traceability.

Image/video extraction does not grant republication rights. Obtain appropriate rights before publishing third-party media.

**Fast news:** Once enabled, the scheduler checks RSS every two minutes and uses Buffer `shareNow` for immediate delivery requests (actual X delivery depends on Buffer and X). It remains disabled in staging with `DRY_RUN=true`. Clearly labelled file/archive hero photos are rejected and fall back to text-only, but this is not full visual verification or proof of media reuse rights.

## Automation safety

When enabled the scheduler polls every 2 minutes, publishes only stories less than 24 hours old, and limits output to one post every 10 minutes. The Buffer `shareNow` request is used for rapid delivery; X may take longer to show the post. `MEVRIC_MEDIA_APPROVED=false` is the safe default: articles can still publish as NEWS text, but NPR images/videos are not attached without prior media rights and relevance approval.

## Buffer & X quota protection

The production scheduler is pinned to the `MevricNews` channel ID, never `Nox_alkimo`. Local hard stop: **90 attempted posts in any rolling 24-hour window**, with **at least 16 minutes between posting attempts**. The scheduler still polls and collects every two minutes and publishes at most one fresh article per permitted cycle. Attempts with ambiguous Buffer results still count toward limits. The Buffer organization reports two configured channels and a 5,000-scheduled-post capacity; that capacity is not a daily X allowance. Actual X/Buffer posting restrictions can be lower and may change. If Buffer reports a limit error, do not retry automatically; investigate before increasing volume.

The eligible news window is **24 hours** from the article publication timestamp, checked both in the scheduler and before creating each Buffer post. The 90-attempt rolling 24-hour cap, 16-minute spacing, single-post-per-cycle behavior, and duplicate protections are enforced.

## Link previews

Mevric now appends the original NPR article URL to every `NEWS 🚨` post. Buffer/X may generate a link preview (including the image when available), but the preview is controlled by X and not guaranteed. Third-party images/videos remain disabled for direct attachment until rights and relevance are verified.

### Variable post lengths

DeepSeek receives a deterministic per-story length target, with room reserved for the article URL, NEWS label, and hashtag. Updates can use one or two sentences when the headline supports them, otherwise they remain short. No invented facts are allowed.

## Adaptive headline labels

The first line is selected from the original NPR headline: `POLITICS`, `WORLD`, `ECONOMY`, `TECH`, `SPORTS`, `WEATHER`, `HEALTH`, `SCIENCE`, or `CULTURE` with a matching emoji. If none clearly matches, it uses `NEWS 📰`. This does not change the article link, the variable post length, daily quota, or publication schedule.

## Attention-grabbing headings (without false urgency)

Posts vary between a topical lead, `IN FOCUS 🔎`, `THE LATEST 🗞️`, or `ON THE RADAR 📡`, chosen consistently per story. `BREAKING 🚨` and `DEVELOPING 🔴` are reserved for explicit evidence in the NPR headline, not arbitrarily applied to regular stories. The headline and URL remain factual; no invented details or urgency.

## Multiple verified RSS publishers

Mevric monitors NPR (3 feeds), BBC News (World, Business, Technology), and ABC News (Top Stories, U.S. headlines). URLs are HTTPS and strictly publisher-domain checked, and tracking query parameters are removed. Identical normalized headlines across sources are ignored; URL deduplication still prevents reposts. Only NPR pages are scraped for social images; other sources are linked, not rehosted. The scheduler always refreshes RSS before checking for eligible unpublished stories, preventing the previous empty-queue stall.

Al Jazeera was removed at user request. Previously collected unpublished Al Jazeera stories are removed from the database; prior sent records are retained as posting history. The publisher allowlist in the scheduler and publish query provides defense in depth.

## Editorial quality and DeepSeek V4 Pro (2026-11-03)

Mevric uses `deepseek-v4-pro` by default (or `DEEPSEEK_MODEL` when explicitly set). The model receives only the original headline and character budget, not the news-publisher name. Publisher sign-offs such as "the BBC reports", "ABC News says", and "according to NPR" are removed from otherwise valid drafts; mid-sentence media credits and unexpected outlet mentions are rejected. Attribution of real news claims ("Kyiv says", "police say") remains, as does the original publisher's URL. A V4 Pro generation budget reserves enough tokens for the provider's reasoning; invalid / overlong outputs are never sent to Buffer. This model may cost more than the older `deepseek-chat` alias (which currently maps to `deepseek-flash`).

### Confirmed Buffer X quota handling (Nov 2026)

Buffer explicitly rejected new X posts after 100 scheduled within 24 hours. Mevric therefore targets at most 90 posts in any rolling 24-hour interval, not 200 attempts per UTC calendar day. The 16-minute minimum spacing distributes these posts through the day rather than creating a burst. The collector still runs every two minutes. A *definitive* Buffer GraphQL rejection matching the specific X 100-post limit returns the story to `new`; network timeouts and ambiguous Buffer responses stay `attempted` to prevent duplicate posts. Only articles still less than 24 hours old can be published on a later slot. This does not alter the separate AIJOLT channel or its settings.

## US-focused editorial selection (2026-11-04)

The publisher feeds remain NPR (3), BBC (3), and ABC News (2). Mevric keeps collecting every two minutes, with the **unchanged 90 attempts per rolling 24h** and **16-minute minimum spacing**. Before DeepSeek or Buffer is called, a deterministic, politically neutral editorial filter ranks original RSS titles: (1) U.S. politics and elections, (2) other high-impact U.S. news, then (3) major international events. It excludes explicitly minor crime, purely local-interest stories, irrelevant foreign routine news, recap/promotional clips (`WATCH:`/`LIVE:`), and near-duplicate headlines of events already attempted/published during the preceding 24h. Duplicate detection uses article URLs, significant shared title terms, and narrowly specified national election outcome keys; projections and confirmations are distinct. No media source or political party is preferred for its viewpoint. The published post text is still sourced from the original headline and has a linked article. The filter does **not** delete or relabel existing articles: excluded stories remain in the database but are not selected, so the daily publication count may be less than 90 when quality content is unavailable.
