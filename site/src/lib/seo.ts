import type { PostedJob } from '../types';

export const SITE_NAME = 'AIJolt';
export const SITE_URL = 'https://aijolt.pages.dev';
export const DEFAULT_DESCRIPTION =
  'Offres d’emploi en intelligence artificielle publiées par AIJolt — annonces réellement postées sur X / Buffer.';

export function jobSlug(job: Pick<PostedJob, 'externalId'>): string {
  return job.externalId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export function jobPath(job: Pick<PostedJob, 'externalId'>): string {
  return `/jobs/${jobSlug(job)}`;
}

export function jobCanonical(job: Pick<PostedJob, 'externalId'>): string {
  return `${SITE_URL}${jobPath(job)}`;
}

export function absoluteUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function metaDescription(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function jobTitleTag(job: Pick<PostedJob, 'title' | 'company'>): string {
  return `${job.title} — ${job.company} | ${SITE_NAME}`;
}

export function jobMetaDescription(job: PostedJob): string {
  const bits = [
    job.title,
    job.company,
    job.location && job.location !== 'Not specified' ? job.location : null,
    job.workMode !== 'unknown' ? job.workMode : null,
  ].filter(Boolean);
  const lead = bits.join(' · ');
  const body = metaDescription(job.description, 120);
  return metaDescription(`${lead}. ${body}`);
}

function employmentType(job: PostedJob): string | undefined {
  const hay = `${job.title} ${job.description}`.toLowerCase();
  if (/\b(intern|stage|internship)\b/.test(hay)) return 'INTERN';
  if (/\b(part[- ]?time|temps partiel)\b/.test(hay)) return 'PART_TIME';
  if (/\b(contract|contractor|freelance)\b/.test(hay)) return 'CONTRACTOR';
  if (/\b(full[- ]?time|temps plein|cdi)\b/.test(hay)) return 'FULL_TIME';
  return undefined;
}

function jobLocationSchema(job: PostedJob) {
  if (job.workMode === 'remote') {
    return {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressCountry: job.country !== 'Unknown' ? job.country : 'FR',
      },
    };
  }
  return {
    '@type': 'Place',
    address: {
      '@type': 'PostalAddress',
      addressLocality: job.location !== 'Not specified' ? job.location : undefined,
      addressCountry: job.country !== 'Unknown' ? job.country : undefined,
    },
  };
}

/** JSON-LD JobPosting pour Google for Jobs / rich results. */
export function jobPostingJsonLd(job: PostedJob) {
  const datePosted = job.socialPublishedAt || job.postedAt || undefined;
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description.replace(/\s+/g, ' ').trim().slice(0, 5000),
    datePosted,
    hiringOrganization: {
      '@type': 'Organization',
      name: job.company,
    },
    identifier: {
      '@type': 'PropertyValue',
      name: SITE_NAME,
      value: job.externalId,
    },
    url: jobCanonical(job),
    directApply: false,
    industry: 'Artificial Intelligence',
    skills: job.skills?.length ? job.skills.join(', ') : undefined,
    jobLocation: jobLocationSchema(job),
  };

  if (job.workMode === 'remote') {
    schema.jobLocationType = 'TELECOMMUTE';
    schema.applicantLocationRequirements = {
      '@type': 'Country',
      name: job.country !== 'Unknown' ? job.country : 'Worldwide',
    };
  }

  const emp = employmentType(job);
  if (emp) schema.employmentType = emp;

  // Lien de candidature externe (ATS) — pas l’URL canonique AIJolt.
  schema.applicationContact = undefined;
  (schema as { hiringOrganization: Record<string, unknown> }).hiringOrganization.sameAs = job.url;

  return schema;
}

export function itemListJsonLd(jobs: PostedJob[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${SITE_NAME} — Offres IA publiées`,
    numberOfItems: jobs.length,
    itemListElement: jobs.map((job, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: jobCanonical(job),
      name: `${job.title} — ${job.company}`,
    })),
  };
}
