import type { BoardConfig, Job, RawJob } from './types.js';

/** Role-based eligibility: technical disciplines, never sales/recruiting/support. */
const blocked = /\b(?:sales|selling|account executive|account manager|business development|recruit(?:er|ing|ment)?|talent acquisition|sourcer|customer success|customer support|technical support|support|helpdesk|help desk|service desk|client services|client success|partnerships?|partner manager|partner solutions|partnership engineer|marketing|gtm|go.to.market|revenue operations|operations manager|people operations|human resources|hrbp|advertising sales|salesforce|presales|pre.sales|solutions consultant|solutions specialist|commercial|financial analyst|finance|legal|counsel|communications|public relations|policy manager|product manager|project manager|program manager|business analyst|executive assistant)\b/i;
const technical = /\b(?:engineer(?:ing)?|developer|development engineer|programmer|software|frontend|front.end|backend|back.end|full.stack|data scientist|data science|data engineer|data analyst|data architect|data researcher|machine learning|\bml\b|deep learning|research(?:er| scientist| engineer| resident)?|scientist|bioinformatic(?:s|ian)|devops|site reliability|sre|infrastructure|cybersecurity|security architect|cloud architect|software architect|ai architect|technical architect|platform architect|systems architect|robotic(?:s|ist)|computational|quantitative research|computer vision|nlp|natural language processing|applied science)\b/i;
const nonEnglish = /\p{Script=Han}|\p{Script=Hangul}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Cyrillic}|\p{Script=Arabic}|\b(?:ingénieur|ingenieur|développeur|développeuse|chercheur|chercheuse|wissenschaftler|softwareentwickler|entwickler|dados|engenheiro|desarrollador|investigador)\b/iu;

export function isTechnicalRole(title: string): boolean {
  const normalized = title.replace(/\s+/g, ' ').trim();
  return normalized.length >= 8 && !blocked.test(normalized) && !nonEnglish.test(normalized) && technical.test(normalized);
}

/** Approved employers come exclusively from the official configured ATS boards. */
export function isVerifiedEmployer(job: Pick<RawJob, 'source' | 'company'>, boards: readonly BoardConfig[]): boolean {
  const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return job.source !== 'foorilla' && boards.some(b => b.source === job.source && key(b.company) === key(job.company));
}

/** Never invent a city: multi-city boards list real cities, remote-only does not. */
export function jobCity(location: string): string | null {
  const options = location.split(/\s*[|•;]\s*/).map(x => x.trim()).filter(Boolean);
  for (const option of options) {
    if (/^(?:remote|remote-friendly|remote first|hybrid|anywhere|not specified|unknown|worldwide|united states|united kingdom|europe|canada)\b/i.test(option)) continue;
    const first = option.split(',')[0].trim();
    if (!first || first.length > 55 || /^(?:remote|hybrid|not specified|unknown|usa|us|uk|eu)$/i.test(first)) continue;
    if (!/^[\p{L}\d .'-]+$/u.test(first) || !/[\p{L}]/u.test(first)) continue;
    return first;
  }
  return null;
}

/** Salary is only displayed as numeric pay when it has a plausible magnitude. */
export function salaryForPost(rawSalary: string | null): string {
  if (!rawSalary) return 'Not disclosed';
  const value = rawSalary.split(/[•\n]/)[0].trim().replace(/\s+/g, ' ');
  if (value.length > 52) return 'Not disclosed';
  const match = value.match(/(?:[$€£]|\bUSD\b|\bEUR\b|\bGBP\b)\s*([\d,.]+)\s*([kK]?)/);
  if (!match) return 'Not disclosed';
  const amount = Number(match[1].replace(/[,\.](?=\d{3}(?:\D|$))/g, '').replace(/,/g,''));
  if (!Number.isFinite(amount) || (match[2] ? amount < 10 : amount < 1000)) return 'Not disclosed';
  return value.replace(/[.\s]+$/, '');
}

export function formatNoxPost(job: Pick<Job, 'company' | 'title' | 'location' | 'salary' | 'url'>): string | null {
  const city = jobCity(job.location);
  if (!city || !/^https:\/\/[^\s]+$/.test(job.url)) return null;
  const text = `${job.company} is hiring a ${job.title} in ${city}. Salary: ${salaryForPost(job.salary)}. Apply: ${job.url}`;
  return text.length <= 280 && !/[\r\n]/.test(text) ? text : null;
}

export function noxJobRejection(job: Job, boards: readonly BoardConfig[]): string | null {
  if (!isVerifiedEmployer(job, boards)) return 'unverified employer or unofficial job board';
  if (!isTechnicalRole(job.title)) return 'not an engineering/development/data/ML/research role';
  if (!jobCity(job.location)) return 'no verified city in location';
  if (!formatNoxPost(job)) return 'post exceeds X length or has invalid application URL';
  return null;
}
