import type { Job } from './types.js';

const skillPatterns: Record<string, RegExp> = {
  Python: /\bpython\b/i, PyTorch: /pytorch/i, TensorFlow: /\btensorflow\b/i, LLM: /\bllm/i,
  RAG: /\brag\b|retrieval.augmented/i, NLP: /\bnlp\b|natural language processing/i,
  MLOps: /mlops|model deployment/i, Kubernetes: /kubernetes|\bk8s\b/i, AWS: /\baws\b/i,
  'Computer Vision': /computer vision/i, Robotics: /robotic/i, LangChain: /langchain/i,
};

const placeholderLocation = /^(not specified|unspecified|n\/?a|unknown|none|null|-)?$/i;
const pageTitleJunk = /\b(jobs?|careers?|opportunities|openings|hiring|job application for)\b/i;
const campusZh = /校招|社招|届校招|校园招聘|实习招聘/;
const truncated = /^\([^)]{1,24}\)$|^[A-Za-z]\.\.\.?$|^[A-Za-z]…$|…\s*$|\bat\s+[A-Za-z]\.\.\.?$/;
const nonLatin = /\p{Script=Hangul}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Arabic}|\p{Script=Cyrillic}|\p{Script=Thai}/u;

export function fold(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function cleanCompanyName(company: string, title = ''): string {
  let value = company.replace(/\s+/g, ' ').trim();
  const careersAt = value.match(/\b(?:jobs?\s*[-–|]\s*)?careers?\s+at\s+(.+)$/i);
  if (careersAt?.[1]) value = careersAt[1].trim();
  value = value.replace(/\s*[-–|]\s*(jobs?|careers?|opportunities|openings)\b.*$/i, '').trim();
  value = value.replace(/^job application for\b.*$/i, '').trim();
  const foldedTitle = fold(title);
  if (foldedTitle && fold(value).startsWith(foldedTitle) && fold(value) !== foldedTitle) {
    const rest = value.slice(title.length).replace(/^[\s\-–|:]+/, '');
    const at = rest.match(/^(?:at|@)\s+(.+)/i);
    if (at?.[1]) value = at[1].trim();
    else if (rest && !pageTitleJunk.test(rest)) value = rest;
  }
  return value.replace(/\s+/g, ' ').trim();
}

export function isPlaceholderLocation(location: string): boolean {
  return placeholderLocation.test(location.replace(/\s+/g, ' ').trim());
}

export function isGarbledTitle(title: string, company: string): boolean {
  const t = title.replace(/\s+/g, ' ').trim();
  const c = company.replace(/\s+/g, ' ').trim();
  if (!t || !c) return true;
  if (fold(t) === fold(c)) return true;
  if (/^job application for\b/i.test(t) || /^job application for\b/i.test(c)) return true;
  if (pageTitleJunk.test(c) && fold(c).includes(fold(t))) return true;
  if (truncated.test(c) || truncated.test(t)) return true;
  if (c.length <= 2) return true;
  return false;
}

export function isEnglishOrFrench(text: string): boolean {
  const sample = text.slice(0, 2000);
  if (campusZh.test(sample)) return false;
  const hanCount = (sample.match(/\p{Script=Han}/gu) ?? []).length;
  if (hanCount >= 2) return false;
  if (nonLatin.test(sample)) return false;
  const latin = (sample.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  return latin >= 8;
}

export function postingSkills(job: Pick<Job, 'title' | 'description'>): string[] {
  const window = `${job.title}\n${job.description.slice(0, 800)}`;
  return Object.entries(skillPatterns).filter(([, pattern]) => pattern.test(window)).map(([name]) => name);
}

export function fingerprintText(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/#\w+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const stopwords = new Set(['a', 'an', 'the', 'to', 'of', 'for', 'and', 'in', 'on', 'with', 'from', 'or', 'under', 'an', 'new', 'updated']);

function significantTokens(value: string): Set<string> {
  return new Set(fingerprintText(value).split(' ').filter(token => token.length > 2 && !stopwords.has(token)));
}

function trigramDice(a: string, b: string): number {
  const compact = (value: string) => fingerprintText(value).replace(/\s+/g, '');
  const left = compact(a);
  const right = compact(b);
  if (left.length < 6 || right.length < 6) return 0;
  const grams = (value: string) => {
    const set = new Set<string>();
    for (let i = 0; i <= value.length - 3; i++) set.add(value.slice(i, i + 3));
    return set;
  };
  const aGrams = grams(left);
  const bGrams = grams(right);
  let inter = 0;
  for (const gram of aGrams) if (bGrams.has(gram)) inter++;
  return (2 * inter) / (aGrams.size + bGrams.size);
}

export function textsAreNearDuplicates(a: string, b: string): boolean {
  const left = fingerprintText(a);
  const right = fingerprintText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const aTokens = significantTokens(left);
  const bTokens = significantTokens(right);
  let inter = 0;
  for (const token of aTokens) if (bTokens.has(token)) inter++;
  const union = aTokens.size + bTokens.size - inter;
  const jaccard = union > 0 ? inter / union : 0;
  return jaccard >= 0.65 || trigramDice(left, right) >= 0.62;
}

export type SkipKind = 'permanent' | 'temporary';

export function evaluateJobPost(job: Job): { ok: true; job: Job } | { ok: false; kind: SkipKind; reason: string } {
  if (!isEnglishOrFrench(`${job.title}\n${job.company}\n${job.description}`)) {
    return { ok: false, kind: 'permanent', reason: 'skipped: not English or French' };
  }
  if (isPlaceholderLocation(job.location)) {
    return { ok: false, kind: 'permanent', reason: 'skipped: location not specified' };
  }
  const company = cleanCompanyName(job.company, job.title);
  if (!company) {
    return { ok: false, kind: 'permanent', reason: 'skipped: unusable company name' };
  }
  if (isGarbledTitle(job.title, company)) {
    return { ok: false, kind: 'permanent', reason: 'skipped: garbled title or company' };
  }
  return { ok: true, job: { ...job, company, skills: postingSkills(job) } };
}

export function shouldSkipForHistory(
  job: Job,
  text: string,
  recent: Array<{ company: string; text: string }>,
): string | null {
  if (/not specified/i.test(text)) return 'permanent: generated text contains Not specified';
  const last = recent[0];
  if (last && fold(last.company) === fold(job.company)) return 'temporary: same company as previous post';
  if (recent.some(item => textsAreNearDuplicates(item.text, text))) return 'temporary: near-duplicate of a recent post';
  return null;
}
