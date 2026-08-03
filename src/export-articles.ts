import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ContentService } from './content-service.js';
export function exportArticlesJson(path=resolve('data/articles.json')) { const articles=new ContentService().history().filter(item=>item.status==='published'); mkdirSync(dirname(path),{recursive:true}); writeFileSync(path,JSON.stringify({generatedAt:new Date().toISOString(),articles},null,2)); return articles.length; }
