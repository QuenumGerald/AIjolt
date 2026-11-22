import { describe, expect, it } from 'vitest';
import { config, verifiedGreenhouseEmployers } from '../src/config.js';

describe('verified Greenhouse employer expansion', () => {
  it('provides at least 100 extra employer boards without duplicates', () => {
    expect(verifiedGreenhouseEmployers.length).toBeGreaterThanOrEqual(100);
    const ids = verifiedGreenhouseEmployers.map(entry => entry.split('|')[0].toLowerCase());
    expect(new Set(ids).size).toBe(ids.length);
    expect(config.boards.greenhouse.length).toBeGreaterThanOrEqual(100);
    expect(new Set(config.boards.greenhouse.map(board => board.id.toLowerCase())).size)
      .toBe(config.boards.greenhouse.length);
  });
  it('keeps the original configured boards first', () => {
    const configured = (process.env.GREENHOUSE_BOARDS ?? '').split(',').filter(Boolean);
    const ids = configured.map(entry => entry.split('|')[0].trim());
    expect(config.boards.greenhouse.slice(0, ids.length).map(board => board.id)).toEqual(ids);
  });
});
