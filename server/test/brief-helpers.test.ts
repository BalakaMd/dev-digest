import { describe, it, expect } from 'vitest';
import { extractHunks, groundAnswer, normalizePath, type BriefAnswer } from '../src/modules/brief/helpers.js';

/**
 * SPEC-04 (PR Brief) pure helpers. Kept at the security-relevant core: no diff
 * body line may leave `extractHunks` (AC-24), and model-written paths are only
 * accepted when they are exactly a known repo-relative path (AC-20, AC-21).
 */

describe('extractHunks (AC-23, AC-24, EC-17)', () => {
  it('returns hunk ranges and header lines only, never a body line; null patch gives none', () => {
    const patch = [
      '@@ -10,3 +10,4 @@ export function secretFn() {',
      ' const keep = "CONTEXT-BODY";',
      '-const old = "REMOVED-BODY";',
      '+const added = "ADDED-BODY";',
      '+// @@ -1,1 +1,1 @@ fake header inside an added line',
      '\\ No newline at end of file',
      '@@ -40 +41,2 @@',
      '+x',
    ].join('\n');

    const hunks = extractHunks(patch);
    expect(hunks).toEqual([
      { oldStart: 10, oldLines: 3, newStart: 10, newLines: 4, header: '@@ -10,3 +10,4 @@ export function secretFn() {' },
      { oldStart: 40, oldLines: 1, newStart: 41, newLines: 2, header: '@@ -40 +41,2 @@' },
    ]);
    const serialized = JSON.stringify(hunks);
    for (const body of ['CONTEXT-BODY', 'REMOVED-BODY', 'ADDED-BODY', 'fake header']) {
      expect(serialized).not.toContain(body);
    }

    expect(extractHunks(null)).toEqual([]);
  });
});

describe('grounding of the model answer (AC-20, AC-21, EC-6, EC-7)', () => {
  const allowed = new Set(['src/a.ts', 'src/b.ts']);
  const risk = (file_refs: string[]) => ({
    kind: 'behavior',
    title: 't',
    explanation: 'e',
    severity: 'high' as const,
    file_refs,
  });

  it('rejects invented, absolute and `..` paths; keeps a `./`-prefixed known path normalised', () => {
    expect(normalizePath('../../etc/passwd')).toBeNull();
    expect(normalizePath('src/../../etc/passwd')).toBeNull();
    expect(normalizePath('/etc/passwd')).toBeNull();
    expect(normalizePath('  ./src/a.ts ')).toBe('src/a.ts');

    const answer: BriefAnswer = {
      summary: 's',
      risks: [
        risk(['./src/a.ts', 'src/invented.ts', '../src/b.ts']), // keeps only src/a.ts
        risk(['src/invented.ts', '/etc/passwd']), // nothing left: whole risk dropped
      ],
      review_focus: [
        { file: 'src/b.ts', line: 7, reason: 'ok' },
        { file: 'src/invented.ts', line: 7, reason: 'unknown file' },
        { file: '../src/a.ts', line: 7, reason: 'traversal' },
        { file: 'src/a.ts', line: 0, reason: 'line below 1' },
      ],
    };

    const grounded = groundAnswer(answer, allowed);
    expect(grounded.risks).toHaveLength(1);
    expect(grounded.risks[0]!.file_refs).toEqual(['src/a.ts']);
    expect(grounded.review_focus).toEqual([{ file: 'src/b.ts', line: 7, reason: 'ok' }]);
    expect(grounded.counts).toMatchObject({
      risks_returned: 2,
      risk_refs_returned: 5,
      focus_returned: 4,
      risks_dropped_by_grounding: 1,
      risk_refs_dropped_by_grounding: 4,
      focus_dropped_by_grounding: 3,
    });
  });
});
