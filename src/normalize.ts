import { analyzeAI } from './ai.js'; import type { Job, RawJob, WorkMode } from './types.js';
const strip = (s = '') => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#39;|&amp;/g, ' ').replace(/\s+/g, ' ').trim();
const countryAliases = new Map<string, string>([
  ['united states','United States'], ['united states of america','United States'], ['usa','United States'], ['us','United States'],
  ['united kingdom','United Kingdom'], ['uk','United Kingdom'], ['gb','United Kingdom'],
  ['albania','Albania'], ['al','Albania'], ['andorra','Andorra'], ['ad','Andorra'],
  ['austria','Austria'], ['at','Austria'], ['belgium','Belgium'], ['be','Belgium'],
  ['belarus','Belarus'], ['by','Belarus'], ['bosnia and herzegovina','Bosnia and Herzegovina'], ['ba','Bosnia and Herzegovina'],
  ['bulgaria','Bulgaria'], ['bg','Bulgaria'], ['croatia','Croatia'], ['hr','Croatia'], ['cyprus','Cyprus'], ['cy','Cyprus'],
  ['czech republic','Czech Republic'], ['czechia','Czech Republic'], ['cz','Czech Republic'],
  ['denmark','Denmark'], ['dk','Denmark'], ['estonia','Estonia'], ['ee','Estonia'],
  ['finland','Finland'], ['fi','Finland'], ['france','France'], ['fr','France'],
  ['germany','Germany'], ['de','Germany'], ['greece','Greece'], ['gr','Greece'],
  ['hungary','Hungary'], ['hu','Hungary'], ['iceland','Iceland'], ['is','Iceland'],
  ['ireland','Ireland'], ['ie','Ireland'], ['italy','Italy'], ['it','Italy'],
  ['latvia','Latvia'], ['lv','Latvia'], ['liechtenstein','Liechtenstein'], ['li','Liechtenstein'],
  ['lithuania','Lithuania'], ['lt','Lithuania'], ['luxembourg','Luxembourg'], ['lu','Luxembourg'],
  ['malta','Malta'], ['mt','Malta'], ['netherlands','Netherlands'], ['nl','Netherlands'],
  ['moldova','Moldova'], ['md','Moldova'], ['monaco','Monaco'], ['mc','Monaco'], ['montenegro','Montenegro'], ['me','Montenegro'],
  ['north macedonia','North Macedonia'], ['mk','North Macedonia'], ['norway','Norway'], ['no','Norway'], ['poland','Poland'], ['pl','Poland'],
  ['portugal','Portugal'], ['pt','Portugal'], ['romania','Romania'], ['ro','Romania'],
  ['russia','Russia'], ['ru','Russia'], ['san marino','San Marino'], ['sm','San Marino'], ['serbia','Serbia'], ['rs','Serbia'],
  ['slovakia','Slovakia'], ['sk','Slovakia'], ['slovenia','Slovenia'], ['si','Slovenia'],
  ['spain','Spain'], ['es','Spain'], ['sweden','Sweden'], ['se','Sweden'],
  ['switzerland','Switzerland'], ['ch','Switzerland'], ['turkey','Turkey'], ['tr','Turkey'], ['ukraine','Ukraine'], ['ua','Ukraine'],
  ['canada','Canada'], ['ca','Canada'], ['mexico','Mexico'], ['mx','Mexico'],
]);
const usStateNames = new Set(['alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa','kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan','minnesota','mississippi','missouri','montana','nebraska','nevada','new hampshire','new jersey','new mexico','new york','north carolina','north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island','south carolina','south dakota','tennessee','texas','utah','vermont','virginia','washington','west virginia','wisconsin','wyoming']);
const usStateCodes = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']);
export function inferCountry(location: string): string {
  // ATS boards often supply multiple locations separated by pipes, bullets or
  // semicolons, or use US state abbreviations without an explicit country.
  for (const section of location.split(/\s*[|•;]\s*|\s+\/\s+/).map(part => part.trim()).filter(Boolean)) {
    const parts = section.split(',').map(part => part.trim()).filter(Boolean);
    if (!parts.length) continue;
    const last = parts.at(-1)!;
    const tail = last.toLowerCase().replace(/\./g, '').trim();
    if (/\b(?:united states(?: of america)?|usa)\b/i.test(section)) return 'United States';
    if (/\b(?:united kingdom|england|scotland|wales)\b/i.test(section)) return 'United Kingdom';
    // US postal abbreviations are unambiguous in a city, STATE combination.
    // Test before country aliases (CA can otherwise be mistaken for Canada).
    if (parts.length >= 2 && usStateCodes.has(last.toUpperCase())) return 'United States';
    if (parts.length >= 2 && usStateNames.has(tail)) return 'United States';
    // The common unqualified remote-job board labels are standalone cities.
    if (/^(san francisco|new york city|new york|seattle|boston|austin)$/i.test(section)) return 'United States';
    const direct = countryAliases.get(tail);
    if (direct) return direct;
    // Postal codes can trail an ISO country code: Nordborg, DK, 6430.
    if (/^\d[\d\s-]*$/.test(last) && parts.length > 1) {
      const previous = parts.at(-2)!.toLowerCase().replace(/\./g, '');
      const previousCountry = countryAliases.get(previous);
      if (previousCountry) return previousCountry;
    }
  }
  return 'Unknown';
}
export function normalize(raw: RawJob): Job {
  const description = strip(raw.description), location = strip(raw.location) || 'Not specified'; const declaredMode = `${raw.workplaceType ?? ''} ${location}`;
  const workMode: WorkMode = /remote/i.test(declaredMode) ? 'remote' : /hybrid/i.test(declaredMode) ? 'hybrid' : /on.?site|office/i.test(declaredMode) ? 'onsite' : 'unknown'; const country = inferCountry(location); const ai = analyzeAI({ title: raw.title, description });
  const salaryMatch = description.match(/(?:[$€£]\s?[\d,.]+(?:\s*[-–]\s*[$€£]?\s?[\d,.]+)?(?:\s*(?:k|K|per year|\/year|p\.a\.))?)/);
  return { ...raw, title: strip(raw.title), company: strip(raw.company), location, country, workMode, description, postedAt: raw.postedAt && !Number.isNaN(Date.parse(raw.postedAt)) ? new Date(raw.postedAt).toISOString() : null, salary: raw.salary || salaryMatch?.[0] || null, skills: ai.skills, aiRelevance: ai.relevance, visaSponsored: /visa sponsor|sponsorship available|sponsor.*visa/i.test(description) && !/no visa sponsor|unable to sponsor/i.test(description), score: 0 };
}
