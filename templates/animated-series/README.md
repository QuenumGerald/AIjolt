# Template série animée AIJolt

Kit prêt à remplir pour **un** projet animé (personnage fixe + épisodes).

## En 4 étapes

```bash
# Depuis la racine du repo
npm run story:init -- --name "Side Quest" --dir ./series/side-quest
```

1. **Édite** `character.json` (gueule, tenue verrouillée, interdits, companions, props).
2. **Dépose** tes planches PNG dans `refs/` et vérifie `referenceImagePaths`.
3. **Écris** un script dans `episodes/` (copie `episode.example.json`) — le script est l’entrée obligatoire.
4. **Lance** :

```bash
# pointe la bible du projet
export STORY_CHARACTER_CONFIG=./series/side-quest/character.json

npm run story:create -- --script ./series/side-quest/episodes/mon-ep.json --duration 0.5
npm run story:run -- --id <id>          # DRY_RUN=true d'abord
npm run story:approve -- --id <id>
npm run story:publish -- --id <id>
```

`story:init` peut aussi installer la bible dans `config/character.json` (`--apply`) pour ne pas toucher aux exports.

## Règles anti-dérive (déjà dans le pipeline)

- Tenue `outfitLocked` : le modèle ne change pas les vêtements.
- `forbiddenVisualTokens` : rejet avant Seedance.
- 1 scène script = 1 segment vidéo.
- Last frame + planches envoyées à Seedance.

## Fichiers

| Fichier | Rôle |
|---|---|
| `series.json` | Métadonnées série |
| `character.json` | Bible personnage |
| `refs/` | Images de référence |
| `episodes/*.json` | Scripts épisodes |
