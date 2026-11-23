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

### Plafond journalier désactivé à la demande de l'utilisateur (20 novembre 2026)

`POPCULTURE_MAX_POSTS_PER_DAY=0` signifie **aucun plafond quotidien au niveau du service Klieg**. La limitation des tentatives par cycle (une vidéo), l'espacement minimum (1 minute pendant l'essai, puis 30 minutes à partir du 21 novembre à minuit heure de Paris), les gardes contre les doublons et les refus techniques/quotas API Buffer/X restent applicables. Les références historiques à 48 posts/jour ci-dessus décrivent les anciennes valeurs, désormais remplacées par `0` sur `server2`. Ce changement ne lève aucune restriction propre à X ou Buffer.

### Correction épuisement de file, 21 novembre 2026

Les éléments de sources de plus de 140 secondes n'étaient jamais publiables sur X, même si leurs MP4 étaient disponibles. Le collecteur sait désormais **extraire les premières 138 secondes** des MP4 H.264/AAC publics dont la durée totale est entre 140 et 360 secondes, valider le fichier produit puis l'héberger sur le montage HTTPS dédié de Klieg ; ces clips sont de vrais extraits (pas de vidéos générées) et la source d'origine est conservée en SQLite. Le nombre de nouveaux extraits est borné par `POPCULTURE_MAX_DIRECT_CLIPS_PER_CYCLE` (par défaut 3) à chaque collecte, et les échecs bénéficient d'une temporisation de 2 heures. Le plafond de taille de 512 Mo, la validation HTTP, la déduplication et la règle de 30 minutes sont conservés. Les journaux `ready` indiquent désormais les **vrais éléments en attente dans SQLite** et non les éléments déjà publiés réapparaissant dans le flux.

### Montage vidéo automatique Klieg (21 novembre 2026)

L'éditeur `src/popculture/montage.ts` réalise le **montage FFmpeg du premier segment réel de la vidéo**, limité à **55 secondes** par défaut (configuration `POPCULTURE_MONTAGE_SECONDS`, maximum 60 s). Ce n'est pas encore une détection sémantique des meilleurs moments. Chaque rendu contient une vidéo H.264 **16:9, 720p / 24 fps**, un bandeau de titre pendant les premières 5,5 secondes (deux lignes maximum), le filigrane **KLIEG** en haut à droite, un fondu de sortie et la piste audio d'origine si elle existe, réencodée en AAC. Le titre complet et les hashtags restent dans le texte X ; le texte affiché en vidéo n'est **pas** une transcription de la parole. Aucune musique ou voix nouvelle n'est ajoutée.

Activer avec `POPCULTURE_MONTAGE_ENABLED=true` et `POPCULTURE_MONTAGE_SECONDS=55`. Lors de la publication, l'application valide l'URL de la vidéo native source, monte un MP4 local, contrôle à nouveau durée/codec/poids et exige que **le MP4 monté soit accessible via le HTTPS Klieg** avant de l'envoyer à Buffer. Les montages sont réutilisés en cas de répétition des tentatives, mais **un échec de montage empêche la publication brute** si le mode est actif. Les fichiers montés confirmés publiés par Buffer sont ensuite nettoyés en sécurité comme les autres médias hébergés.

### Montage multi-extraits basé sur les scènes (version 1)

Le mode `POPCULTURE_MONTAGE_HIGHLIGHTS_ENABLED=true` est un **opt-in distinct** du montage standard. Pour les sources de durée connue dépassant 55 secondes d'au moins huit secondes, FFmpeg échantillonne les images à 2 fps / 320 px pour repérer les changements de scène, puis choisit **trois extraits espacés sur la chronologie**, si la durée cible le permet. Il assemble ces extraits séquentiellement en conservant l'audio natif de chaque segment, avant d'appliquer le titre et le logo Klieg. En l'absence de scènes détectées, il répartit les segments temporellement ; si la source est courte, il conserve le montage chronologique classique. Les segments sont rendus **un à un** pour respecter la limite mémoire de 600 Mo du service. La détection est visuelle et temporelle : **elle n'analyse pas la signification des paroles, ne garantit pas les moments forts, et ne génère pas de sous-titres transcrits**. Le scan et les rendus sont bornés dans le temps ; en cas d'échec le montage est rejeté et la vidéo brute n'est pas publiée en remplacement.

### Ligne éditoriale Klieg : divertissement + viral (23 novembre 2026)

Klieg ne collecte plus les pages vidéo généralistes NBC News et Euronews. Chaque nouveau sujet doit avoir un signal explicite **dans son titre** : cinéma, séries, musique, célébrités, bandes-annonces, récompenses, gaming, mèmes ou tendances TikTok. Les simples adjectifs « amazing », « incredible » et « caught on camera » ne qualifient plus un sujet viral. Les actualités politiques, économiques, policières, météorologiques et les catastrophes sans rapport avec le divertissement sont rejetées. La même vérification est appliquée aux éléments anciens juste avant toute publication Buffer. Cette règle privilégie la cohérence éditoriale à la quantité de posts ; elle ne garantit pas une augmentation des vues ou des abonnements. Les anciens posts déjà transmis à Buffer ne sont pas supprimés automatiquement.
