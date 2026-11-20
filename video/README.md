# KLIEG : publications vidéo uniquement

Branche `feature/nouveau-projet-video-6f88`. Le bot reste isolé de Nox et MEVRIC : configuration, base SQLite, quotas et canal Buffer dédiés.

60 sources de découverte, dont 33 chaînes YouTube et 4 nouveaux flux éditoriaux ciblant la vidéo. Les rubriques vidéo de Variety, Deadline, Consequence et JoBlo complètent Moviefone et KinoCheck. Les flux texte servent seulement à repérer des médias ; un article sans fichier vidéo ne devient jamais publiable.

## Chemin de publication

- MP4/MOV public : fichier joint, sous réserve des limites connues de durée/taille, puis vérification HTTP du contenu avant l'appel Buffer.
- JW Player : résolution vers le fichier MP4 de préférence en 720p.
- YouTube : récupération avec `yt-dlp`, MP4 H.264 jusqu'à 720p, inspection locale avec `ffprobe`, hébergement sur votre domaine HTTPS, puis vérification publique du fichier. Aucun lien YouTube ou lien temporaire googlevideo n'est envoyé comme asset à Buffer.
- Playlist HLS non résolue, page de lecteur ou absence de vidéo : rejet. Aucun repli en publication texte.

Les anciennes lignes `ready` sont contrôlées à nouveau au moment de publier : un ancien drapeau `video_attach=1` ne suffit pas. Les droits restent enregistrés comme non confirmés ; cette modification n'ajoute pas de validation des droits.

## Installation du chemin YouTube

Installer `yt-dlp`, `ffmpeg` et `ffprobe` sur le serveur. Configurer :

```dotenv
POPCULTURE_MEDIA_DIRECTORY=/srv/aijolt/data/popculture-media
POPCULTURE_MEDIA_BASE_URL=https://media.votre-domaine.fr/
POPCULTURE_MAX_VIDEO_DOWNLOADS=8
```

Le serveur web doit servir **ce même répertoire** en HTTPS, avec GET et Range. Un exemple Caddy est fourni dans `video/Caddyfile.example`. Le bot ne configure pas le DNS ni le serveur web. Sans `POPCULTURE_MEDIA_BASE_URL`, les références YouTube restent rejetées, les MP4 déjà accessibles restent utilisables.

Budget : 6 collectes HTTP simultanées, 24 pages vidéo inspectées au maximum par collecte, 8 tentatives de téléchargement par défaut, au plus une tentative par URL toutes les 6 heures. Téléchargements limités à 120 secondes chacun ; refus des lives, fichiers dépassant 512 Mio ou vidéos hors 0,5–140 secondes. Pas de découpage automatique. Les fichiers générés sont conservés 7 jours, puis supprimés lors d'une collecte.

## Commandes

```bash
npm run build
node dist/cli.js pop doctor
node dist/cli.js pop collect
node dist/cli.js pop queue
node dist/cli.js pop publish --dry-run
```

La publication réelle requiert `POPCULTURE_PUBLISH_ENABLED=true`, `POPCULTURE_DRY_RUN=false`, un token Buffer et un canal X dédié. Ne jamais réutiliser les canaux Nox/MEVRIC. Les posts restent au format titre + URL, sans tiret séparateur ; les mots composés sont conservés.
