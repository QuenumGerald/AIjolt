#!/usr/bin/env bash
# Gateway deploy: build Astro SSG and push to Cloudflare Pages — no GitHub Actions.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Export posted feed from local SQLite (Foorilla not required)"
npm run export-json

echo "==> Build site from data/posted-jobs.json"
npm run site:build

PROJECT="${CLOUDFLARE_PAGES_PROJECT:-aijolt}"
if command -v npx >/dev/null 2>&1; then
  echo "==> Deploy site/dist → Cloudflare Pages project '${PROJECT}' (wrangler)"
  npx --yes wrangler pages deploy "$ROOT/site/dist" --project-name "$PROJECT"
else
  echo "npx unavailable. Build is in site/dist — upload via Cloudflare dashboard or install wrangler."
  exit 1
fi
