import { describe, it, expect } from 'vitest';
import { extractSearchTerms, suggestRange, type SuggestInput } from '../../src/modules/eval/suggestion.js';
import type { EvalStructure } from '../../src/modules/eval/types.js';

/** SPEC-07 T-3 — the pure suggestion core. */

function mk(texts: string[], startAt = 1) {
  return texts.map((text, i) => ({ line: startAt + i, text }));
}
function input(over: Partial<SuggestInput> & { texts?: string[] }): SuggestInput {
  const lines = over.lines ?? mk(over.texts ?? Array.from({ length: 30 }, (_, i) => `line ${i + 1}`));
  return {
    type: 'must_find',
    kind: 'finding',
    file: 'a.ts',
    cited: { start_line: 2, end_line: 3 },
    title: 'nothing',
    rationale: '',
    hunks: [{ start_line: lines[0]!.line, end_line: lines[lines.length - 1]!.line }],
    analyze: () => null,
    ...over,
    lines,
  };
}
const stub = (s: EvalStructure) => () => s;
const r = (a: number, b: number) => ({ start_line: a, end_line: b });

describe('extractSearchTerms (AC-6, Q-2, Q-3)', () => {
  it('backticks, camelCase, snake_case, dot and () terms', () => {
    const t = extractSearchTerms('Bad `foo bar` and findUserByEmail', 'uses user_id and err.stack plus run() but plain words and Pascal');
    expect(t).toEqual(expect.arrayContaining(['foo bar', 'findUserByEmail', 'user_id', 'err.stack', 'run()']));
    expect(t).not.toContain('plain');
    expect(t).not.toContain('Pascal');
  });
  it('string literals keep their quotes; two spellings of an HTTP path', () => {
    const t = extractSearchTerms('Unhandled rejection in GET /users route', `see "abc" and 'xy'`);
    expect(t).toEqual(expect.arrayContaining(["'/users'", '"/users"', '"abc"']));
    expect(t).not.toContain("'xy'"); // inner length 2 < 3
  });
  it('drops terms shorter than 3 characters and dedupes', () => {
    expect(extractSearchTerms('`ab` `abc` `abc`', '')).toEqual(['abc']);
  });
  it('NFR-3: hostile and huge input does not throw and stays bounded', () => {
    expect(() => extractSearchTerms('`(` `[` `$(` `.*` `a.b(`', 'x'.repeat(1_000_000))).not.toThrow();
    const many = Array.from({ length: 5000 }, (_, i) => `\`term${i}\``).join(' ');
    expect(extractSearchTerms('t', many).length).toBeLessThanOrEqual(100);
    expect(extractSearchTerms(`\`${'x'.repeat(300)}\``, '')).toEqual([]);
  });
});

