import { describe, it, expect } from 'vitest';
import type { ConventionCandidate } from '@devdigest/shared';
import {
  adjustConfidence,
  buildSkillBody,
  buildSkillDrafts,
  configPaths,
  dedupeCandidates,
  evidenceFiles,
  isKnownRule,
  isSafeRepoPath,
  numberLines,
  ruleSimilarity,
  slugify,
  verifyCandidate,
  verifyEvidence,
  type VerifiedCandidate,
} from '../src/modules/conventions/helpers.js';

/** Pure helpers of the conventions extractor: evidence checks, dedupe, drafts. */

const USERS = [
  "import { db } from '../lib/db';",
  '',
  'export async function getUser(id: string) {',
  '  const user = await db.users.find(id);',
  '  const posts = await db.posts.findMany({ userId: id });',
  '  return { user, posts };',
  '}',
].join('\n');

const files = new Map<string, string>([
  ['src/api/users.ts', USERS],
  ['src/lib/redis.ts', 'export const redis = new Redis(config.redisUrl);'],
  ['empty.ts', ''],
]);

describe('numberLines', () => {
  it('prefixes 1-based, right-aligned line numbers and notes truncation', () => {
    const out = numberLines(Array.from({ length: 12 }, (_, i) => `l${i + 1}`).join('\n'), 10);
    expect(out.split('\n')[0]).toBe(' 1 | l1');
    expect(out.split('\n')[9]).toBe('10 | l10');
    expect(out).toContain('2 more lines not shown');
  });
});

describe('configPaths', () => {
  it('probes the root, then each top-level folder of the ranked samples, capped', () => {
    const ranked = ['client/src/a.ts', 'server/src/b.ts', 'client/src/c.ts', 'root.ts', 'e2e/x.ts'];
    expect(configPaths(['tsconfig.json', '.prettierrc'], ranked, 2)).toEqual([
      'tsconfig.json',
      '.prettierrc',
      'client/tsconfig.json',
      'client/.prettierrc',
      'server/tsconfig.json',
      'server/.prettierrc',
    ]);
  });
});

describe('isSafeRepoPath', () => {
  it('accepts repo-relative paths only', () => {
    expect(isSafeRepoPath('src/a.ts')).toBe(true);
    expect(isSafeRepoPath('/etc/passwd')).toBe(false);
    expect(isSafeRepoPath('../secrets.json')).toBe(false);
    expect(isSafeRepoPath('src/../../x')).toBe(false);
    expect(isSafeRepoPath('C:\\x')).toBe(false);
  });
});

describe('verifyEvidence', () => {
  const ev = (over: Partial<Parameters<typeof verifyEvidence>[0]> = {}) => ({
    file: 'src/api/users.ts',
    line_start: 4,
    line_end: 5,
    snippet: 'const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId: id });',
    ...over,
  });

  it('keeps evidence whose quoted code is on the cited lines, using the file text', () => {
    expect(verifyEvidence(ev(), files)).toEqual({
      path: 'src/api/users.ts',
      line_start: 4,
      line_end: 5,
      snippet: 'const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId: id });',
    });
  });

  it('normalises ./ prefixes and whitespace differences', () => {
    const res = verifyEvidence(ev({ file: './src/api/users.ts', snippet: 'const   user = await db.users.find(id);' }), files);
    expect(res).toMatchObject({ path: 'src/api/users.ts', line_start: 4, line_end: 4 });
  });

  it('re-anchors a slightly miscounted range on the real lines', () => {
    const res = verifyEvidence(ev({ line_start: 6, line_end: 7 }), files);
    expect(res).toMatchObject({ line_start: 4, line_end: 5 });
  });

  it('rejects a file that was not sampled, an empty file, or an unsafe path', () => {
    expect(verifyEvidence(ev({ file: 'src/missing.ts' }), files)).toBeNull();
    expect(verifyEvidence(ev({ file: 'empty.ts' }), files)).toBeNull();
    expect(verifyEvidence(ev({ file: '../src/api/users.ts' }), files)).toBeNull();
  });

  it('rejects ranges outside the file or inverted / oversized ranges', () => {
    expect(verifyEvidence(ev({ line_start: 40, line_end: 41 }), files)).toBeNull();
    expect(verifyEvidence(ev({ line_start: 5, line_end: 4 }), files)).toBeNull();
    expect(verifyEvidence(ev({ line_start: 1, line_end: 40 }), files)).toBeNull();
    expect(verifyEvidence(ev({ line_start: 0 }), files)).toBeNull();
  });

  it('rejects a snippet that is not in the file, or an empty snippet', () => {
    expect(verifyEvidence(ev({ snippet: 'users.then((u) => u)' }), files)).toBeNull();
    expect(verifyEvidence(ev({ snippet: '   ' }), files)).toBeNull();
  });
});

describe('adjustConfidence', () => {
  it('keeps the model number when all evidence holds in one file', () => {
    expect(adjustConfidence(0.8, 1, 1, 1)).toBe(0.8);
  });
  it('penalises evidence that failed verification', () => {
    expect(adjustConfidence(0.8, 2, 1, 1)).toBe(0.6);
  });
  it('rewards several distinct files and clamps to [0,1]', () => {
    expect(adjustConfidence(0.8, 3, 3, 3)).toBe(0.9);
    expect(adjustConfidence(0.99, 3, 3, 3)).toBe(1);
    expect(adjustConfidence(0.8, 1, 0, 0)).toBe(0);
  });
});

