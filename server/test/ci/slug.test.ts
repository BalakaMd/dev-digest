import { describe, it, expect } from 'vitest';
import { slugify, uniqueSlugs, isValidSlug } from '../../src/modules/ci/slug.js';
import { SLUG_MAX_LENGTH } from '../../src/modules/ci/constants.js';

/** T-7 — slugs (AC-14, EC-7). */
describe('slugify', () => {
  it('always yields a slug matching ^[a-z0-9][a-z0-9-]*$, whatever the name', () => {
    for (const name of ['Security Reviewer', '  --Weird__Name!! ', 'Ünï Çödé', '../../etc/passwd', '日本語', '', '-', 'x'.repeat(200)]) {
      const slug = slugify(name, new Set(), 'agent');
      expect(slug).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
      expect(isValidSlug(slug)).toBe(true);
    }
    expect(slugify('Security Reviewer', new Set(), 'agent')).toBe('security-reviewer');
  });

  it('uses the fallback when nothing slug-able is left', () => {
    expect(slugify('日本語', new Set(), 'skill')).toBe('skill');
  });

  it('gives a name that clashes with a used slug a -2, -3 suffix', () => {
    expect(slugify('Lint', new Set(['lint']), 'skill')).toBe('lint-2');
    expect(slugify('Lint', new Set(['lint', 'lint-2']), 'skill')).toBe('lint-3');
  });
});

describe('uniqueSlugs', () => {
  it('gives two skills whose names produce the same slug distinct slugs, in order (EC-7)', () => {
    expect(uniqueSlugs(['SQL Review', 'sql review', 'SQL-Review!'], 'skill')).toEqual([
      'sql-review',
      'sql-review-2',
      'sql-review-3',
    ]);
  });

  it('keeps a long clashing slug within the length cap', () => {
    const [a, b] = uniqueSlugs(['a'.repeat(100), 'a'.repeat(100)], 'skill');
    expect(a).not.toBe(b);
    expect(b!.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(b).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });
});
