# AIJolt

AIJolt est un service **sans site web** en Node.js/TypeScript qui collecte des offres IA depuis les API publiques Greenhouse, Lever et Ashby, les classe dans SQLite et prépare des publications X/LinkedIn. Tout se pilote en CLI.

## État de la recherche API (2 août 2026)

Les URLs implémentées viennent des documentations officielles, jamais de pages HTML devinées :

| Source | API publique utilisée | Authentification |
|---|---|---|
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true` ([documentation](https://developers.greenhouse.io/job-board.html)) | aucune |
| Lever | `GET https://api.lever.co/v0/postings/{site}?mode=json` ([documentation officielle](https://github.com/lever/postings-api)) | aucune |
| Ashby | `GET https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true` ([documentation](https://developers.ashbyhq.com/docs/public-job-posting-api)) | aucune |

Buffer documente la création d'un premier post [ici](https://developers.buffer.com/guides/your-first-post.html), mais l'accès API et les possibilités du plan gratuit dépendent du compte. AIJolt **n'invente donc aucun endpoint** : si un adaptateur validé pour le compte n'est pas disponible, les posts sont ajoutés à `data/buffer-outbox.jsonl`. Cette file durable est le fallback immédiat ; on peut l'importer/traiter avec Buffer sans bloquer la collecte. Une ligne `queued` empêche toute double publication. `DRY_RUN=true` n'écrit même pas dans cette file.

> La consultation web automatisée des docs et du registre npm était bloquée par un proxy HTTP 403 dans l'environnement de développement. Les liens ci-dessus permettent de revérifier les contrats avant une mise en production. L'intégration Buffer reste volontairement en fallback plutôt que de risquer un endpoint obsolète.

## Installation

```bash
git clone <repo> && cd AIjolt
npm install
cp .env.example .env
npm run build
```

Node.js 20+ est requis. Configurez au moins une liste de slugs, par exemple `GREENHOUSE_BOARDS=openai`, `LEVER_SITES=example` ou `ASHBY_BOARDS=example`. Ces identifiants sont les segments visibles dans les pages carrières publiques.

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
npm run publish                 # respecte DRY_RUN ; sinon écrit le fallback Buffer
npm run cleanup                 # expire les offres anciennes/non revues
npm run start                   # collecte puis planificateur longue durée
npm test
```

Le score sur 100 favorise la fraîcheur (30), la pertinence IA (21), la qualité de description (15), le salaire (12), le remote (12) et le visa (10). Le filtre exige un intitulé IA explicite ou plusieurs signaux centraux dans la description. La déduplication combine URL canonique et entreprise+titre+localisation normalisés.

## Sécurité et limites

* laissez `DRY_RUN=true` jusqu'à validation humaine ;
* secrets uniquement dans `.env` (ignoré par Git) ;
* `MAX_POSTS_PER_DAY_X` et `MAX_POSTS_PER_DAY_LINKEDIN` bornent chaque réseau ;
* `BUFFER_QUEUE_RESERVE` est réservé à un futur adaptateur capable de lire la taille réelle de la file ; le fallback local ne prétend pas connaître cette taille ;
* requêtes limitées/concurrentes et trois retries exponentiels ;
* SQLite WAL, contraintes uniques par URL, identifiant ATS et publication/réseau ;
* une offre est expirée après 30 jours sans nouvelle observation ou 120 jours après publication ;
* `HTTPS_PROXY`/`CAPSOLVER_API_KEY` restent optionnels et inutilisés : ne contournez les protections d'un site qu'avec autorisation.

## Cron (alternative à `start`)

```cron
15 * * * * cd /opt/aijolt && /usr/bin/npm run collect >> logs/cron.log 2>&1
25 * * * * cd /opt/aijolt && /usr/bin/npm run score >> logs/cron.log 2>&1
0 */3 * * * cd /opt/aijolt && /usr/bin/npm run publish >> logs/cron.log 2>&1
30 2 * * * cd /opt/aijolt && /usr/bin/npm run cleanup >> logs/cron.log 2>&1
```

Créez `logs/` et protégez `.env` (`chmod 600 .env`). Ne faites pas tourner cron et `npm run start` simultanément.
