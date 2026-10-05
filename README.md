# AIJolt

AIJolt collecte des offres IA depuis les API publiques Greenhouse, Lever et Ashby, les classe, exporte un flux JSON versionné et génère un site Astro statique. Tout se pilote en CLI et se déploie gratuitement via GitHub Actions + Cloudflare Pages.

Il possède aussi un pipeline X séparé et désactivé par défaut pour commenter l'actualité IA : découverte gratuite via Google News RSS et Hacker News, allowlist de sources, fenêtre de fraîcheur, score de buzz, dédoublonnage, génération sarcastique par DeepSeek et publication Buffer. Les quotas et l'historique de ce pipeline ne sont pas mélangés avec ceux des offres.

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

AIJolt sélectionne d'abord nativement le topic Foorilla `Data, AI, and Machine Learning`, puis les régions `Europe` et `North America`, avant de parcourir `FOORILLA_PAGES` pages (8 par défaut, soit environ 160 candidates réparties entre les deux régions). Les offres Foorilla déjà ciblées par ces filtres natifs ne passent plus par une recherche de mots-clés IA ou un second filtrage local de pays ; elles sont normalisées et dédoublonnées. Les autres sources ATS conservent leur filtre de pertinence et leur allowlist locale.

```env
FOORILLA_ENABLED=true
FOORILLA_PAGES=8
FOORILLA_BASE_URL=https://foorilla.com
# Topic natif Foorilla "Data, AI, and Machine Learning".
FOORILLA_TOPICS=101
# Les régions Europe et North America sont sélectionnées nativement avant la recherche.
# Laisser vide pour la liste de pays Europe/Amérique du Nord par défaut, ou fournir sa propre liste.
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
npm run news -- collect         # collecte l'actualité IA récente depuis les sources autorisées
npm run news -- publish --dry-run # génère les posts sarcastiques sans les publier
npm run news -- publish         # programme les posts d'actualité via Buffer
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
* `BUFFER_QUEUE_CAPACITY=0` : file scheduled **illimitée** (Buffer Essentials). Ce n’est **pas** un plafond de plan Buffer qui borne le volume quotidien. **Enlever `BUFFER_QUEUE_CAPACITY=10` sur le serveur** (ancien Free) ;
* `MAX_POSTS_PER_DAY_X=88` (2 jobs / 30 min) et `MAX_AI_NEWS_POSTS_PER_DAY_X=10` (1 news / 2 h) : total borné par `MAX_X_POSTS_PER_DAY=100`. C’est la **limite réseau X verified** que Buffer applique (daily network posting limit, 100/24 h). Avant la coche bleue c’était 50/24 h. Jobs majoritaires, news **sans** attendre que la file d’offres soit vide ;
* Buffer **API** Essentials (autre chose que le volume X) : **100 req GraphQL / 15 min** et **250 / 24 h**. 2 `createPost` jobs / 30 min + 1 news / 2 h. Sync statut **3 posts max**, au plus toutes les **3 h**. Écart **1,5 s** entre appels. `MAX_JOBS_PER_PUBLISH_CYCLE` reste borné à 2 pour éviter un burst de `dueAt` ;
* SQLite WAL, contraintes uniques par URL, identifiant ATS et publication/réseau ;
* une offre est expirée après 30 jours sans nouvelle observation ou 120 jours après publication ;
* `HTTPS_PROXY`/`CAPSOLVER_API_KEY` restent optionnels et inutilisés : ne contournez les protections d'un site qu'avec autorisation.

### Publication automatique Buffer

Lorsque `DRY_RUN=false`, AIJolt crée des posts Buffer en `schedulingType: automatic` et **`mode: customScheduled`** avec un `dueAt` toutes les 20 min. **Ne plus utiliser `addToQueue`** : ça consomme les créneaux du *posting schedule* UI (souvent 3–4 heures/jour → 3–4 posts envoyés, même si 100 sont en file).

Un 429 Buffer arrête le cycle et respecte `Retry-After` (pas de retry en boucle). Ne pas forcer un gros `sync-buffer` ni `MAX_JOBS_PER_PUBLISH_CYCLE>2` sur le serveur.

```bash
npm run doctor
npm run publish -- --dry-run
npm run publish
```

Chaque cycle `publish` (30 min) enfile **jusqu’à 2 annonces jobs** (~88/jour). `publishNews` (toutes les 2 h) enfile **1 news** jusqu’à 10/jour, même s’il reste des offres. Jobs + news ≤ `MAX_X_POSTS_PER_DAY=100` (limite X verified / Buffer daily network limit). File Essentials illimitée. Ne pas viser 20 posts/h.

### Ligne éditoriale AIJolt

Activez d'abord `AI_NEWS_ENABLED=true` tout en gardant `DRY_RUN=true`. Le moteur ne publie que des sujets de moins de `AI_NEWS_MAX_AGE_HOURS`, provenant d'un média ou domaine autorisé, et dont le score atteint `AI_NEWS_MIN_BUZZ_SCORE`. Hacker News sert de signal de vélocité ; une URL issue de Hacker News n'est éligible que si son domaine est dans l'allowlist.

La génération impose une structure simple : fait sérieux sourcé, cible claire, puis chute qui attaque la compétence, la hype ou l'hypocrisie. Elle refuse les hashtags, emojis, attaques contre des personnes privées et toute sortie de plus de 280 caractères. Aucun fallback générique n'est publié si DeepSeek échoue. La source reste enregistrée en base et apparaît dans les logs de dry-run ; `AI_NEWS_INCLUDE_SOURCE_URL=true` permet de l'ajouter au post.

Pour injecter manuellement un sujet repéré sur X, une URL source est obligatoire :

```bash
npm run news -- add --title "Confirmed headline" --url "https://source.example/story" --publisher "Publisher" --summary "Verified facts only"
npm run news -- publish --dry-run
```

## Cron (alternative à `start`)

```cron
15 * * * * cd /opt/aijolt && /usr/bin/npm run collect >> logs/cron.log 2>&1
25 * * * * cd /opt/aijolt && /usr/bin/npm run score >> logs/cron.log 2>&1
*/30 * * * * cd /opt/aijolt && /usr/bin/npm run publish >> logs/cron.log 2>&1
30 2 * * * cd /opt/aijolt && /usr/bin/npm run cleanup >> logs/cron.log 2>&1
```

Créez `logs/` et protégez `.env` (`chmod 600 .env`). Ne faites pas tourner cron et `npm run start` simultanément.
