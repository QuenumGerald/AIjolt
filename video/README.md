# KLIEG : publications vidéo uniquement

Branche `feature/nouveau-projet-video-6f88`. Le bot reste isolé de Nox et MEVRIC : configuration, base SQLite, quotas et canal Buffer dédiés.

64 sources de découverte, dont 33 chaînes YouTube et 4 sites vidéo ajoutés : NBC News, TMZ, Entertainment Tonight et Euronews. Le filtre accepte également actualités, animaux, météo, sport, sciences et scènes insolites. Les rubriques vidéo de Variety, Deadline, Consequence et JoBlo complètent Moviefone et KinoCheck. Les flux texte servent seulement à repérer des médias ; un article sans fichier vidéo ne devient jamais publiable.

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

Budget : 6 collectes HTTP simultanées, 24 pages vidéo inspectées au maximum par collecte, 8 tentatives de téléchargement par défaut, au plus une tentative par URL toutes les 6 heures. Téléchargements limités à 120 secondes chacun ; refus des lives, fichiers dépassant 512 Mio ou vidéos hors 0,5–140 secondes. Pas de découpage automatique. Les fichiers hébergés sont supprimés après confirmation par Buffer du statut publié, lors de la collecte ou du cycle de publication suivant. En cas d'erreur de statut ou de suppression, le fichier est conservé et la suppression est retentée.

## Cadence

Objectif : au moins 30 vidéos par 24 heures si suffisamment de vidéos éligibles sont disponibles. Le plafond par défaut est de 48 en 24 heures et l'espacement minimum est de 30 minutes. Une seule vidéo est envoyée par cycle. Programmer la publication toutes les 5 minutes pour que les légères variations de lancement ne fassent pas manquer un créneau de 30 minutes : les commandes `pop collect` et `pop publish` ne lancent pas de service permanent. Les paramètres déjà définis dans le `.env` du serveur restent prioritaires et doivent être mis à jour :

```dotenv
POPCULTURE_MAX_POSTS_PER_DAY=48
POPCULTURE_POST_SPACING_MINUTES=30
POPCULTURE_MAX_PER_CYCLE=1
```

Le résultat réel dépend des vidéos disponibles, de la durée de la collecte, de la fréquence d'exécution et de Buffer ; l'objectif ne garantit pas 30 publications. Contrôler régulièrement les publications confirmées.

## Commandes

```bash
npm run build
node dist/cli.js pop doctor
node dist/cli.js pop collect
node dist/cli.js pop queue
node dist/cli.js pop publish --dry-run
```

La publication réelle requiert `POPCULTURE_PUBLISH_ENABLED=true`, `POPCULTURE_DRY_RUN=false`, un token Buffer et un canal X dédié. Ne jamais réutiliser les canaux Nox/MEVRIC. Les posts restent au format titre + URL, sans tiret séparateur ; les mots composés sont conservés.

## Nouveaux collecteurs vidéo

Les collecteurs exploitent les métadonnées des pages publiques pour associer chaque fichier à son propre titre, sa date et sa durée. Les objets publicitaires, directs, contenus non listés et vidéos dont la durée est absente ou dépasse 140 secondes sont exclus selon les métadonnées disponibles. La date et le format des pages peuvent changer ; une source en erreur est consignée, les autres continuent.

- NBC News `/video` : actualités, vidéo MP4 et durée provenant du même objet.
- TMZ `/watch/` : vidéos actualités et divertissement, avec URL MP4 et durée.
- Entertainment Tonight `/recent/video` : interviews et divertissement ; lors du test les éléments de la page étaient anciens et ne passaient pas le filtre de 36 h.
- Euronews `/video` : vidéo principale et ses métadonnées ; le fichier peut être servi en `binary/octet-stream`, vérifié par signature avant envoi à Buffer.

Un fichier direct accessible ne confirme pas le droit de le republier : les droits de ces sources restent non confirmés. Les variations de publication, les doublons, la durée et l'accessibilité depuis server2 influent sur le nombre effectif de posts.
