import { describe, expect, it } from 'vitest';
import { diversifyJobCandidates } from '../src/job-selection.js';

describe('diverse job selection', () => {
  it('still honors AI quality scores, but surfaces companies not recently featured', () => {
    const pool = [
      { company:'Anthropic', title:'AI Researcher', score:85 },
      { company:'Reddit', title:'Staff ML Engineer', score:82 },
      { company:'Scale AI', title:'Applied AI Engineer', score:68 },
      { company:'CoreWeave', title:'ML Engineer', score:66 },
    ];
    const recent = [
      ...Array.from({length:9},()=>({company:'Anthropic'})),
      ...Array.from({length:6},()=>({company:'Reddit'})),
    ];
    const ranked = diversifyJobCandidates(pool,recent);
    expect(ranked[0].company).toBe('Scale AI');
    expect(ranked.slice(0,3).map(j=>j.company)).toContain('CoreWeave');
    expect(ranked.at(-1)?.company).toBe('Anthropic');
    expect(pool[0].company).toBe('Anthropic'); // does not mutate inputs
    expect(ranked).toHaveLength(pool.length);
  });

  it('allows a strong job from a repeated company when it is still the best candidate', () => {
    const result=diversifyJobCandidates([
      {company:'Roblox',title:'Principal ML Engineer',score:95},
      {company:'Other',title:'ML Intern',score:55},
    ],[{company:'Roblox'}]);
    expect(result[0].company).toBe('Roblox');
  });

  it('normalizes company labels for recent-frequency ranking', () => {
    const result=diversifyJobCandidates([
      {company:'Reddit  ',score:70},
      {company:'Figma',score:69},
    ],[{company:'  reddit'}]);
    expect(result[0].company).toBe('Figma');
  });
});
