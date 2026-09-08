import type Database from 'better-sqlite3';
import { config } from '../config.js';
import { db } from '../db.js';
import { createGmiDeepSeekClient, type LlmClient } from '../llm.js';
import { createGmiClient, type GmiClient } from '../gmi/client.js';
import { StoryPipeline, type PipelineDeps } from './pipeline.js';
import { StoryStore } from './store.js';

export function createStoryRuntime(overrides: Partial<PipelineDeps> & { db?: Database.Database } = {}) {
  const database = overrides.db ?? db;
  const store = new StoryStore(database);
  const dryRun = overrides.dryRun ?? config.dryRun;
  const llm: LlmClient = overrides.llm ?? createGmiDeepSeekClient({ dryRun });
  const gmi: GmiClient = overrides.gmi ?? createGmiClient({ dryRun });
  const pipeline = new StoryPipeline({ store, llm, gmi, dryRun });
  return { store, pipeline, llm, gmi, dryRun };
}
