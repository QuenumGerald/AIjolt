import {it,expect} from 'vitest';import {engagement} from '../src/popculture/learning.js';
it('weights reposts and smooths small samples',()=>{expect(engagement({impressions:900,likes:10,reposts:5,replies:0})).toBe(.02);});
