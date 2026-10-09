import { logger } from './logger.js';

/** @Nox_alkimo is a jobs-only account; news/headline/commentary posts must not go out. */
export async function publishNews(_dryRunFlag = false): Promise<void> {
  logger.info('X is a jobs-only account; news, headlines, and commentary posts are disabled');
}