describe('re-targeting (AC-7/8/9/11/49/51)', () => {
  const texts = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
  texts[15] = "app.get('/users', handler)"; // line 16
  const title = 'Bug in GET /users route';

  it('AC-7: must_find with no term in the cited range moves to the line with the term', () => {
    const out = suggestRange(input({ texts, title, cited: r(6, 8) }));
    expect(out.suggested).toEqual(r(16, 16));
    expect(out.reason.terms).toEqual([{ term: "'/users'", count: 1 }]);
    expect(out.reason.structure_available).toBe(false); // analyze -> null
  });
  it('AC-8: a term inside the cited range keeps it', () => {
    const t = [...texts];
    t[6] = "x '/users' y";
    expect(suggestRange(input({ texts: t, title, cited: r(6, 8) })).suggested).toEqual(r(6, 8));
  });
  it('AC-51: no term anywhere -> cited', () => {
    expect(suggestRange(input({ title: 'Totally vague', cited: r(6, 8) })).suggested).toEqual(r(6, 8));
  });
  it('AC-9: ties go to the nearest line, then the lower number', () => {
    const t = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    t[9] = 'uses `needle`'; // 10
    t[19] = 'uses `needle`'; // 20
    expect(suggestRange(input({ texts: t, title: '`needle`', cited: r(13, 14) })).suggested).toEqual(r(10, 10)); // dist 3 vs 6
    expect(suggestRange(input({ texts: t, title: '`needle`', cited: r(14, 16) })).suggested).toEqual(r(10, 10)); // dist 4 vs 4 -> lower
  });
  it('AC-9: the line with more distinct terms wins over a nearer one', () => {
    const t = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    t[9] = '`alpha` `beta`';
    t[11] = '`alpha`';
    expect(suggestRange(input({ texts: t, title: '`alpha` and `beta`', cited: r(13, 13) })).suggested).toEqual(r(10, 10));
  });
  it('import-like lines are not places: import / export-from / require alone -> no retarget (user-approved refinement of AC-7/AC-9)', () => {
    for (const text of [
      "import { needle } from './x';",
      "export { needle } from './x';",
      "const needle = require('./x');",
    ]) {
      const t = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
      t[9] = text; // 10
      expect(suggestRange(input({ texts: t, title: '`needle`', cited: r(13, 14) })).suggested).toEqual(r(13, 14));
    }
  });
  it('import line is skipped in favour of a farther non-import line', () => {
    const t = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    t[9] = "import { needle } from './x';"; // 10, nearest
    t[19] = 'needle();'; // 20
    expect(suggestRange(input({ texts: t, title: '`needle`', cited: r(13, 14) })).suggested).toEqual(r(20, 20));
  });
  it('equal count: a line inside a function beats a nearer top-level line, then nearest / lower applies', () => {
    const t = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    t[9] = 'needle();'; // 10, top-level, nearest
    t[19] = 'needle();'; // 20, inside function 18-25
    t[21] = 'needle();'; // 22, inside function 18-25, farther
    const analyze = stub({ functions: [{ name: 'f', start: 18, end: 25 }], blocks: [] });
    const out = suggestRange(input({ texts: t, title: '`needle`', cited: r(13, 14), analyze }));
    expect(out.reason.expanded_to_function).toEqual({ name: 'f' });
    expect(out.suggested).toEqual(r(18, 25));
    // without structure info nothing is "inside a function": the nearest line wins as before
    expect(suggestRange(input({ texts: t, title: '`needle`', cited: r(13, 14) })).suggested).toEqual(r(10, 10));
  });
  it('equal count, both inside functions: nearest wins', () => {
    const t = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    t[9] = 'needle();'; // 10
    t[19] = 'needle();'; // 20
    const analyze = stub({
      functions: [
        { name: 'a', start: 9, end: 11 },
        { name: 'b', start: 18, end: 25 },
      ],
      blocks: [],
    });
    const out = suggestRange(input({ texts: t, title: '`needle`', cited: r(13, 14), analyze }));
    expect(out.reason.expanded_to_function).toEqual({ name: 'a' });
    expect(out.suggested).toEqual(r(9, 11));
  });
  it('AC-11: must_not_flag never re-targets', () => {
    expect(suggestRange(input({ texts, title, type: 'must_not_flag', cited: r(6, 8) })).suggested).toEqual(r(6, 8));
  });
  it('AC-49: matching is case-sensitive and uses only new-side lines', () => {
    const t = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    t[15] = 'findUserbyemail'; // different case
    expect(suggestRange(input({ texts: t, title: 'findUserByEmail', cited: r(6, 8) })).suggested).toEqual(r(6, 8));
  });
  it('EC-16: a reversed cited range is normalised', () => {
    const out = suggestRange(input({ title: 'vague', cited: r(8, 6) }));
    expect(out.cited).toEqual(r(6, 8));
    expect(out.suggested).toEqual(r(6, 8));
  });
  it('NFR-1: same input, same output', () => {
    const i = input({ texts, title, cited: r(6, 8) });
    expect(JSON.stringify(suggestRange(i))).toBe(JSON.stringify(suggestRange(i)));
  });
});

describe('kinds (AC-44)', () => {
  it.each(['secret_leak', 'lethal_trifecta', 'phantom', 'hook'])('%s suggests the cited range as is', (kind) => {
    const t = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    t[15] = '`needle`';
    const out = suggestRange(input({ kind, texts: t, title: '`needle`', cited: r(6, 8), analyze: stub({ functions: [{ name: 'f', start: 1, end: 30 }], blocks: [] }) }));
    expect(out.suggested).toEqual(r(6, 8));
    expect(out.reason).toEqual({ terms: [], expanded_to_function: null, function_too_long: false, structure_available: true });
  });
});

