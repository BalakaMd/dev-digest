import { describe, expect, it } from 'vitest';
import type { UnifiedDiff } from '@devdigest/shared';
import {
  expectationTypeFor,
  filesOf,
  newSideLines,
  patchFingerprint,
  patchForFile,
  slugify,
  uniqueName,
  validateExpectationsAgainstDiff,
} from '../../src/modules/eval/helpers.js';

describe('slugify / uniqueName (AC-8)', () => {
  it('lower-cases and joins words with a dash', () => {
    expect(slugify('SQL Injection in  User_Query!')).toBe('sql-injection-in-user-query');
    expect(slugify('  --Hello--  ')).toBe('hello');
  });
  it('falls back for an empty slug', () => {
    expect(slugify('!!!')).toBe('eval-case');
    expect(slugify('')).toBe('eval-case');
    expect(slugify('Привіт')).toBe('eval-case');
  });
  it('bounds the length and never ends with a dash', () => {
    const s = slugify(`${'word '.repeat(60)}`);
    expect(s.length).toBeLessThanOrEqual(100);
    expect(s.endsWith('-')).toBe(false);
  });
  it('adds -2, -3, ... when the name is taken', () => {
    expect(uniqueName('x', [])).toBe('x');
    expect(uniqueName('x', ['x'])).toBe('x-2');
    expect(uniqueName('x', new Set(['x', 'x-2']))).toBe('x-3');
    expect(uniqueName('x', ['x-2'])).toBe('x');
  });
});

const RAW = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 1..2 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,2 +10,3 @@',
  ' ctx',
  '+added',
  ' ctx2',
  'diff --git a/src/a.tsx b/src/a.tsx',
  '--- a/src/a.tsx',
  '+++ b/src/a.tsx',
  '@@ -1 +1 @@',
  '-x',
  '+y',
  'diff --git a/old.ts b/new.ts',
  'similarity index 90%',
  'rename from old.ts',
  'rename to new.ts',
  '',
].join('\n');

describe('patchForFile (AC-13)', () => {
  it('slices exactly one file block, preserving hunk headers', () => {
    const p = patchForFile(RAW, 'src/a.ts')!;
    expect(p.startsWith('diff --git a/src/a.ts b/src/a.ts\n')).toBe(true);
    expect(p).toContain('@@ -1,2 +10,3 @@');
    expect(p).not.toContain('a.tsx');
    expect(p.endsWith('\n')).toBe(true);
  });
  it('does not confuse a path that is a prefix of another', () => {
    const p = patchForFile(RAW, 'src/a.tsx')!;
    expect(p).toContain('+y');
    expect(p).not.toContain('+added');
  });
  it('finds a renamed file by its new path', () => {
    expect(patchForFile(RAW, 'new.ts')).toContain('rename to new.ts');
  });
  it('returns null (not the whole diff) for an unknown file', () => {
    expect(patchForFile(RAW, 'nope.ts')).toBeNull();
  });
});

const diff: UnifiedDiff = {
  raw: RAW,
  files: [
    {
      path: 'src/a.ts',
      additions: 1,
      deletions: 0,
      hunks: [{ file: 'src/a.ts', oldStart: 1, oldLines: 2, newStart: 10, newLines: 3, newLineNumbers: [10, 11, 12] }],
    },
    { path: 'bin.png', additions: 0, deletions: 0, hunks: [] },
  ],
};

describe('validateExpectationsAgainstDiff (AC-75)', () => {
  const e = (file: string, start_line: number, end_line: number) => ({ file, start_line, end_line });
  it('accepts expectations inside a hunk, including boundaries and reversed ranges', () => {
    expect(validateExpectationsAgainstDiff(diff, [e('src/a.ts', 12, 40), e('src/a.ts', 1, 10), e('src/a.ts', 11, 11), e('src/a.ts', 12, 11)])).toEqual([]);
  });
  it('rejects a file that is not in the diff, with a reason', () => {
    const r = validateExpectationsAgainstDiff(diff, [e('nope.ts', 1, 2)]);
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("'nope.ts'");
    expect(r[0]).toContain('not in the case diff');
  });
  it('rejects a range that intersects no hunk', () => {
    const r = validateExpectationsAgainstDiff(diff, [e('src/a.ts', 13, 20), e('src/a.ts', 1, 9), e('bin.png', 1, 1)]);
    expect(r).toHaveLength(3);
    expect(r[0]).toContain('Expectation 1');
    expect(r[0]).toContain('do not intersect any hunk');
  });
  it('falls back to the hunk header range when newLineNumbers is empty', () => {
    const d: UnifiedDiff = {
      raw: '',
      files: [{ path: 'f', additions: 0, deletions: 0, hunks: [{ file: 'f', oldStart: 1, oldLines: 1, newStart: 5, newLines: 2, newLineNumbers: [] }] }],
    };
    expect(validateExpectationsAgainstDiff(d, [e('f', 6, 6)])).toEqual([]);
    expect(validateExpectationsAgainstDiff(d, [e('f', 7, 9)])).toHaveLength(1);
  });
});

describe('filesOf', () => {
  it('lists paths in diff order', () => {
    expect(filesOf(diff)).toEqual(['src/a.ts', 'bin.png']);
  });
});

describe('expectationTypeFor (D1)', () => {
  it('maps accepted to must_find and dismissed to must_not_flag', () => {
    expect(expectationTypeFor('accepted')).toBe('must_find');
    expect(expectationTypeFor('dismissed')).toBe('must_not_flag');
  });
});

describe('newSideLines / patchFingerprint (SPEC-07)', () => {
  const patch = [
    'diff --git a/a.ts b/a.ts',
    '--- a/a.ts',
    '+++ b/a.ts',
    '@@ -1,3 +1,3 @@',
    ' one',
    '-two',
    '+TWO',
    ' three',
    '\\ No newline at end of file',
    '@@ -20,2 +20,3 @@',
    ' x',
    '--- removed-looking',
    '+y',
    '+z',
    '',
  ].join('\n');

  it('keeps added and context lines with new-side numbers, never removed lines', () => {
    const { lines, hunks } = newSideLines(patch);
    expect(lines.map((l) => [l.line, l.text])).toEqual([
      [1, 'one'], [2, 'TWO'], [3, 'three'], [20, 'x'], [21, 'y'], [22, 'z'],
    ]);
    expect(hunks).toEqual([{ start_line: 1, end_line: 3 }, { start_line: 20, end_line: 22 }]);
  });

  it('fingerprint is stable and changes with any byte', () => {
    expect(patchFingerprint(patch)).toBe(patchFingerprint(patch));
    expect(patchFingerprint(patch)).toMatch(/^[0-9a-f]{64}$/);
    expect(patchFingerprint(patch + ' ')).not.toBe(patchFingerprint(patch));
  });
});
