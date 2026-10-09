# AGENTS.md

## Cursor Cloud specific instructions

AIJolt is a single product with two parts (see `README.md` for full details):

- **Root CLI collector** (TypeScript, run via `tsx`): fetches AI job listings from public ATS APIs (Greenhouse, Lever, Ashby) and Foorilla, filters/scores/dedupes them into SQLite, and exports a public feed to `data/jobs.json`. There is no long-running HTTP API server.
- **Astro static site** in `site/`: reads `data/jobs.json` and renders a French-language AI job board.

### Environment / setup

- Node.js 20+ is required (the VM has Node 22, which works).
- Dependencies live in two npm projects: the repo root and `site/`. The update script runs `npm install` in both. `better-sqlite3` is a native module compiled during install.
- Copy `.env.example` to `.env` before running the CLI (`cp .env.example .env`). `.env` is gitignored. Defaults are safe: `DRY_RUN=true` means Buffer publishing is never called and no Buffer/DeepSeek credentials are needed for local dev.

### Running / testing

- Build: `npm run build` (compiles TS to `dist/` and copies `schema.sql`).
- Tests: `npm test` (Vitest, unit tests only).
- CLI pipeline: `npm run doctor` (validates config), `npm run collect` → `npm run score` → `npm run export-json`. `npm run start` is a long-running scheduler.
- Site dev server: `npm run site:dev` serves the board on `http://localhost:4321` (Astro default port). `npm run site:build` builds the static site.

### Non-obvious gotchas

- `npm run collect` with the default `.env` uses only Foorilla discovery, whose AI filter is strict and often accepts 0 jobs. To get real listings for a demo, add ATS boards to `GREENHOUSE_BOARDS` in `.env`, e.g. `GREENHOUSE_BOARDS=anthropic|Anthropic,databricks|Databricks` (format is `slug|Display Name`). Then re-run collect/score/export.
- A single Foorilla collect run can take ~100s because it paginates and opens each posting; be patient and set generous timeouts.
- `npm run collect` rewrites `data/jobs.json` with live data. `data/jobs.json` IS tracked by git (it is explicitly un-ignored in `.gitignore`), so restore it with `git checkout -- data/jobs.json` after test collections if you don't intend to commit fresh live data.
- The Astro dev server generates a `site/.astro/` cache directory that is untracked and should not be committed.
- The site reads `data/jobs.json` at dev/build time, so re-running `export-json` requires restarting/refreshing the Astro dev server to pick up changes.
