# AIJolt

AIJolt transforme une note dictée en épisode fictionnel animé en 3D (format vertical 9:16, appelé ici « short »), avec narration française, puis prépare la publication via Buffer vers TikTok, Instagram et YouTube.

Parcours : texte dicté → script → voix TTS → génération vidéo GMI → assemblage MP4 → validation humaine → publication Buffer.

L’ancien collecteur d’offres IA et le pipeline d’actualité restent dans le dépôt, mais leurs collectes, scoring et publications automatiques sont **désactivés par défaut**. Les données existantes ne sont pas supprimées.

## Décisions figées

- animation 3D stylisée, personnage récurrent (sans obligation de ressemblance exacte) ;
- vidéos verticales 9:16, 720p (`STORY_RESOLUTION=720p`, `STORY_RATIO=9:16`) ;
- durées cibles : 2, 3 ou 5 minutes ; 30 secondes disponibles pour le pilote ;
- GMI Cloud pour la vidéo (`seedance-2-5-260628`) et le TTS (`minimax-tts-speech-2.8-hd`) ;
- Buffer pour la diffusion (pas d’API YouTube/TikTok/Instagram directe) ;
- serveur cible Contabo : 4 cœurs, 8 Go de RAM — FFmpeg local, génération IA distante.

## Installation

```bash
git clone <repo> && cd AIjolt
npm install
cp .env.example .env
cp config/character.example.json config/character.json
npm run build
```

Node.js 20+, FFmpeg et FFprobe sont requis. Utilisez **npm**, pas pnpm.

`DRY_RUN=true` par défaut : aucun appel payant (LLM, GMI, Buffer). Les fixtures locales simulent la voix et les segments.

## Configuration principale

Voir `.env.example`. Points critiques :

| Sujet | Variables |
|---|---|
| Sécurité | `DRY_RUN=true` jusqu’à validation |
| LLM script | `GMI_API_KEY`, `GMI_LLM_BASE_URL=https://api.gmi-serving.com/v1`, `GMI_LLM_MODEL=deepseek-ai/DeepSeek-V4-Flash-0731` |
| GMI | `GMI_API_KEY`, `GMI_API_BASE_URL=https://console.gmicloud.ai`, `GMI_VIDEO_MODEL`, `GMI_TTS_MODEL` |
| Voix | `GMI_TTS_VOICE_ID`, `GMI_TTS_LANGUAGE_BOOST=French` — pas de clonage automatique |
| Personnage | `STORY_CHARACTER_CONFIG`, `STORY_CHARACTER_REFERENCE_URLS` (URLs publiques) ou `STORY_CHARACTER_REFERENCE_PATHS` (fichiers locaux) |
| FFmpeg | `FFMPEG_PATH`, `FFPROBE_PATH`, `FFMPEG_CONCURRENCY=1`, `FFMPEG_THREADS=2` |
| Budget | Les tarifs ne sont pas requis pour exécuter le pipeline |
| Buffer | `BUFFER_ACCESS_TOKEN`, `BUFFER_TIKTOK_CHANNEL_ID`, `BUFFER_INSTAGRAM_CHANNEL_ID`, `BUFFER_YOUTUBE_CHANNEL_ID` |
| Média public | `STORY_MEDIA_PUBLIC_BASE_URL` ou `STORY_HOST_VIA_GMI_UPLOAD=true` |

Les tarifs ne sont pas nécessaires au fonctionnement du pipeline ; les coûts non calculés peuvent rester marqués `unknown`.

Aucune variable `YOUTUBE_CLIENT_*` n’est utilisée.

## De la note au MP4

```bash
# 1. Enregistrer une note (0.5, 2, 3 ou 5 minutes)
npm run story:create -- --note "J'ai raté le bus, et la ville a changé." --duration 3
# ou depuis un fichier dicté / collé :
npm run story:create -- --file ./notes/episode.txt --duration 2 --json

# 2. Optionnel : générer seulement le script, le relire, le modifier
npm run story:run -- --id 1 --pause-after-script --json
npm run story:script -- --id 1                 # affiche le JSON
npm run story:script -- --id 1 --file ./script.json

# 3. Pipeline complet jusqu'au MP4 (reprend les étapes manquantes)
npm run story:run -- --id 1 --json
npm run story:status -- --id 1 --json
npm run story:list -- --json
```

