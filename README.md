# AIJolt

AIJolt collecte des offres IA depuis les API publiques Greenhouse, Lever et Ashby, les classe, exporte un flux JSON versionné et génère un site Astro statique. Tout se pilote en CLI et se déploie gratuitement via GitHub Actions + Cloudflare Pages.

## Architecture de lancement

* **Collecte** : GitHub Actions toutes les 3 heures ; SQLite reste le stockage de travail du job, puis `data/jobs.json` devient la source publique versionnée.
* **Site** : Astro dans `site/`, construit vers `site/dist` et déployé sur Cloudflare Pages (`<projet>.pages.dev`).
* **Réseaux** : Buffer Free reste optionnel ; les textes utilisent un fallback déterministe et DeepSeek si `DEEPSEEK_API_KEY` est configurée.
* **Coût cible** : 0 € hors éventuels dépassements/quotas des fournisseurs.

## État de la recherche API (2 août 2026)

Les URLs implémentées viennent des documentations officielles, jamais de pages HTML devinées :

| Source | API publique utilisée | Authentification |
|---|---|---|
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true` ([documentation](https://developers.greenhouse.io/job-board.html)) | aucune |
| Lever | `GET https://api.lever.co/v0/postings/{site}?mode=json` ([documentation officielle](https://github.com/lever/postings-api)) | aucune |
| Ashby | `GET https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true` ([documentation](https://developers.ashbyhq.com/docs/public-job-posting-api)) | aucune |

Buffer documente la création automatique de posts via son API GraphQL [ici](https://developers.buffer.com/guides/your-first-post.html). AIJolt utilise cet endpoint officiel avec `BUFFER_ACCESS_TOKEN` et les deux channel IDs. Une publication `queued` est conservée dans SQLite pour empêcher les doublons. `DRY_RUN=true` n'appelle pas Buffer.

> La consultation web automatisée des docs et du registre npm était bloquée par un proxy HTTP 403 dans l'environnement de développement. Les liens ci-dessus permettent de revérifier les contrats avant une mise en production. L'intégration Buffer reste volontairement en fallback plutôt que de risquer un endpoint obsolète.

## Installation

```bash
git clone <repo> && cd AIjolt
npm install
cp .env.example .env
npm run build
```

Node.js 20+ est requis. La découverte Foorilla est activée par défaut et récupère les nouvelles offres ; le filtre IA intégré élimine les postes non pertinents. Les listes `GREENHOUSE_BOARDS`, `LEVER_SITES` et `ASHBY_BOARDS` sont optionnelles et servent à ajouter des sources ATS directes. Leur format est `slug|Nom affiché` (la partie `|Nom affiché` est optionnelle).

### Découverte automatique Foorilla

AIJolt interroge les pages de recrutement Foorilla sans imposer de mot-clé, parcourt `FOORILLA_PAGES` pages, ouvre chaque fiche et laisse le filtre IA décider si l'annonce est pertinente. Les annonces sont ensuite limitées à l'Europe, aux États-Unis, au Canada, à l'Australie, à la Nouvelle-Zélande et à quelques marchés technologiques comparables ; la Chine et les localisations inconnues sont exclues par défaut.

```env
FOORILLA_ENABLED=true
FOORILLA_PAGES=3
FOORILLA_BASE_URL=https://foorilla.com
# Laisser vide pour la liste par défaut, ou fournir sa propre liste séparée par des virgules.
ALLOWED_COUNTRIES=
```

### Découverte avec blazerjobs

AIJolt est conçu pour être alimenté en identifiants par le CLI du paquet npm **blazerjobs**, sans serveur ni GUI. Installez/appelez la version disponible dans votre environnement :

```bash
npx blazerjobs --help
# recherchez les entreprises/boards, puis copiez les slugs ATS obtenus dans .env
```

`BLAZERJOBS_COMMAND` documente la commande choisie. Son contrat npm n'étant pas accessible dans cet environnement (403), AIJolt ne suppose pas de sous-commande non documentée et ne lance jamais arbitrairement une commande shell. SearXNG/DuckDuckGo peuvent servir à repérer des boards ; la collecte elle-même utilise prioritairement les JSON publics ATS. Playwright, proxies et CapSolver ne sont ni requis ni activés tant que ces APIs fonctionnent.

## Commandes

```bash
npm run collect                 # collecte, normalise, filtre et déduplique
npm run score                   # recalcule les scores
npm run publish -- --dry-run    # affiche les posts uniquement
npm run publish                 # respecte DRY_RUN ; sinon programme automatiquement via Buffer
npm run cleanup                 # expire les offres anciennes/non revues
npm run doctor                  # vérifie boards, SQLite, dry-run et channels
npm run export-json             # écrit le flux public dans data/jobs.json
npm run site:dev                # lance Astro en local
npm run site:build              # construit le site statique
npm run doctor                  # vérifie les sources, SQLite, dry-run et channels Buffer
npm run start                   # collecte puis planificateur longue durée
npm test
```

Le score sur 100 favorise la fraîcheur (30), la pertinence IA (21), la qualité de description (15), le salaire (12), le remote (12) et le visa (10). Le filtre exige un intitulé IA explicite ou plusieurs signaux centraux dans la description. La déduplication combine URL canonique et entreprise+titre+localisation normalisés.

## Sécurité et limites

* laissez `DRY_RUN=true` jusqu'à validation humaine ;
* secrets uniquement dans `.env` (ignoré par Git) ;
* `MAX_POSTS_PER_DAY_X` et `MAX_POSTS_PER_DAY_LINKEDIN` bornent chaque réseau ;
* `BUFFER_QUEUE_CAPACITY` et `BUFFER_QUEUE_RESERVE` empêchent AIJolt de remplir la capacité réservée à chaque réseau ;
* requêtes limitées/concurrentes et trois retries exponentiels ;
* SQLite WAL, contraintes uniques par URL, identifiant ATS et publication/réseau ;
* une offre est expirée après 30 jours sans nouvelle observation ou 120 jours après publication ;
* `HTTPS_PROXY`/`CAPSOLVER_API_KEY` restent optionnels et inutilisés : ne contournez les protections d'un site qu'avec autorisation.

### Publication automatique Buffer

Lorsque `DRY_RUN=false`, AIJolt appelle l'API GraphQL officielle de Buffer et ajoute chaque post à la file du channel correspondant. Il faut configurer `BUFFER_ACCESS_TOKEN`, `BUFFER_X_CHANNEL_ID` et `BUFFER_LINKEDIN_CHANNEL_ID`. Les identifiants Buffer sont conservés dans SQLite afin d'empêcher les doublons.

```bash
npm run doctor
npm run publish -- --dry-run
npm run publish
```

La limite quotidienne compte les états `queued` et `published`. Une publication programmée dans Buffer reste donc bloquante, ce qui privilégie l'absence de doublon à la quantité.

## Cron (alternative à `start`)

```cron
15 * * * * cd /opt/aijolt && /usr/bin/npm run collect >> logs/cron.log 2>&1
25 * * * * cd /opt/aijolt && /usr/bin/npm run score >> logs/cron.log 2>&1
0 */3 * * * cd /opt/aijolt && /usr/bin/npm run publish >> logs/cron.log 2>&1
30 2 * * * cd /opt/aijolt && /usr/bin/npm run cleanup >> logs/cron.log 2>&1
```

Créez `logs/` et protégez `.env` (`chmod 600 .env`). Ne faites pas tourner cron et `npm run start` simultanément.

## Content campaigns

AIJolt's content engine stores long-form, SEO-ready articles and their short social versions together. DeepSeek is required for generation; the engine deliberately has no generic fallback copy.

```bash
npx tsx src/cli.ts campaign:list
npx tsx src/cli.ts campaign:stats
npx tsx src/cli.ts campaign:generate --type INSIGHT
npx tsx src/cli.ts campaign:publish [id] [--dry-run]
```

Set `CONTENT_ENABLED`, `CONTENT_RATIO` (default `0.3`), and `DEFAULT_CAMPAIGN_WEIGHTS` to control the scheduler. `exportArticlesJson()` produces the static website feed. The site exposes readable `/articles` pages plus `/insights`, `/stats`, `/rss.xml`, and `/sitemap.xml` machine-readable endpoints.
