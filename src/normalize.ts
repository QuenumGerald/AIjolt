import { analyzeAI } from './ai.js'; import type { Job, RawJob, WorkMode } from './types.js';
const strip = (s = '') => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#39;|&amp;/g, ' ').replace(/\s+/g, ' ').trim();
const countryAliases = new Map<string, string>([
  ['united states','United States'], ['usa','United States'], ['us','United States'],
  ['united kingdom','United Kingdom'], ['uk','United Kingdom'], ['gb','United Kingdom'],
  ['austria','Austria'], ['at','Austria'], ['belgium','Belgium'], ['be','Belgium'],
  ['croatia','Croatia'], ['hr','Croatia'], ['cyprus','Cyprus'], ['cy','Cyprus'],
  ['czech republic','Czech Republic'], ['czechia','Czech Republic'], ['cz','Czech Republic'],
  ['denmark','Denmark'], ['dk','Denmark'], ['estonia','Estonia'], ['ee','Estonia'],
  ['finland','Finland'], ['fi','Finland'], ['france','France'], ['fr','France'],
  ['germany','Germany'], ['de','Germany'], ['greece','Greece'], ['gr','Greece'],
  ['hungary','Hungary'], ['hu','Hungary'], ['iceland','Iceland'], ['is','Iceland'],
  ['ireland','Ireland'], ['ie','Ireland'], ['italy','Italy'], ['it','Italy'],
  ['latvia','Latvia'], ['lv','Latvia'], ['liechtenstein','Liechtenstein'], ['li','Liechtenstein'],
  ['lithuania','Lithuania'], ['lt','Lithuania'], ['luxembourg','Luxembourg'], ['lu','Luxembourg'],
  ['malta','Malta'], ['mt','Malta'], ['netherlands','Netherlands'], ['nl','Netherlands'],
  ['norway','Norway'], ['no','Norway'], ['poland','Poland'], ['pl','Poland'],
  ['portugal','Portugal'], ['pt','Portugal'], ['romania','Romania'], ['ro','Romania'],
  ['slovakia','Slovakia'], ['sk','Slovakia'], ['slovenia','Slovenia'], ['si','Slovenia'],
  ['spain','Spain'], ['es','Spain'], ['sweden','Sweden'], ['se','Sweden'],
  ['switzerland','Switzerland'], ['ch','Switzerland'],
]);
const usStateNames = new Set(['alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa','kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan','minnesota','mississippi','missouri','montana','nebraska','nevada','new hampshire','new jersey','new mexico','new york','north carolina','north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island','south carolina','south dakota','tennessee','texas','utah','vermont','virginia','washington','west virginia','wisconsin','wyoming']);
const usStateCodes = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']);
export function inferCountry(location: string): string {
  const parts = location.split(',').map(part => part.trim()).filter(Boolean);
  if (!parts.length) return 'Unknown';
  const last = parts.at(-1)!;
  const lastNormalized = last.toLowerCase().replace(/\./g, '');
  const direct = countryAliases.get(lastNormalized);
  if (direct) return direct;
  // Postal codes may trail a country code (for example: Nordborg, DK, 6430).
  if (/^\d[\d\s-]*$/.test(last) && parts.length > 1) {
    const previous = parts.at(-2)!.toLowerCase().replace(/\./g, '');
    const previousCountry = countryAliases.get(previous);
    if (previousCountry) return previousCountry;
  }
  // Do not treat a regional code before an explicit but unsupported country as a country.
  if (/[A-Za-z]/.test(last)) return 'Unknown';
  if (parts.some(part => usStateNames.has(part.toLowerCase()) || usStateCodes.has(part.toUpperCase()))) return 'United States';
  return 'Unknown';
}
export function normalize(raw: RawJob): Job {
  const description = strip(raw.description), location = strip(raw.location) || 'Not specified'; const declaredMode = `${raw.workplaceType ?? ''} ${location}`;
  const workMode: WorkMode = /remote/i.test(declaredMode) ? 'remote' : /hybrid/i.test(declaredMode) ? 'hybrid' : /on.?site|office/i.test(declaredMode) ? 'onsite' : 'unknown'; const country = inferCountry(location); const ai = analyzeAI({ title: raw.title, description });
  const salaryMatch = description.match(/(?:[$€£]\s?[\d,.]+(?:\s*[-–]\s*[$€£]?\s?[\d,.]+)?(?:\s*(?:k|K|per year|\/year|p\.a\.))?)/);
  return { ...raw, title: strip(raw.title), company: strip(raw.company), location, country, workMode, description, postedAt: raw.postedAt && !Number.isNaN(Date.parse(raw.postedAt)) ? new Date(raw.postedAt).toISOString() : null, salary: raw.salary || salaryMatch?.[0] || null, skills: ai.skills, aiRelevance: ai.relevance, visaSponsored: /visa sponsor|sponsorship available|sponsor.*visa/i.test(description) && !/no visa sponsor|unable to sponsor/i.test(description), score: 0 };
}
