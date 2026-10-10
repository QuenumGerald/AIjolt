export const languages = {
  fr: 'Français',
  en: 'English',
} as const;

export type Lang = keyof typeof languages;

export const defaultLang: Lang = 'fr';

export const ui = {
  fr: {
    homeTitle: 'AIJolt — Offres d’emploi IA publiées',
    homeDescriptionEmpty:
      'AIJolt publie des offres IA sur X / Buffer. Les annonces apparaîtront ici dès qu’elles sont postées — pas un scrape brut.',
    homeDescriptionFilled: (n: number, date: string | null) =>
      `${n} offres IA réellement postées par AIJolt sur X / Buffer${date ? `. Mis à jour ${date}` : ''}.`,
    headline: 'Le board des annonces qu’on assume.',
    lede:
      'Uniquement les offres déjà mises en file ou publiées via Buffer / X — une URL stable, rien de scrapé pour faire volume.',
    ctaFilled: 'Parcourir les annonces',
    ctaEmpty: 'Voir l’état du feed',
    ctaNoteEmpty: 'Aucune publication indexable pour l’instant',
    ctaNoteFilled: (n: number, date: string | null) =>
      `${n} publiée${n > 1 ? 's' : ''}${date ? ` · maj ${date}` : ''}`,
    boardTitle: 'Annonces postées',
    boardSubtitle: 'Lecture linéaire. Pas de tableau de bord.',
    emptyKicker: 'Feed public',
    emptyTitle: 'Encore silencieux.',
    emptyBody:
      'AIJolt n’expose que ce qui a été réellement posté. Quand le gateway marque une offre queued ou published, elle apparaît ici avec sa page /jobs/…',
    emptyHint: 'Pas de remplissage cosmétique depuis Foorilla.',
    footerTag: 'Annonces postées · indexables.',
    backToList: '← Annonces AIJolt',
    posted: 'Posté',
    location: 'Lieu',
    mode: 'Mode',
    salary: 'Salaire',
    stack: 'Stack',
    description: 'Description',
    asPosted: 'Tel que posté',
    apply: 'Postuler chez l’employeur',
    canonical: 'Page canonique',
    modeUnknown: 'Non précisé',
    langLabel: 'Langue',
    listingAria: 'Annonces IA publiées',
  },
  en: {
    homeTitle: 'AIJolt — Published AI job posts',
    homeDescriptionEmpty:
      'AIJolt publishes AI roles on X / Buffer. Listings appear here once they are actually posted — not a raw scrape dump.',
    homeDescriptionFilled: (n: number, date: string | null) =>
      `${n} AI roles actually posted by AIJolt on X / Buffer${date ? `. Updated ${date}` : ''}.`,
    headline: 'The board of roles we stand behind.',
    lede:
      'Only jobs already queued or published via Buffer / X — stable URLs, nothing scraped just to pad the page.',
    ctaFilled: 'Browse openings',
    ctaEmpty: 'See feed status',
    ctaNoteEmpty: 'No indexable publications yet',
    ctaNoteFilled: (n: number, date: string | null) =>
      `${n} published${date ? ` · updated ${date}` : ''}`,
    boardTitle: 'Posted openings',
    boardSubtitle: 'Linear reading. Not a dashboard.',
    emptyKicker: 'Public feed',
    emptyTitle: 'Still quiet.',
    emptyBody:
      'AIJolt only shows what was actually posted. When the gateway marks a job queued or published, it appears here with its /jobs/… page.',
    emptyHint: 'No cosmetic fill from Foorilla.',
    footerTag: 'Posted openings · indexable.',
    backToList: '← AIJolt openings',
    posted: 'Posted',
    location: 'Location',
    mode: 'Mode',
    salary: 'Salary',
    stack: 'Stack',
    description: 'Description',
    asPosted: 'As posted',
    apply: 'Apply on employer site',
    canonical: 'Canonical page',
    modeUnknown: 'Not specified',
    langLabel: 'Language',
    listingAria: 'Published AI job openings',
  },
} as const;
