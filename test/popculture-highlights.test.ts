import { describe,expect,it } from 'vitest';
import { chooseHighlightRanges,parseSceneCuts } from '../src/popculture/highlights.js';
import { popConfig } from '../src/popculture/config.js';

describe('Klieg highlight cut selection',()=>{
  it('parses real scene detection logs, ignores out of range and duplicate cuts',()=>{
    const log='[Parsed_showinfo_3] n:0 pts: 200 pts_time:4.2\n[Parsed_showinfo_3] n:1 pts:300 pts_time:4.2\n[Parsed_showinfo_3] n:2 pts:900 pts_time:28.1\n[Parsed_showinfo_3] n:3 pts:1000 pts_time:100.2';
    expect(parseSceneCuts(log,100)).toEqual([4.2,28.1]);
  });
  it('keeps short sources unchanged',()=>{
    expect(chooseHighlightRanges(25,55,[10])).toEqual([{start:0,duration:25}]);
    expect(chooseHighlightRanges(61,55,[10])).toEqual([{start:0,duration:55}]);
  });
  it('spreads 55 seconds across early, middle, and late sections',()=>{
    const ranges=chooseHighlightRanges(180,55,[4,61,123,160]);
    expect(ranges).toHaveLength(3);
    expect(ranges.map(r=>r.start)).toEqual([4,61,123]);
    expect(ranges.reduce((sum,r)=>sum+r.duration,0)).toBe(55);
    expect(ranges[0].start+ranges[0].duration).toBeLessThan(ranges[1].start);
    expect(ranges[1].start+ranges[1].duration).toBeLessThan(ranges[2].start);
    expect(ranges[2].start+ranges[2].duration).toBeLessThanOrEqual(180);
  });
  it('works when no scene changes are detected',()=>{
    const ranges=chooseHighlightRanges(140,45,[]);
    expect(ranges).toHaveLength(3);
    expect(ranges.reduce((sum,r)=>sum+r.duration,0)).toBe(45);
  });
  it('does not turn on automatically without a separate opt-in',()=>{
    expect(popConfig({POPCULTURE_MONTAGE_ENABLED:'true'}).montageHighlightsEnabled).toBe(false);
    expect(popConfig({POPCULTURE_MONTAGE_HIGHLIGHTS_ENABLED:'true'}).montageHighlightsEnabled).toBe(true);
  });
});

import { bestContinuousRange, parseMotion } from '../src/popculture/highlights.js';
it('selects the active continuous window rather than arbitrary timeline cuts',()=>{
 const signals=Array.from({length:60},(_,time)=>({time,motion:time>=30&&time<45?20:1}));
 expect(bestContinuousRange(60,15,signals)).toEqual({start:30,duration:15});
 expect(parseMotion('frame:0 pts:0 pts_time:0\nlavfi.signalstats.YDIF=4.2')).toEqual([{time:0,motion:4.2}]);
});
