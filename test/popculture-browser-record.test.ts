import { describe,it,expect } from 'vitest';
import { recordingAllowed } from '../src/popculture/browser-record.js';
describe('browser recording authorization',()=>{it('requires an exact explicitly authorized HTTPS host',()=>{expect(recordingAllowed('https://example.org/video','')).toBe(false);expect(recordingAllowed('https://example.org/video','example.org')).toBe(true);expect(recordingAllowed('https://example.org.evil.test/video','example.org')).toBe(false);expect(recordingAllowed('http://example.org/video','example.org')).toBe(false);});});
