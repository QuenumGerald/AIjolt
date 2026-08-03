import type Database from 'better-sqlite3';
import { db } from './db.js';
import { ContentService } from './content-service.js';
export type ArticleQuery={type?:string;from?:string;keyword?:string};
export class ContentApi {
  private content:ContentService; constructor(database:Database.Database=db){this.content=new ContentService(database);}
  articles(query:ArticleQuery={}) { return this.content.history().filter(a=>a.status==='published'&&(!query.type||a.type===query.type)&&(!query.from||Boolean(a.publishedAt&&a.publishedAt>=query.from))&&(!query.keyword||`${a.title} ${a.excerpt} ${a.markdown}`.toLowerCase().includes(query.keyword.toLowerCase()))); }
  article(slug:string){return this.articles().find(a=>a.slug===slug);}
  insights(){return this.articles().filter(a=>['INSIGHT','WEEKLY_DIGEST'].includes(a.type));}
  stats(){return this.content.statistics();}
}
