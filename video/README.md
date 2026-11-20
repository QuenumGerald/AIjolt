# KLIEG : publications vidéo uniquement

Branche `feature/nouveau-projet-video-6f88`. Le bot reste isolé de Nox et MEVRIC : configuration, base SQLite, quotas et canal Buffer dédiés.

64 sources de découverte, dont 33 chaînes YouTube et 4 sites vidéo ajoutés : NBC News, TMZ, Entertainment Tonight et Euronews. Le filtre accepte également actualités, animaux, météo, sport, sciences et scènes insolites. Les rubriques vidéo de Variety, Deadline, Consequence et JoBlo complètent Moviefone et KinoCheck. Les flux texte servent seulement à repérer des médias ; un article sans fichier vidéo ne devient jamais publiable.

## Chemin de publication

- MP4/MOV public : fichier joint, sous réserve des limites connues de durée/taille, puis vérification HTTP du contenu avant l'appel Buffer.
- JW Player : résolution vers le fichier MP4 de préférence en 720p.
- YouTube : récupération avec `yt-dlp`, MP4 H.264 jusqu'à 720p, inspection locale avec `ffprobe`, hébergement sur votre domaine HTTPS, puis vérification publique du fichier. Aucun lien YouTube ou lien temporaire googlevideo n'est envoyé comme asset à Buffer.
- Playlist HLS non résolue, page de lecteur ou absence de vidéo : rejet. Aucun repli en publication texte.

Les anciennes lignes `ready` sont contrôlées à nouveau au moment de publier : un ancien drapeau `video_attach=1` ne suffit pas. Le pipeline ne comporte pas de champ ni de vérification automatisée de licence ; la disponibilité technique d’une vidéo ne signifie pas que sa republication est autorisée.

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

La publication réelle requiert `POPCULTURE_PUBLISH_ENABLED=true`, `POPCULTURE_DRY_RUN=false`, un token Buffer et un canal X dédié. Ne jamais réutiliser les canaux Nox/MEVRIC. Les posts affichent uniquement le titre et les hashtags, sans lien vers l’article ; la source demeure dans SQLite pour le suivi et l’anti-doublon.

## Nouveaux collecteurs vidéo

Les collecteurs exploitent les métadonnées des pages publiques pour associer chaque fichier à son propre titre, sa date et sa durée. Les objets publicitaires, directs, contenus non listés et vidéos dont la durée est absente ou dépasse 140 secondes sont exclus selon les métadonnées disponibles. La date et le format des pages peuvent changer ; une source en erreur est consignée, les autres continuent.

- NBC News `/video` : actualités, vidéo MP4 et durée provenant du même objet.
- TMZ `/watch/` : vidéos actualités et divertissement, avec URL MP4 et durée.
- Entertainment Tonight `/recent/video` : interviews et divertissement ; lors du test les éléments de la page étaient anciens et ne passaient pas le filtre de 36 h.
- Euronews `/video` : vidéo principale et ses métadonnées ; le fichier peut être servi en `binary/octet-stream`, vérifié par signature avant envoi à Buffer.

Un fichier direct accessible ne confirme pas l’autorisation de le republier ; Klieg n’effectue pas de vérification juridique ou contractuelle des vidéos. Les variations de publication, les doublons, la durée et l'accessibilité depuis server2 influent sur le nombre effectif de posts.

### Hébergement Klieg en production (server2)

Le dossier `/opt/klieg/data/popculture-media` est exposé **en lecture seule** dans Caddy sous `/srv/klieg-media`, via la route HTTPS `https://ops.al-kimo.com/klieg-media/`. Le bot n’écrit que dans son dossier local ; le proxy ne peut pas modifier les fichiers. Ce chemin est isolé du répertoire des exports des autres services. Les fichiers MP4 validés sont rendus lisibles par le serveur web (mode `0644`). Le mode automatique `POPCULTURE_PUBLISH_ENABLED=false` reste le défaut tant que l’accès YouTube depuis l’IP serveur n’est pas résolu ; les vidéos MP4 de sources officielles restent détectées même si YouTube exige une vérification anti-bot.

### Publication Klieg : cadence haute et hashtags (20 novembre 2026)

En production, le compte X Klieg utilise au maximum **48 publications sur toute période glissante de 24 heures**, avec **30 minutes au minimum entre deux tentatives**. Un service systemd dédié vérifie la file toutes les deux minutes et n'envoie qu'une seule vidéo native valide par cycle. La collecte RSS reste indépendante (toutes les 20 minutes). Ce rythme est un **plafond**, pas une garantie de 48 vidéos si le flux de vidéos admissibles est insuffisant. Le scheduler garde l'identifiant unique du canal Buffer Klieg et ne touche jamais à Nox/AIJOLT ni Mevric.

Chaque post contient **le titre original, un hashtag de sujet et `#Klieg`**, sans lien source affiché, par exemple `#Sports #Klieg`, `#MovieTrailer #Klieg`, `#Science #Klieg`, `#News #Klieg`. Si l'espace est insuffisant, seul `#Klieg` reste ; aucune troncature du titre, et aucun post de plus de 280 caractères. Les anciennes entrées `ready` sont reformattées au moment de l'envoi.

Le contrôle des licences a été retiré à la demande de l'utilisateur. La présence d'une URL MP4 techniquement valide ne garantit pas les droits de republication. La conservation des sources et liens d'origine est obligatoire. L'upload reste conditionné à la disponibilité HTTPS, au format vidéo supporté et aux quotas Buffer/X.

Depuis le 20 novembre 2026, **aucune URL source n’est ajoutée au texte X**, y compris pour les anciens éléments `ready` (reformatés à chaque envoi). Les URL source sont conservées en base pour la traçabilité, les contrôles techniques et la déduplication.

### Cadence temporaire du 20 novembre 2026

À la demande de l'utilisateur, `server2` teste **une vidéo par minute** jusqu'au **21 novembre 2026 à 00h00, heure de Paris** (2026-11-20T23:00:00Z). Le rythme temporaire se règle par `POPCULTURE_POST_SPACING_MINUTES=1` et `POPCULTURE_FAST_MODE_UNTIL_UTC=2026-11-20T23:00:00Z`. Le code refuse de conserver une cadence inférieure à 30 minutes passé cette échéance, même si le timer de retour arrière ne s'exécute pas. Le timer systemd `klieg-restore-spacing.timer` remet aussi explicitement `POPCULTURE_POST_SPACING_MINUTES=30` à l'échéance. La limite glissante de 48 publications par 24 heures, l'envoi d'une seule vidéo par cycle et le filtrage des fichiers MP4 restent inchangés.
