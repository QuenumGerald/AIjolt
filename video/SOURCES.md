# Sources vidéo : vérifications du 20 novembre 2026

60 sources de découverte configurées. Un flux vidéo fonctionnel ne prouve pas qu'un fichier est téléchargeable ni publiable sur X. La mise en file `ready` exige un fichier natif ; l'appel Buffer exige en plus une réponse publique MP4/MOV vérifiée. Publication réelle sur X non testée dans cette modification.

## Chaînes vidéo : 33 flux Atom vérifiés

Les identifiants ont été lus sur les pages de chaînes, puis chaque URL ci-dessous a retourné HTTP 200 avec 15 entrées. Aucun identifiant n'a été reconstitué. Les flux livrent des références YouTube, **pas des MP4** ; le chemin yt-dlp + hébergement HTTPS est nécessaire.

| Chaîne | Flux vérifié |
|---|---|
| Warner Bros. Pictures | https://www.youtube.com/feeds/videos.xml?channel_id=UCjmJDM5pRKbUlVIzDYYWb6g |
| Netflix | https://www.youtube.com/feeds/videos.xml?channel_id=UCWOA1ZGywLbqmigxE4Qlvuw |
| Marvel | https://www.youtube.com/feeds/videos.xml?channel_id=UCvC4D8onUfXzvjTOM-dBfEA |
| UniversalPictures | https://www.youtube.com/feeds/videos.xml?channel_id=UCq0OueAsdxH6b8nyAspwViw |
| ParamountPictures | https://www.youtube.com/feeds/videos.xml?channel_id=UCF9imwPMSGz4Vq1NiTWCC7g |
| SonyPictures | https://www.youtube.com/feeds/videos.xml?channel_id=UCz97F7dMxBNOfGYu3rx8aCw |
| A24 | https://www.youtube.com/feeds/videos.xml?channel_id=UCuPivVjnfNo4mb3Oog_frZg |
| LionsgateMovies | https://www.youtube.com/feeds/videos.xml?channel_id=UCJ6nMHaJPZvsJ-HmUmj1SeA |
| SearchlightPictures | https://www.youtube.com/feeds/videos.xml?channel_id=UCor9rW6PgxSQ9vUPWQdnaYQ |
| FocusFeatures | https://www.youtube.com/feeds/videos.xml?channel_id=UCU4SM3j_9TNWaSu8KdGV50g |
| AmazonMGMStudios | https://www.youtube.com/feeds/videos.xml?channel_id=UCf5CjDJvsFvtVIhkfmKAwAA |
| AppleTV | https://www.youtube.com/feeds/videos.xml?channel_id=UC1Myj674wRVXB9I4c6Hm5zA |
| HBO | https://www.youtube.com/feeds/videos.xml?channel_id=UCVTQuK2CaWaTgSsoNkn5AiQ |
| Max | https://www.youtube.com/feeds/videos.xml?channel_id=UCQIRM93QxhQ4pGm0cxuCXDw |
| Hulu | https://www.youtube.com/feeds/videos.xml?channel_id=UCE5mQnNl8Q4H2qcv4ikaXeA |
| disneyplus | https://www.youtube.com/feeds/videos.xml?channel_id=UCIrgJInjLS2BhlHOMDW7v0g |
| Peacock | https://www.youtube.com/feeds/videos.xml?channel_id=UCPgMAS8woHJ_o_OZdTR7kcQ |
| NetflixAnime | https://www.youtube.com/feeds/videos.xml?channel_id=UCBSs9x2KzSLhyyA9IKyt4YA |
| Crunchyroll | https://www.youtube.com/feeds/videos.xml?channel_id=UC6pGDc4bFGD1_36IKv3FnYg |
| RottenTomatoesTRAILERS | https://www.youtube.com/feeds/videos.xml?channel_id=UCi8e0iOVk1fEOogdfu4YgfA |
| IGNMovieTrailers | https://www.youtube.com/feeds/videos.xml?channel_id=UCWJ5MfdQZ6jXbF5gYuSAf5Q |
| FilmSelectTrailer | https://www.youtube.com/feeds/videos.xml?channel_id=UCOlBfHN6TkmBVzZ_lkzcKwQ |
| KinoCheck | https://www.youtube.com/feeds/videos.xml?channel_id=UCOL10n-as9dXO2qtjjFUQbQ |
| Billboard | https://www.youtube.com/feeds/videos.xml?channel_id=UCsVcseUYbYjldc-XgcsiEbg |
| RollingStone | https://www.youtube.com/feeds/videos.xml?channel_id=UC-JblcinswY50lrUdSaRNEg |
| NPRMusic | https://www.youtube.com/feeds/videos.xml?channel_id=UC4eYXhJI4-7wSWc8UNRwD4A |
| COLORSxSTUDIOS | https://www.youtube.com/feeds/videos.xml?channel_id=UC2Qw1dzXDBAZPwS7zm37g8g |
| BBCRadio1VEVO | https://www.youtube.com/feeds/videos.xml?channel_id=UCKoafhJ9dkAWaEvlXCiBBwA |
| MTV | https://www.youtube.com/feeds/videos.xml?channel_id=UCxAICW_LdkfFYwTqTHHE0vg |
| Oscars | https://www.youtube.com/feeds/videos.xml?channel_id=UCb-vZWBeWA5Q2818JmmJiqQ |
| BAFTA | https://www.youtube.com/feeds/videos.xml?channel_id=UCtggghgcffr7-OSjiRXRM3Q |
| EntertainmentTonight | https://www.youtube.com/feeds/videos.xml?channel_id=UCdtXPiqI2cLorKaPrfpKc4g |
| Variety | https://www.youtube.com/feeds/videos.xml?channel_id=UCgRQHK8Ttr1j9xCEpCAlgbQ |

