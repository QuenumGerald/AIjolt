import type { RawJob } from './types.js';

const core = [
  /\bai engineer\b/i, /machine learning/i, /applied ai/i, /\bllm(s)?\b/i, /retrieval[- ]augmented|\brag\b/i,
  /ai agent/i, /mlops/i, /natural language processing|\bnlp\b/i, /computer vision/i, /robotic/i,
  /ai research/i, /ai product/i, /deep learning/i, /generative ai|genai/i,
];
const skills: Record<string, RegExp> = {
  Python: /\bpython\b/i, PyTorch: /pytorch/i, TensorFlow: /tensorflow/i, LLM: /\bllm/i,
  RAG: /\brag\b|retrieval.augmented/i, NLP: /\bnlp\b|natural language processing/i,
  MLOps: /mlops|model deployment/i, Kubernetes: /kubernetes|\bk8s\b/i, AWS: /\baws\b/i,
  'Computer Vision': /computer vision/i, Robotics: /robotic/i, LangChain: /langchain/i,
};
export function analyzeAI(job: Pick<RawJob, 'title' | 'description'>) {
  const title = job.title || '', text = `${title}\n${job.description ?? ''}`;
  const titleHits = core.filter(r => r.test(title)).length;
  const bodyHits = core.filter(r => r.test(text)).length;
  const detected = Object.entries(skills).filter(([, r]) => r.test(text)).map(([name]) => name);
  const relevance = Math.min(1, titleHits * .55 + bodyHits * .12 + detected.length * .03);
  return { relevant: titleHits > 0 || bodyHits >= 2, relevance, skills: detected };
}
