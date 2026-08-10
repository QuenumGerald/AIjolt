#!/usr/bin/env node
import { Command } from 'commander'; import { cleanup, collect, rescore, start } from './service.js'; import { publish, syncBufferPublications } from './publisher.js';
import { acknowledgeOutbox, failOutbox, listOutbox } from './outbox.js';
import { doctor } from './doctor.js';
import { exportJobsJson } from './export-json.js';
import { addNewsItem, collectNews } from './news.js';
import { publishNews } from './news-publisher.js';
const cli = new Command().name('aijolt').description('AI job collector and Buffer outbox');
cli.command('collect').action(collect); cli.command('score').action(rescore);
cli.command('publish').option('--dry-run', 'print without queueing').action((o: {dryRun?: boolean}) => publish(Boolean(o.dryRun)));
cli.command('sync-buffer').description('synchronize queued publication statuses with Buffer').action(async () => { await syncBufferPublications(); });
cli.command('cleanup').action(cleanup); cli.command('start').action(start);
cli.command('doctor').description('validate runtime configuration and SQLite').action(doctor);
cli.command('export-json').description('export active jobs to the public JSON feed').action(() => exportJobsJson());
const news = cli.command('news').description('collect and publish sourced AI-news satire');
news.command('collect').action(collectNews);
news.command('publish').option('--dry-run', 'generate and print without queueing').action((o: { dryRun?: boolean }) => publishNews(Boolean(o.dryRun)));
news.command('add')
  .requiredOption('--title <title>').requiredOption('--url <url>').requiredOption('--publisher <publisher>')
  .option('--summary <summary>', '').option('--buzz <score>', 'priority score', '100').option('--published-at <date>')
  .action((o: { title: string; url: string; publisher: string; summary?: string; buzz: string; publishedAt?: string }) => addNewsItem({ title: o.title, url: o.url, publisher: o.publisher, summary: o.summary ?? '', buzzScore: Number(o.buzz), publishedAt: o.publishedAt }));
const outbox = cli.command('outbox').description('manage posts handed to the Buffer fallback');
outbox.command('list').action(listOutbox);
outbox.command('ack <job-id> <network> [provider-id]').action((jobId: string, network: 'x'|'linkedin', providerId?: string) => acknowledgeOutbox(Number(jobId), network, providerId));
outbox.command('fail <job-id> <network> <reason>').action((jobId: string, network: 'x'|'linkedin', reason: string) => failOutbox(Number(jobId), network, reason));
await cli.parseAsync();
