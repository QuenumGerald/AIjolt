import type { Job } from './types.js'; import { config } from './config.js'; const salary = (j: Job) => j.salary ?? 'Not disclosed'; const skills = (j: Job) => (j.skills.length ? j.skills.slice(0, 3) : ['AI']).join(', '); const shorten = (value: string, max: number) => value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
export function xPost(j: Job) {
  const required = `${j.title} — ${j.company}\n📍 ${shorten(j.location, 35)}\nApply: ${j.url}`;
  const tags = ' #AIJobs #Hiring';
  return required.length + tags.length <= 280 ? `${required}${tags}` : required;
}
export function linkedinPost(j: Job) { return `New AI opportunity ⚡\n\n${j.company} is hiring a ${j.title}.\n\nLocation: ${j.location}\nWork mode: ${j.workMode}\nSalary: ${salary(j)}\n\nMain skills:\n${skills(j)}\n\nApply directly:\n${j.url}\n\n#AIJobs #ArtificialIntelligence #MachineLearning #Hiring`; }
export async function generatePost(j: Job, network: 'x' | 'linkedin') {
  const fallback = network === 'x' ? xPost(j) : linkedinPost(j);
  if (!config.deepseek.apiKey) return fallback;
  const prompt = `Write one concise ${network === 'x' ? 'X post under 280 characters' : 'LinkedIn post under 700 characters'} in English for this AI job. Include the COMPLETE job title exactly as provided, without truncating or rewriting it. Keep the direct application URL exactly. Prefer fewer hashtags if needed to preserve the full title and URL. Return only the post.\nTitle: ${j.title}\nCompany: ${j.company}\nLocation: ${j.location}\nWork mode: ${j.workMode}\nSkills: ${skills(j)}\nSalary: ${salary(j)}\nURL: ${j.url}`;
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.deepseek.apiKey}` }, body: JSON.stringify({ model: config.deepseek.model, temperature: 0.7, messages: [{ role: 'user', content: prompt }] }), signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return fallback;
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = payload.choices?.[0]?.message?.content?.trim();
    return text && text.includes(j.url) ? text : fallback;
  } catch { return fallback; }
}
