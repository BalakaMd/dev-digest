import { SLUG_MAX_LENGTH, SLUG_PATTERN } from './constants.js';

/**
 * Turn a display name into a slug matching `^[a-z0-9][a-z0-9-]*$` (AC-14).
 * `used` holds the slugs already taken in the same namespace; a clash gets a
 * `-2`, `-3`, … suffix. The chosen slug is NOT added to `used` — the caller
 * decides when it is committed (see `uniqueSlugs` for a batch).
 */
export function slugify(name: string, used: ReadonlySet<string>, fallback: string): string {
  const base = baseSlug(name, fallback);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Slugs for an ordered list of names; clashes inside the list get suffixes. */
export function uniqueSlugs(
  names: readonly string[],
  fallback: string,
  alreadyUsed: ReadonlySet<string> = new Set(),
): string[] {
  const used = new Set(alreadyUsed);
  return names.map((name) => {
    const slug = slugify(name, used, fallback);
    used.add(slug);
    return slug;
  });
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

function baseSlug(name: string, fallback: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '');
  return cleaned && SLUG_PATTERN.test(cleaned) ? cleaned : fallback;
}