Les logs partent sur **stderr**. Avec `--json`, le résultat machine est sur **stdout**.

Par défaut, `story:run` enchaîne note → script → TTS → segments Seedance (4–15 s, assemblés automatiquement) → MP4 + SRT. Les segments ne se gèrent pas à la main.

`generate_audio` Seedance est forcé à `false` pour ne pas superposer une autre voix à la narration TTS.

Si une référence de personnage manque, le pipeline s’arrête clairement. Il ne crée pas de personnage tout seul.

## Approbation et Buffer

La publication exige l’approbation du MP4 courant.

```bash
npm run story:approve -- --id 1 --asset 42 --json
npm run story:publish -- --id 1 --destinations tiktok,instagram,youtube --json
```

Buffer n’a pas d’endpoint d’upload. Le MP4 doit être joignable en HTTPS public et stable jusqu’à la publication réelle ([Hosting media](https://developers.buffer.com/guides/hosting-media.html), [Create video post](https://developers.buffer.com/examples/create-video-post.html)).

Options d’hébergement, sans inventer d’API :

1. `STORY_MEDIA_PUBLIC_BASE_URL` si le VPS sert déjà `data/episodes/` ;
2. sinon `STORY_HOST_VIA_GMI_UPLOAD=true` utilise l’API documentée `POST /api/v1/ie/requestqueue/apikey/upload-url` (`file_type=mp4`).

Contraintes Buffer utilisées (source : [Sharing videos through Buffer](https://support.buffer.com/en-us/articles/sharing-videos-through-buffer-LOe2p2rnAI)) :

- TikTok : 3 s–10 min, 1 Go, MP4 ;
- Instagram Reels : 3 s–15 min, 300 Mo, MP4, 9:16 recommandé ;
- YouTube via Buffer : **Shorts jusqu’à 3 minutes** seulement.

Un épisode de 5 minutes est conservé intégralement ; YouTube est **bloqué** avec une explication, sans raccourcissement automatique et sans API YouTube de remplacement.

Chaque destination a son propre statut. Une file `pending` sans identifiant Buffer n’est pas resoumise (évite un doublon).

## Reprise

```bash
npm run story:retry -- --id 1 --json
```

- réutilise les assets `valid` ;
- si une requête GMI est déjà `queued`/`processing`, le programme **interroge** cet identifiant au lieu de relancer un appel payant ;
- un changement de script invalide narration, segments, MP4 et l’approbation précédente.

## Suivi des coûts

Le pipeline ne bloque pas sur les tarifs. Les coûts éventuellement calculés sont persistés comme `estimated`, `confirmed` ou `unknown`.

## Contabo (4 cœurs / 8 Go)

- aucun modèle vidéo local ;
- `GMI_VIDEO_CONCURRENCY=1`, `FFMPEG_CONCURRENCY=1`, `FFMPEG_THREADS=2` ;
- SQLite WAL déjà en place (`DATABASE_PATH`) ;
- assets dans `STORY_ASSETS_DIR` (défaut `./data/episodes`) ;
- ne pas lancer l’ancien `npm run start` d’offres en parallèle d’un gros assemblage.

```bash
npm run doctor
```

## Ancien pipeline offres / actualité

Toujours présent, **off** par défaut (`JOBS_PIPELINE_ENABLED=false`, `FOORILLA_ENABLED=false`, `AI_NEWS_ENABLED=false`). Le workflow GitHub Actions d’export `data/jobs.json` n’a pas été modifié ici ; désactivez-le dans GitHub si vous arrêtez le site d’offres.

Commandes historiques : `collect`, `score`, `publish`, `news`, `cleanup`, `export-json`.

## Tests

```bash
npm test
npm run build
```

Les tests d’intégration story utilisent FFmpeg local et des fournisseurs **simulés**. Ils ne valident pas un vrai compte GMI ou Buffer.
