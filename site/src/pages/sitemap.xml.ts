import { articles } from '../data';
export const GET=({site}:{site:URL})=>new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/','/articles',...articles.map(a=>`/articles/${a.slug}`)].map(path=>`<url><loc>${new URL(path,site)}</loc></url>`).join('')}</urlset>`,{headers:{'content-type':'application/xml'}});
