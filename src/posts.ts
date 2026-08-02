import type { Job } from './types.js';
const salary = (j: Job) => j.salary ?? 'Not disclosed';
const skills = (j: Job) => (j.skills.length ? j.skills.slice(0, 3) : ['AI']).join(', ');
export function xPost(j: Job) { return `New AI job ⚡\n\n${j.title} at ${j.company}\n📍 ${j.location}\n🌍 ${j.workMode}\n💰 ${salary(j)}\n🧠 ${skills(j)}\n\nApply: ${j.url}\n\n#AIJobs #MachineLearning #Hiring`; }
export function linkedinPost(j: Job) { return `New AI opportunity ⚡\n\n${j.company} is hiring a ${j.title}.\n\nLocation: ${j.location}\nWork mode: ${j.workMode}\nSalary: ${salary(j)}\n\nMain skills:\n${skills(j)}\n\nApply directly:\n${j.url}\n\n#AIJobs #ArtificialIntelligence #MachineLearning #Hiring`; }
