import {it,expect} from 'vitest';
import {validateDecision} from '../src/popculture/editorial-ai.js';
it('validates editorial scores and caption limits',()=>{expect(validateDecision({score:80,caption:'A real event #Klieg',reason:'specific'}).score).toBe(80);expect(()=>validateDecision({score:101,caption:'x',reason:'x'})).toThrow();expect(()=>validateDecision({score:80,caption:'x'.repeat(281),reason:'x'})).toThrow();});
