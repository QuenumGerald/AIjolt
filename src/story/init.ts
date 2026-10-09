import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type InitSeriesOptions = {
  name: string;
  dir: string;
  /** Also copy character.json → config/character.json and rewrite ref paths for repo root. */
  apply?: boolean;
  force?: boolean;
};

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'serie-animee';
}

export function defaultTemplateRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '../../templates/animated-series'),
    resolve(process.cwd(), 'templates/animated-series'),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'character.json'))) return candidate;
  }
  throw new Error('Template animated-series introuvable (templates/animated-series)');
}

export function initAnimatedSeries(options: InitSeriesOptions): {
  dir: string;
  slug: string;
  characterPath: string;
  appliedConfigPath?: string;
} {
  const templateRoot = defaultTemplateRoot();
  const slug = slugify(options.name);
  const target = resolve(options.dir);
  if (existsSync(target) && !options.force) {
    throw new Error(`Le dossier existe déjà: ${target} (passe --force pour écraser le template)`);
  }
  mkdirSync(dirname(target), { recursive: true });
  cpSync(templateRoot, target, { recursive: true });

  const seriesPath = join(target, 'series.json');
  const series = JSON.parse(readFileSync(seriesPath, 'utf8')) as {
    title: string;
    slug: string;
    notes?: string;
  };
  series.title = options.name.trim() || series.title;
  series.slug = slug;
  writeFileSync(seriesPath, `${JSON.stringify(series, null, 2)}\n`);

  const characterPath = join(target, 'character.json');
  const character = JSON.parse(readFileSync(characterPath, 'utf8')) as {
    name: string;
    referenceImagePaths: string[];
  };
  if (character.name === 'NomDuPerso') character.name = options.name.trim() || character.name;
  // Chemins relatifs à character.json (résolus au chargement).
  character.referenceImagePaths = ['./refs/face-sheet.png', './refs/full-body.png'];
  writeFileSync(characterPath, `${JSON.stringify(character, null, 2)}\n`);

  let appliedConfigPath: string | undefined;
  if (options.apply) {
    appliedConfigPath = resolve(process.cwd(), 'config/character.json');
    mkdirSync(dirname(appliedConfigPath), { recursive: true });
    const applied = {
      ...character,
      referenceImagePaths: [
        join(target, 'refs', 'face-sheet.png'),
        join(target, 'refs', 'full-body.png'),
      ],
    };
    writeFileSync(appliedConfigPath, `${JSON.stringify(applied, null, 2)}\n`);
  }

  return { dir: target, slug, characterPath, appliedConfigPath };
}