describe('expansion (AC-10/12/13/30/42/45)', () => {
  const lines30 = mk(Array.from({ length: 30 }, (_, i) => `l${i + 1}`));
  const fnRoom = (functions: EvalStructure['functions'], blocks: EvalStructure['blocks'] = []) => stub({ functions, blocks });

  it('AC-10: expands to the innermost containing function, for both types', () => {
    const analyze = fnRoom([{ name: 'outer', start: 2, end: 28 }, { name: 'inner', start: 8, end: 14 }]);
    for (const type of ['must_find', 'must_not_flag'] as const) {
      const out = suggestRange(input({ type, lines: lines30, cited: r(10, 11), analyze }));
      expect(out.suggested).toEqual(r(8, 14));
      expect(out.reason.expanded_to_function).toEqual({ name: 'inner' });
    }
  });
  it('anonymous function keeps name null', () => {
    const out = suggestRange(input({ lines: lines30, cited: r(10, 10), analyze: fnRoom([{ name: null, start: 9, end: 12 }]) }));
    expect(out.reason.expanded_to_function).toEqual({ name: null });
  });
  it('AC-45: a range outside every function is not expanded', () => {
    const out = suggestRange(input({ lines: lines30, cited: r(20, 21), analyze: fnRoom([{ name: 'f', start: 2, end: 10 }]) }));
    expect(out.suggested).toEqual(r(20, 21));
    expect(out.reason.expanded_to_function).toBeNull();
  });
  it('a function must contain the starting range, up to 2 lines of spill past its edge', () => {
    const out = suggestRange(input({ lines: lines30, cited: r(9, 14), analyze: fnRoom([{ name: 'f', start: 2, end: 10 }]) }));
    expect(out.suggested).toEqual(r(9, 14)); // 4 lines past the end: too far to snap
  });
  it('spill: a citation 1-2 lines past the closing brace snaps to that function (both types)', () => {
    const analyze = fnRoom([{ name: 'f', start: 10, end: 13 }, { name: 'g', start: 15, end: 22 }]);
    for (const type of ['must_find', 'must_not_flag'] as const) {
      const out = suggestRange(input({ type, lines: lines30, cited: r(12, 14), analyze }));
      expect(out.suggested).toEqual(r(10, 13));
      expect(out.reason.expanded_to_function).toEqual({ name: 'f' });
    }
    expect(suggestRange(input({ lines: lines30, cited: r(22, 23), analyze })).suggested).toEqual(r(15, 22));
  });
  it('spill: more than half of the range outside the function does not snap', () => {
    const out = suggestRange(input({ lines: lines30, cited: r(13, 15), analyze: fnRoom([{ name: 'f', start: 10, end: 13 }]) }));
    expect(out.suggested).toEqual(r(13, 15)); // 1 line inside, 2 outside
  });
  it('AC-42: a function crossing the hunk bounds is truncated to the hunk', () => {
    const lines = [...mk(['a', 'b', 'c', 'd', 'e'], 10), ...mk(['x', 'y', 'z'], 40)];
    const hunks = [r(10, 14), r(40, 42)];
    const out = suggestRange(input({ lines, hunks, cited: r(12, 12), analyze: fnRoom([{ name: 'f', start: 1, end: 100 }]) }));
    expect(out.suggested).toEqual(r(10, 14)); // not the second hunk, not 1..100
  });
  it('AC-42: two hunks that contain the starting range give their union', () => {
    const lines = [...mk(['a', 'b', 'c'], 10), ...mk(['x', 'y', 'z'], 13)];
    const out = suggestRange(input({ lines, hunks: [r(10, 12), r(13, 15)], cited: r(12, 13), analyze: fnRoom([{ name: 'f', start: 1, end: 100 }]) }));
    expect(out.suggested).toEqual(r(10, 15));
  });
  it('AC-12: a function over 80 lines narrows to the largest block that fits and holds the range', () => {
    const lines = mk(Array.from({ length: 200 }, (_, i) => `l${i + 1}`));
    const analyze = fnRoom([{ name: 'big', start: 1, end: 200 }], [
      { start: 1, end: 200 }, { start: 50, end: 130 }, { start: 60, end: 100 }, { start: 70, end: 140 }, { start: 150, end: 160 },
    ]);
    const out = suggestRange(input({ lines, cited: r(75, 76), analyze }));
    // 50-130 spans 81 > 80; 70-140 spans 71; 60-100 spans 41
    expect(out.suggested).toEqual(r(70, 140));
    expect(out.reason.function_too_long).toBe(true);
    expect(out.reason.expanded_to_function).toBeNull();
  });
  it('AC-12: no block fits -> the starting range', () => {
    const lines = mk(Array.from({ length: 200 }, (_, i) => `l${i + 1}`));
    const out = suggestRange(input({ lines, cited: r(75, 76), analyze: fnRoom([{ name: 'big', start: 1, end: 200 }], [{ start: 1, end: 200 }]) }));
    expect(out.suggested).toEqual(r(75, 76));
    expect(out.reason.function_too_long).toBe(true);
  });
  it('AC-30: a starting range over 80 lines is neither expanded nor shortened', () => {
    const lines = mk(Array.from({ length: 200 }, (_, i) => `l${i + 1}`));
    const out = suggestRange(input({ lines, cited: r(10, 109), analyze: fnRoom([{ name: 'f', start: 1, end: 200 }]) }));
    expect(out.suggested).toEqual(r(10, 109));
  });
  it('AC-13: structure unavailable -> no expansion, re-targeting still applies, no error', () => {
    const t = Array.from({ length: 30 }, (_, i) => `l${i + 1}`);
    t[15] = 'call `needle`';
    const out = suggestRange(input({ texts: t, title: '`needle`', cited: r(6, 8), analyze: () => null }));
    expect(out.suggested).toEqual(r(16, 16));
    expect(out.reason.structure_available).toBe(false);
  });
  it('AC-5: a suggestion touching no hunk falls back to the cited range', () => {
    const out = suggestRange(input({ lines: lines30, hunks: [r(1, 5)], cited: r(20, 21), analyze: () => null }));
    expect(out.suggested).toEqual(r(20, 21));
  });
});
