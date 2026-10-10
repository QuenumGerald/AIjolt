import { defaultLang, languages, type Lang, ui } from './ui';

export function isLang(value: string | undefined): value is Lang {
  return Boolean(value && value in languages);
}

export function useTranslations(lang: Lang) {
  return ui[lang];
}

export function localePath(lang: Lang, path = '/'): string {
  const clean = path === '/' ? '/' : path.startsWith('/') ? path : `/${path}`;
  if (lang === defaultLang) return clean;
  if (clean === '/') return `/${lang}/`;
  return `/${lang}${clean}`;
}

export function switchLocalePath(currentLang: Lang, targetLang: Lang, pathWithinLocale: string): string {
  return localePath(targetLang, pathWithinLocale);
}

export function dateLocale(lang: Lang): string {
  return lang === 'fr' ? 'fr-FR' : 'en-US';
}

export { defaultLang, languages, type Lang };
