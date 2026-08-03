import { articles } from '../data';
export const GET=()=>new Response(JSON.stringify(articles.filter(article=>['INSIGHT','WEEKLY_DIGEST'].includes(article.type))),{headers:{'content-type':'application/json; charset=utf-8'}});
