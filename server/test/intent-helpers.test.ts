import { describe, it, expect } from 'vitest';
import {
  buildClassifierMessage,
  clampIntent,
  computeConfidence,
  extractHunkHeaders,
  isStale,
  normalizeRepoPath,
  parseIntentLinks,
  planSpecFromChangedFiles,
  sanitizeRef,
  truncateUtf8,
} from '../src/modules/intent/helpers.js';
import { MAX_ITEM_CHARS, MAX_ITEMS } from '../src/modules/intent/constants.js';

const REPO = { owner: 'acme', name: 'api' };

describe('extractHunkHeaders', () => {
  it('keeps only the context text after the second @@, ignoring +/-/space diff lines', () => {
    const patch = [
      '@@ -10,3 +10,4 @@ function handler() {',
      '   port: 3000,',
      '+  stripeKey: "sk_live_xxx",',
      '-  old: true,',
      '@@ -40,2 +41,2 @@',
    ].join('\n');
    expect(extractHunkHeaders(patch)).toEqual(['function handler() {', '@@ -40,2 +41,2 @@']);
  });

  it('returns [] for a null/undefined patch', () => {
    expect(extractHunkHeaders(null)).toEqual([]);
    expect(extractHunkHeaders(undefined)).toEqual([]);
  });

  it('caps at MAX_HUNK_HEADERS_PER_FILE', () => {
    const patch = Array.from({ length: 30 }, (_, i) => `@@ -${i},1 +${i},1 @@ ctx${i}`).join('\n');
    expect(extractHunkHeaders(patch)).toHaveLength(20);
  });
});

describe('normalizeRepoPath', () => {
  it('accepts a clean relative doc path', () => {
    expect(normalizeRepoPath('docs/plan.md')).toBe('docs/plan.md');
    expect(normalizeRepoPath('./docs/plan.md')).toBe('docs/plan.md');
  });

  it('rejects traversal, absolute paths, backslashes and non-doc extensions', () => {
    expect(normalizeRepoPath('../x.md')).toBeNull();
    expect(normalizeRepoPath('/etc/x.md')).toBeNull();
    expect(normalizeRepoPath('a\\b.md')).toBeNull();
    expect(normalizeRepoPath('x.ts')).toBeNull();
  });
});

describe('planSpecFromChangedFiles', () => {
  it('matches plans/specs/adr directories and plan/spec-named files', () => {
    expect(
      planSpecFromChangedFiles([
        '.claude/plans/2026-01-01-thing.md',
        'specs/review-flow.md',
        'docs/adr/0001-decision.md',
        'my-feature-plan.md',
        'README.md',
        'src/index.ts',
      ]),
    ).toEqual([
      '.claude/plans/2026-01-01-thing.md',
      'specs/review-flow.md',
      'docs/adr/0001-decision.md',
      'my-feature-plan.md',
    ]);
  });
});

describe('parseIntentLinks', () => {
  it('parses every closing keyword + bare #N as an issue reference', () => {
    const body = 'Closes #1. fixes #2 and Resolved #3.';
    const { issues } = parseIntentLinks(body, REPO);
    expect(issues.map((i) => i.number).sort()).toEqual([1, 2, 3]);
    expect(issues.every((i) => i.owner === 'acme' && i.name === 'api')).toBe(true);
  });

  it('parses a bare #N (no closing keyword)', () => {
    const { issues } = parseIntentLinks('See bare #4 for context.', REPO);
    expect(issues).toEqual([{ owner: 'acme', name: 'api', number: 4 }]);
  });

  it('parses owner/repo#N and github issue URLs, including cross-repo', () => {
    const body = 'See other/repo#9 and https://github.com/acme/api/issues/42';
    const { issues } = parseIntentLinks(body, REPO);
    expect(issues).toEqual(
      expect.arrayContaining([
        { owner: 'other', name: 'repo', number: 9 },
        { owner: 'acme', name: 'api', number: 42 },
      ]),
    );
  });

  it('resolves a same-repo blob URL and a relative markdown link as docs', () => {
    const body =
      'Plan: https://github.com/acme/api/blob/main/docs/plan.md and see [the spec](specs/review-flow.md).';
    const { docs } = parseIntentLinks(body, REPO);
    expect(docs).toEqual(
      expect.arrayContaining([{ path: 'docs/plan.md' }, { path: 'specs/review-flow.md' }]),
    );
  });

  it('marks an other-repo blob URL as unsupported', () => {
    const body = 'See https://github.com/other/repo/blob/main/docs/plan.md';
    const { docs, unsupported } = parseIntentLinks(body, REPO);
    expect(docs).toEqual([]);
    expect(unsupported).toEqual([{ ref: 'github.com/other/repo/blob/main/docs/plan.md' }]);
  });

  it('marks a known tracker/doc host as unsupported', () => {
    const body = 'Ticket: https://acme.atlassian.net/browse/X-1?foo=bar';
    const { unsupported } = parseIntentLinks(body, REPO);
    expect(unsupported).toEqual([{ ref: 'acme.atlassian.net/browse/X-1' }]);
  });

  it('ignores other URLs (library docs, badges, images), counting them only', () => {
    const body =
      '![badge](https://img.shields.io/badge/build-passing-green) see https://example.com/docs/x';
    const { unsupported, docs, issues, ignoredCount } = parseIntentLinks(body, REPO);
    expect(unsupported).toEqual([]);
    expect(docs).toEqual([]);
    expect(issues).toEqual([]);
    expect(ignoredCount).toBe(2);
  });

  it('dedupes repeated references', () => {
    const body = 'Closes #1, closes #1 again, see #1 once more.';
    expect(parseIntentLinks(body, REPO).issues).toHaveLength(1);
  });

  it('caps issues and docs at their limits', () => {
    const body = '#1 #2 #3 #4 #5';
    expect(parseIntentLinks(body, REPO).issues).toHaveLength(3);
    const docsBody = 'a/one.md b/two.md c/three.md d/four.md';
    expect(parseIntentLinks(docsBody, REPO).docs).toHaveLength(3);
  });
});

