# Sources testées le 20 novembre 2026 (Europe/Paris)

Les HTTP ont été exécutés depuis cet environnement. Une page qui « documente » un flux n’a pas été retenue sans réponse réelle.

Politique temporaire : toute vidéo HTTPS publique est attachée (YouTube, HLS, MP4). Les droits de republication restent **non confirmés**. Buffer n’a pas été appelé. Aucune publication native sur X n’a été testée.

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

## Vidéo native : ce qui a été vérifié

1. **Détectée** : oui (Moviefone HLS, KinoCheck/YouTube, JW MP4 après résolution).
2. **Fichier récupérable** : HEAD/Range sur `https://cdn.jwplayer.com/videos/fagviODW-iHvhYJ89.mp4` → HTTP 206, `video/mp4`, ~16 MB, magic `ftypM4V`, puis redirection CloudFront hashée.
3. **Droits confirmés** : non. Politique temporaire : on attache quand même.
4. **URL stable pour Buffer** : non testée. L’URL JW redirige ; Buffer exige une URL directe HTTPS encore lisible au moment de la publication.
5. **Publication native sur X** : non testée (pas de canal Buffer dédié, `POPCULTURE_PUBLISH_ENABLED=false`).

## Non retenues ou encore à confirmer

- Grammy / Recording Academy RSS : 404
- Oscars feed : 403
- Emmys RSS : 404
- Disney / Paramount / Warner / Universal / Sony pages presse : HTML, pas de RSS machine-readable
- Entertainment Weekly / People : HTTP 402
- Vulture : 404
- TMZ : 200 mais `pubDate` absent sur les items inspectés
- `https://kinocheck.com/ai/trailers/latest-en.json` : 404 (`latest.json` répond)

YouTube n’est **pas** un MP4 Buffer. Le bot l’attache quand même pour le moment ; Buffer peut échouer tant qu’on n’a pas un fichier hébergé.
