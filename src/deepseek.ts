import { config } from './config.js';
export type Completion = (prompt:string) => Promise<string>;
export const deepSeekCompletion: Completion = async prompt => {
  if (!config.deepseek.apiKey) throw new Error('DEEPSEEK_API_KEY is missing');
  const response = await fetch('https://api.deepseek.com/chat/completions', { method:'POST', headers:{'content-type':'application/json',authorization:`Bearer ${config.deepseek.apiKey}`}, body:JSON.stringify({model:config.deepseek.model,temperature:.45,messages:[{role:'user',content:prompt}]}), signal:AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`DeepSeek API ${response.status} ${response.statusText}`);
  const payload = await response.json() as {choices?:Array<{message?:{content?:string}}>};
  const text = payload.choices?.[0]?.message?.content?.trim(); if (!text) throw new Error('DeepSeek returned empty content'); return text;
};
