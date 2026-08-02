#!/usr/bin/env node
import { Command } from 'commander'; import { cleanup, collect, rescore, start } from './service.js'; import { publish } from './publisher.js';
const cli = new Command().name('aijolt').description('AI job collector and Buffer outbox');
cli.command('collect').action(collect); cli.command('score').action(rescore);
cli.command('publish').option('--dry-run', 'print without queueing').action((o: {dryRun?: boolean}) => publish(Boolean(o.dryRun)));
cli.command('cleanup').action(cleanup); cli.command('start').action(start);
await cli.parseAsync();
