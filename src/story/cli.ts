import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import { emit } from '../cli-output.js';
import { logger } from '../logger.js';
import { minutesToSeconds } from './store.js';
import { createStoryRuntime } from './runtime.js';
import { publishEpisode } from './publish.js';
import { snapshotSpend } from './budget.js';
import type { StoryDestination } from './types.js';
import { parseEpisodeScript } from './script.js';

function parseId(value: string | number | undefined): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error('--id must be a positive integer');
  return id;
}

function parseDestinations(raw?: string): StoryDestination[] | undefined {
  if (!raw) return undefined;
  const items = raw.split(',').map(item => item.trim().toLowerCase());
  const allowed = new Set(['tiktok', 'instagram', 'youtube']);
  for (const item of items) {
    if (!allowed.has(item)) throw new Error(`Destination inconnue: ${item}. Utilisez tiktok,instagram,youtube`);
  }
  return items as StoryDestination[];
}

function episodeView(store: ReturnType<typeof createStoryRuntime>['store'], id: number) {
  const episode = store.getEpisode(id);
  return {
    ...episode,
    tasks: store.listTasks(id),
    assets: store.listAssets(id, undefined, 'all').map(asset => ({
      id: asset.id,
      kind: asset.kind,
      status: asset.status,
      path: asset.path,
      durationMs: asset.durationMs,
      publicUrl: asset.publicUrl,
    })),
    publications: store.listPublications(id),
    spend: snapshotSpend(store, id),
  };
}

export function registerStoryCommands(cli: Command): void {
  const story = cli.command('story').description('pipeline d\'épisodes 3D verticaux et publication Buffer');
  const jsonOpt = (cmd: Command) => cmd.option('--json', 'écrire le résultat JSON sur stdout (logs sur stderr)');

  jsonOpt(story.command('create').description('enregistrer une note et une durée'))
    .option('--note <text>', 'texte dicté')
    .option('--file <path>', 'lire la note depuis un fichier texte')
    .requiredOption('--duration <minutes>', 'durée cible en minutes: 0.5, 2, 3 ou 5')
    .action((opts: { note?: string; file?: string; duration: string; json?: boolean }) => {
      const note = opts.note ?? (opts.file ? readFileSync(opts.file, 'utf8') : '');
      if (!note.trim()) throw new Error('Fournissez --note ou --file');
      const { store } = createStoryRuntime();
      const episode = store.createEpisode(note, minutesToSeconds(Number(opts.duration)));
      emit(Boolean(opts.json), episode, `Episode ${episode.id} créé (${episode.durationSeconds / 60} min, ${episode.status})`);
    });

  jsonOpt(story.command('run').description('exécuter ou reprendre le pipeline jusqu\'au MP4'))
    .requiredOption('--id <id>', 'identifiant d\'épisode')
    .option('--pause-after-script', 's\'arrêter après la génération du script')
    .action(async (opts: { id: string; pauseAfterScript?: boolean; json?: boolean }) => {
      const { pipeline, store, dryRun } = createStoryRuntime();
      logger.info(`story run episode ${opts.id} dryRun=${dryRun}`);
      const episode = await pipeline.run(parseId(opts.id), { pauseAfterScript: Boolean(opts.pauseAfterScript) });
      emit(Boolean(opts.json), episodeView(store, episode.id), `Episode ${episode.id}: ${episode.status}`);
    });

  jsonOpt(story.command('status').description('consulter l\'avancement et les erreurs'))
    .requiredOption('--id <id>')
    .action((opts: { id: string; json?: boolean }) => {
      const { store } = createStoryRuntime();
      const view = episodeView(store, parseId(opts.id));
      emit(Boolean(opts.json), view);
    });

  jsonOpt(story.command('list').description('lister les épisodes'))
    .action((opts: { json?: boolean }) => {
      const { store } = createStoryRuntime();
      const rows = store.listEpisodes().map(episode => ({ id: episode.id, title: episode.title, status: episode.status, durationSeconds: episode.durationSeconds, updatedAt: episode.updatedAt, error: episode.error }));
      emit(Boolean(opts.json), rows, rows.map(row => `${row.id}\t${row.status}\t${row.durationSeconds / 60}min\t${row.title ?? ''}`).join('\n') || '(aucun épisode)');
    });

  jsonOpt(story.command('retry').description('reprendre uniquement les étapes échouées'))
    .requiredOption('--id <id>')
    .action(async (opts: { id: string; json?: boolean }) => {
      const { pipeline, store } = createStoryRuntime();
      const episode = await pipeline.run(parseId(opts.id), { retryFailed: true });
      emit(Boolean(opts.json), episodeView(store, episode.id), `Episode ${episode.id}: ${episode.status}`);
    });

  jsonOpt(story.command('approve').description('approuver une version précise du MP4'))
    .requiredOption('--id <id>')
    .option('--asset <assetId>', 'identifiant de l\'asset MP4 (défaut: MP4 courant)')
    .action((opts: { id: string; asset?: string; json?: boolean }) => {
      const { store } = createStoryRuntime();
      const episode = store.getEpisode(parseId(opts.id));
      const assetId = opts.asset ? Number(opts.asset) : episode.outputMp4AssetId;
      if (!assetId) throw new Error('Aucun MP4 à approuver');
      const approved = store.approve(episode.id, assetId);
      emit(Boolean(opts.json), approved, `Episode ${approved.id} APPROVED (asset ${assetId})`);
    });

  jsonOpt(story.command('publish').description('envoyer l\'épisode approuvé vers Buffer'))
    .requiredOption('--id <id>')
    .option('--destinations <list>', 'tiktok,instagram,youtube')
    .action(async (opts: { id: string; destinations?: string; json?: boolean }) => {
      const runtime = createStoryRuntime();
      const results = await publishEpisode({
        store: runtime.store,
        gmi: runtime.gmi,
        episodeId: parseId(opts.id),
        destinations: parseDestinations(opts.destinations),
        dryRun: runtime.dryRun,
      });
      emit(Boolean(opts.json), results, results.map(item => `${item.destination}: ${item.status}${item.reason ? ` (${item.reason})` : ''}`).join('\n'));
    });

  jsonOpt(story.command('script').description('afficher ou remplacer le script JSON'))
    .requiredOption('--id <id>')
    .option('--file <path>', 'nouveau script JSON; invalide les assets dépendants')
    .action((opts: { id: string; file?: string; json?: boolean }) => {
      const { store } = createStoryRuntime();
      const id = parseId(opts.id);
      if (opts.file) {
        const script = parseEpisodeScript(readFileSync(opts.file, 'utf8'));
        const episode = store.saveScript(id, script);
        emit(Boolean(opts.json), episode, `Script mis à jour pour l'épisode ${id}; assets dépendants invalidés`);
        return;
      }
      const episode = store.getEpisode(id);
      emit(Boolean(opts.json), episode.script, episode.script ? JSON.stringify(episode.script, null, 2) : 'Pas encore de script');
    });
}
