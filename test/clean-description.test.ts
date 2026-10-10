import { describe, expect, it } from 'vitest';
import { cleanJobDescription } from '../src/clean-description.js';

describe('cleanJobDescription', () => {
  it('strips Foorilla UI JS and similar-jobs scrape noise', () => {
    const raw = [
      'AI Delivery Lead Tasks: * Align business requirements',
      '* Define AI delivery roadmaps Role(s): [Lead]',
      'Stats Feedback Views: 1 Clicks (apply): 0 Published: 2026-10-07 Language: pt ... Close {',
      " document.body.dispatchEvent( new CustomEvent('showToasts', {detail: [{message: 'Job link copied!'}]}) ) })\">",
      ' Copy link Save Apply Similar jobs Media Code Meet Work Insight AI Architect (M/F/D) - Porto',
    ].join(' ');

    const cleaned = cleanJobDescription(raw);
    expect(cleaned).toContain('Align business requirements');
    expect(cleaned).toContain('Define AI delivery roadmaps');
    expect(cleaned).not.toContain('document.body');
    expect(cleaned).not.toContain('showToasts');
    expect(cleaned).not.toContain('Similar jobs');
    expect(cleaned).not.toContain('Copy link');
    expect(cleaned).not.toContain('Stats Feedback');
  });

  it('strips HTML tags', () => {
    expect(cleanJobDescription('<p>Build <strong>RAG</strong> agents</p><script>alert(1)</script>')).toBe(
      'Build RAG agents',
    );
  });
});