## Nouveaux flux éditoriaux dédiés à la vidéo

| Source | URL | Résultat observé |
|---|---|---|
| Variety vidéo | https://variety.com/v/video/feed/ | HTTP 200, 10 items |
| Deadline vidéo | https://deadline.com/video/feed/ | HTTP 200, 12 items |
| Consequence vidéo | https://consequence.net/video/feed/ | HTTP 200, 15 items |
| JoBlo trailers | https://www.joblo.com/category/movie-trailers/feed/ | HTTP 200, 30 items |

Ces RSS ne contiennent pas directement le fichier vidéo dans les items inspectés. Le collecteur inspecte les pages liées pour extraire les VideoObject JSON-LD et les iframes YouTube explicites. Les MP4 de fond de page sont ignorés. Exemple observé : la page vidéo Consequence de Darryl McDaniels déclare un VideoObject HLS ; sans résolution MP4, cet item reste rejeté.

Non ajoutés : flux Billboard/THR `/video/feed/` (404), flux `/c/video/feed/` (vides), NME music-video (403), Collider et ScreenRant (502), Entertainment Tonight `/recent/video/rss` (HTML sans items RSS). Les chaînes YouTube vérifiées ci-dessus offrent des entrées vidéo pour plusieurs de ces éditeurs.

## Sources déjà présentes

## Retenues pour détecter l’information

| Source | URL | Accès | Date | Vidéo observée |
|---|---|---|---|---|
| Variety | `https://variety.com/feed/` | RSS 200 | oui, récente | images seulement |
| Deadline | `https://deadline.com/feed/` | RSS 200 | oui, récente | images seulement |
| Hollywood Reporter | `https://www.hollywoodreporter.com/feed/` | RSS 200 | oui, récente | pas de fichier vidéo |
| Billboard | `https://www.billboard.com/feed/` | RSS 200 | oui, récente | pas de fichier vidéo |
| Rolling Stone music / film | feeds `/music/music-news/feed/` et `/tv-movies/tv-movie-news/feed/` | RSS 200 | oui | pas de fichier vidéo |
| Pitchfork news | `https://pitchfork.com/rss/news/` | RSS 200 | oui | pas de fichier vidéo |
| BBC Entertainment | `https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml` | RSS 200 | oui | pas de fichier vidéo |
| NPR Music | `https://feeds.npr.org/1039/rss.xml` | RSS 200 | oui | pas de fichier vidéo |
| Guardian film / music / TV | `/film/rss`, `/music/rss`, `/tv-and-radio/rss` | RSS 200 | oui | pas de MP4 |
| IndieWire, NME, The Wrap, Consequence | feeds officiels | RSS 200 | oui | pas de MP4 |
| Netflix press | `https://about.netflix.com/en/feed.xml` | RSS 200 | `20 November 2026` (jour, pas d’heure) | pas de média |
| Golden Globes | `https://goldenglobes.com/feed/` | RSS 200 | articles trop vieux pour 36 h | n/a |
| Moviefone news | `https://www.moviefone.com/feeds/news.json` | JSON Feed 200 | oui | images |
| Moviefone trailers / interviews | `.../trailers.json`, `.../interviews.json` | JSON Feed 200 | oui | HLS JW Player + MP4 progressif via `cdn.jwplayer.com/v2/media/{id}` |
| KinoCheck API | `https://api.kinocheck.com/trailers/latest?language=en` | JSON 200, quota documenté 1000 req/j | `published` ISO | `youtube_video_id` seulement, pas de MP4 |
| YouTube Netflix, Marvel, Warner Bros. Pictures, Universal, Paramount | Atom `feeds/videos.xml?channel_id=` | 200 | oui | pages YouTube, pas de fichier |

## Vérification de la collecte et des fichiers natifs

Une collecte avec base de test isolée et sans téléchargement YouTube activé a retourné 363 éléments et 6 lignes publiables. Les 6 fichiers Moviefone ont passé la vérification HTTPS, type de contenu, taille et signature MP4. Aucun appel de publication Buffer n’a été exécuté. Le téléchargement YouTube avec yt-dlp et l’hébergement public restent à valider sur le serveur cible.