describe('sanitizeRef', () => {
  it('strips scheme, query and fragment', () => {
    expect(sanitizeRef('https://acme.atlassian.net/browse/X-1?foo=bar#frag')).toBe(
      'acme.atlassian.net/browse/X-1',
    );
  });
});

describe('truncateUtf8', () => {
  it('leaves short text untouched', () => {
    const r = truncateUtf8('hello', 100);
    expect(r).toEqual({ text: 'hello', truncated: false, bytes: 5 });
  });

  it('cuts at the byte cap without splitting a multi-byte codepoint', () => {
    const text = 'a'.repeat(5) + '€€€'; // € is 3 bytes in UTF-8
    const r = truncateUtf8(text, 6); // exactly 5 'a' + first byte of a €
    expect(r.truncated).toBe(true);
    expect(r.bytes).toBeLessThanOrEqual(6);
    expect(() => r.text).not.toThrow();
    // Decoding never leaves a dangling replacement character from a split codepoint.
    expect(r.text.includes('�')).toBe(false);
  });
});

describe('computeConfidence', () => {
  it('high: non-trivial description + >=1 fetched doc/issue + no failures', () => {
    expect(
      computeConfidence({
        descriptionChars: 100,
        sources: [{ kind: 'issue', status: 'used' }],
      }),
    ).toBe('high');
  });

  it('medium: non-trivial description, no fetched docs, no failures', () => {
    expect(computeConfidence({ descriptionChars: 100, sources: [] })).toBe('medium');
  });

  it('medium: >=1 fetched doc, trivial description, no failures', () => {
    expect(
      computeConfidence({ descriptionChars: 5, sources: [{ kind: 'plan', status: 'truncated' }] }),
    ).toBe('medium');
  });

  it('low: trivial description, nothing fetched', () => {
    expect(computeConfidence({ descriptionChars: 0, sources: [] })).toBe('low');
  });

  it('low: any referenced source unreachable/unsupported, even with a good description', () => {
    expect(
      computeConfidence({
        descriptionChars: 100,
        sources: [
          { kind: 'issue', status: 'used' },
          { kind: 'plan', status: 'unreachable' },
        ],
      }),
    ).toBe('low');
    expect(
      computeConfidence({
        descriptionChars: 100,
        sources: [{ kind: 'link', status: 'unsupported' }],
      }),
    ).toBe('low');
  });
});

describe('clampIntent', () => {
  it('caps item count and item length', () => {
    const raw = {
      summary: '  hello  ',
      in_scope: Array.from({ length: 10 }, (_, i) => `item ${i} ${'x'.repeat(200)}`),
      out_of_scope: [],
    };
    const clamped = clampIntent(raw);
    expect(clamped.summary).toBe('hello');
    expect(clamped.in_scope).toHaveLength(MAX_ITEMS);
    expect(clamped.in_scope.every((s) => s.length <= MAX_ITEM_CHARS)).toBe(true);
  });

  it('drops empty items after trimming', () => {
    expect(clampIntent({ summary: 'x', in_scope: ['  ', 'real'], out_of_scope: [] }).in_scope).toEqual([
      'real',
    ]);
  });
});

describe('isStale', () => {
  it('is stale when the intent has no recorded head SHA', () => {
    expect(isStale(null, 'abc')).toBe(true);
  });
  it('is stale when the head SHA moved', () => {
    expect(isStale('abc', 'def')).toBe(true);
  });
  it('is fresh when the head SHA matches', () => {
    expect(isStale('abc', 'abc')).toBe(false);
  });
});

describe('buildClassifierMessage', () => {
  it('omits empty description, includes unavailable line only when something failed', () => {
    const withDesc = buildClassifierMessage({
      repo: REPO,
      prNumber: 1,
      title: 'Add rate limiting',
      description: 'Adds a limiter.',
      files: [{ path: 'src/config.ts', headers: ['@@ -1,1 +1,1 @@'] }],
      issues: [],
      docs: [],
      unavailable: [],
    });
    expect(withDesc).toContain('pr-description');
    expect(withDesc).not.toContain('Unavailable context');

    const noDesc = buildClassifierMessage({
      repo: REPO,
      prNumber: 1,
      title: 'Add rate limiting',
      description: '',
      files: [],
      issues: [],
      docs: [],
      unavailable: [{ ref: 'docs/plan.md', status: 'unreachable' }],
    });
    expect(noDesc).not.toContain('pr-description');
    expect(noDesc).toContain('Unavailable context: docs/plan.md (unreachable)');
  });

  it('never includes a raw diff body — only file paths and hunk headers', () => {
    const msg = buildClassifierMessage({
      repo: REPO,
      prNumber: 1,
      title: 't',
      description: '',
      files: [{ path: 'src/config.ts', headers: ['@@ -1,1 +1,1 @@ ctx'] }],
      issues: [],
      docs: [],
      unavailable: [],
    });
    expect(msg).toContain('src/config.ts');
    expect(msg).toContain('@@ -1,1 +1,1 @@ ctx');
    expect(msg).not.toMatch(/^\+|\n\+/); // no added-line diff body
  });
});
