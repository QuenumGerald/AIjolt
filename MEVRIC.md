# Mevric — current production configuration (November 19, 2026)

Mevric is an automated English-language news account publishing only to its dedicated Buffer X channel, **MevricNews** (`6aea10f0e29c69a1714d0a21`). It is deployed on `m365` in the `mevric-scheduler-1` Docker Compose service. The separate AIJOLT/Nox X channel and its scheduler are never affected.

## News sources, trust and freshness

Mevric collects official HTTPS RSS articles from NPR (three feeds), BBC (World/Business/Technology), ABC News (Top/U.S.), Fox News (U.S.), and CBS News (main). Publisher-specific domain allowlists, URL normalization, exact-headline deduplication, and cross-publisher event deduplication prevent duplicate or forged articles. Each RSS cycle polls at most every **10 seconds** for low-latency breaking-event discovery. Actual detection speed depends on RSS feeds, article availability and network latency; Mevric cannot guarantee being the first to report an event.

The editorial filter prioritizes serious **newly reported events in the United States** and important U.S. political, economic, technological and policy news; significant international events are also eligible. Local trivia, promotional clips, opinion/recap articles, minor crime and stale stories are filtered out. Ordinary news can be selected from the previous **eight hours**, with recency weighting; an urgent U.S. alert must have been published in the last **90 minutes**. Selected article pages must independently confirm a matching article headline before publishing; unverified stories are skipped, not guessed.

## Publication text — exact title, no AI rewrite

All ordinary X posts follow **exactly** this three-line format (source title unchanged):

```
Exact original article title
https://original-trusted-publisher.example/article
#News
```

When and only when the alert classifier identifies a **current serious U.S. incident** and the alert quota permits, add the prefix `ALERT 🚨` on a separate first line. The original title, trusted article URL and `#News` remain unchanged. The alert classifier requires a severe current incident (e.g. active shooting, major explosion, fatal crash, hurricane, widespread outage) plus U.S. geographic or national context. Older incidents, trials, drills, incidents abroad and ordinary political news do not qualify. At most **five alerts in a rolling 24 hours**. A current story still eligible for regular publication may post without `ALERT 🚨` if all five alert slots are used.

**No DeepSeek rewrite is invoked for production posts.** Posts are never truncated to squeeze under 280 characters; a post that cannot fit the original title, URL and `#News` is skipped. The original title may contain factual attribution by its publisher. Images are *not* automatically attached: `MEVRIC_MEDIA_APPROVED=false` remains in force; third-party rights and relevance need separate approval. X controls link preview availability.

## Pace and caps

- **Ordinary posts:** minimum **30 minutes** apart (at most 48 in an uninterrupted day); this targets approximately **40–50 total daily posts**, depending on the news supply, verification success and interruptions.
- **Urgent U.S. alerts:** take priority immediately after a **2-minute global safety gap**, without waiting for the next ordinary slot; up to **5 alert posts per rolling 24h**.
- **Overall hard stop:** **50 posting attempts in any rolling 24 hours**, including normal posts, alerts and ambiguous Buffer outcomes; this is below the 100-post limit previously confirmed by Buffer.
- A limit or a gap blocks posting only, never RSS collection. At most one post is published per scheduler cycle.

The scheduler rechecks both caps and the format before sending to Buffer using `shareNow`; Buffer/X propagation may add latency. Definitive Buffer X quota rejections restore an article to `new`, while ambiguous network failures remain `attempted` to prevent duplicate posts. Existing `attempted`/`queued` posts created under the old all-`ALERT` policy count conservatively against the new alert quota until they age beyond 24 hours. Status tracking and deduplication remain in the persistent SQLite database (`data/mevric.db`).

## Deployment and tests

The service runs from the local `mevric` Git branch. Compile with `npm run build`, run `npm test`, and restart only the Mevric scheduler via `docker compose -f compose.mevric.yaml --profile mevric restart scheduler`. Keep all `.env` credentials private and never commit local copies of `compose.mevric.yaml`, `.ssh`, or `data/`. Use `DRY_RUN=true` for previews and `DRY_RUN=false` only in the dedicated production container with the fixed MevricNews channel guard. The six `m365-admin-*` containers are unrelated and must not be restarted.