describe('verifyCandidate', () => {
  it('drops the candidate when none of its evidence verifies', () => {
    const res = verifyCandidate(
      {
        category: 'async',
        rule: 'Use async/await',
        confidence: 0.9,
        evidence: [{ file: 'nope.ts', line_start: 1, line_end: 1, snippet: 'x' }],
      },
      files,
    );
    expect(res).toBeNull();
  });

  it('keeps the valid evidence and scores it', () => {
    const res = verifyCandidate(
      {
        category: 'data-access',
        rule: 'Redis access goes through the src/lib/redis.ts singleton',
        confidence: 0.8,
        evidence: [
          { file: 'src/lib/redis.ts', line_start: 1, line_end: 1, snippet: 'export const redis = new Redis(config.redisUrl);' },
          { file: 'src/api/users.ts', line_start: 1, line_end: 1, snippet: 'invented()' },
        ],
      },
      files,
    );
    expect(res?.evidence).toHaveLength(1);
    expect(res?.confidence).toBe(0.6);
    expect(res?.modelConfidence).toBe(0.8);
  });
});

describe('rule similarity and de-duplication', () => {
  const vc = (rule: string, confidence: number, path: string, category = 'async' as const): VerifiedCandidate => ({
    category,
    rule,
    confidence,
    modelConfidence: confidence,
    evidence: [{ path, line_start: 1, line_end: 1, snippet: 'x' }],
  });

  it('scores restatements as similar and different rules as not', () => {
    expect(ruleSimilarity('Always use async/await instead of .then() chains', 'Use async/await, not .then() chains')).toBeGreaterThanOrEqual(0.6);
    expect(ruleSimilarity('Use async/await', 'Name React components in PascalCase')).toBeLessThan(0.2);
  });

  it('merges same-category twins, unions evidence and adds the multi-file bonus', () => {
    const { kept, merged } = dedupeCandidates([
      vc('Use async/await, not .then() chains', 0.7, 'a.ts'),
      vc('Always use async/await instead of .then() chains', 0.8, 'b.ts'),
      vc('Always use async/await instead of .then() chains', 0.8, 'c.ts', 'naming' as never),
    ]);
    expect(merged).toBe(1);
    expect(kept).toHaveLength(2);
    const asyncRule = kept.find((k) => k.category === 'async')!;
    expect(asyncRule.rule).toBe('Always use async/await instead of .then() chains');
    expect(asyncRule.evidence.map((e) => e.path)).toEqual(['b.ts', 'a.ts']);
    expect(asyncRule.confidence).toBe(0.85);
  });

  it('recognises a rule that was already accepted or rejected', () => {
    expect(isKnownRule('Use async/await instead of then chains', ['Always use async/await instead of .then() chains'])).toBe(true);
    expect(isKnownRule('Use named exports only', ['Always use async/await instead of .then() chains'])).toBe(false);
  });
});

describe('skill drafts', () => {
  const cand = (id: string, category: ConventionCandidate['category'], rule: string, path: string): ConventionCandidate => ({
    id,
    category,
    rule,
    evidence_path: path,
    evidence_snippet: 'code()',
    line_start: 3,
    line_end: 4,
    evidence: [
      { path, line_start: 3, line_end: 4, snippet: 'code()' },
      { path: 'other.ts', line_start: 9, line_end: 9, snippet: 'more()' },
    ],
    confidence: 0.9,
    status: 'accepted',
    created_at: new Date(0).toISOString(),
  });
  const accepted = [
    cand('1', 'async', 'Always use async/await instead of .then() chains', 'src/api/users.ts'),
    cand('2', 'naming', 'Name files in kebab-case', 'src/lib/redis-client.ts'),
    cand('3', 'async', 'Wrap awaited DB calls in try/catch', 'src/db.ts'),
  ];

  it('slugifies rules and names', () => {
    expect(slugify('Always use async/await instead of .then() chains')).toBe('always-use-async-await-instead-of');
    expect(slugify('Payments API')).toBe('payments-api');
  });

  it('builds the body with rule headings, file:line and fenced code', () => {
    const body = buildSkillBody('payments-api-conventions', 'payments-api', [accepted[0]!]);
    expect(body).toContain('# payments-api-conventions');
    expect(body).toContain('House conventions for `payments-api`.');
    expect(body).toContain('## always-use-async-await-instead-of');
    expect(body).toContain('Detected in `src/api/users.ts:3-4`:');
    expect(body).toContain('```ts\ncode()\n```');
    expect(body).toContain('Also seen in `other.ts:9`.');
  });

  it('makes one draft for everything in single mode', () => {
    const [draft, ...rest] = buildSkillDrafts('payments-api', accepted, 'single');
    expect(rest).toHaveLength(0);
    expect(draft).toMatchObject({
      name: 'payments-api-conventions',
      description: '3 house conventions extracted from payments-api',
      type: 'convention',
      enabled: true,
      category: null,
      convention_ids: ['1', '2', '3'],
    });
  });

  it('makes one draft per category in category mode, in taxonomy order', () => {
    const drafts = buildSkillDrafts('payments-api', accepted, 'category');
    expect(drafts.map((d) => d.name)).toEqual([
      'payments-api-naming-conventions',
      'payments-api-async-conventions',
    ]);
    expect(drafts[1]!.convention_ids).toEqual(['1', '3']);
    expect(drafts[0]!.description).toBe('1 naming convention extracted from payments-api');
  });

  it('collects distinct evidence files', () => {
    expect(evidenceFiles(accepted)).toEqual(['src/api/users.ts', 'other.ts', 'src/lib/redis-client.ts', 'src/db.ts']);
  });
});
