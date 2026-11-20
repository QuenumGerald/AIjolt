# Compte X pop culture (anglais)

Bot isolé de Nox et de MEVRIC. Configuration, SQLite (`data/popculture.db`), quotas et canal Buffer sont séparés. Les identifiants Nox / MEVRIC ne sont jamais des valeurs par défaut.

Politique vidéo temporaire : **toutes les vidéos HTTPS publiques détectées sont attachées**, y compris YouTube et HLS. Les droits de republication restent **non confirmés**.

## Commandes

```bash
npm run pop:doctor
npm run pop:collect
npm run pop:queue
npm run pop:publish
```

`pop:publish` ne parle à Buffer que si `POPCULTURE_PUBLISH_ENABLED=true`, `POPCULTURE_DRY_RUN=false` et `POPCULTURE_BUFFER_X_CHANNEL_ID` est un canal dédié.

## Variables

Copier le bloc `POPCULTURE_*` de `.env.example`. Ne jamais y coller le canal MevricNews `6aea10f0e29c69a1714d0a21` ni `BUFFER_X_CHANNEL_ID` de Nox.
