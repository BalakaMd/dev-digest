import { describe, it, expect } from 'vitest';
import {
  buildOnboardingFacts,
  emptyOnboardingFacts,
  type OnboardingFactsInput,
} from '../src/modules/repo-intel/onboarding-facts.js';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';

/**
 * SPEC-03 AC-7 / AC-11 / AC-12 / AC-29 — the pure part of
 * `RepoIntel.getOnboardingFacts`. The reading path and the critical files are
 * chosen from the index WITHOUT the LLM, so the same rows in ANY order must
 * yield the same lists (rank DESC, equal ranks by path ASC).
 */

const isJunk = (p: string): boolean => /(^|\/)(test|tests|migrations)\//.test(p) || /\.(test|d)\.ts$/.test(p);

function input(over: Partial<OnboardingFactsInput> = {}): OnboardingFactsInput {
  return {
    ranked: [],
    edges: [],
    chains: [],
    isJunk,
    readingPath: 7,
    criticalPaths: 5,
    ...over,
  };
}

/** Deterministic Fisher–Yates so the "shuffled" input is reproducible. */
function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

describe('buildOnboardingFacts — reading path (AC-11, AC-12)', () => {
  const ranked = [
    { path: 'src/z.ts', rank: 0.5 },
    { path: 'src/a.ts', rank: 0.5 }, // tie with z → path ASC
    { path: 'src/core.ts', rank: 0.9 },
    { path: 'src/core.test.ts', rank: 0.8 }, // junk
    { path: 'types/api.d.ts', rank: 0.7 }, // junk
    { path: 'migrations/0001.ts', rank: 0.6 }, // junk
    { path: 'src/low.ts', rank: 0.1 },
    { path: 'src/mid.ts', rank: 0.3 },
    { path: 'src/b.ts', rank: 0.2 },
    { path: 'src/c.ts', rank: 0.15 },
    { path: 'src/d.ts', rank: 0.12 },
  ];

  it('takes the top 7 non-junk files by rank desc, ties by path asc', () => {
    const facts = buildOnboardingFacts(input({ ranked }));
    expect(facts.readingPath.map((r) => r.path)).toEqual([
      'src/core.ts',
      'src/a.ts',
      'src/z.ts',
      'src/mid.ts',
      'src/b.ts',
      'src/c.ts',
      'src/d.ts',
    ]);
    expect(facts.readingPath.some((r) => isJunk(r.path))).toBe(false);
  });

  it('lists every eligible file when fewer than 7 exist', () => {
    const facts = buildOnboardingFacts(
      input({
        ranked: [
          { path: 'src/a.ts', rank: 2 },
          { path: 'src/a.test.ts', rank: 9 },
          { path: 'src/b.ts', rank: 1 },
        ],
      }),
    );
    expect(facts.readingPath.map((r) => r.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('is identical for the same index in any input order', () => {
    const edges = [
      { fromFile: 'src/a.ts', toFile: 'src/core.ts' },
      { fromFile: 'src/b.ts', toFile: 'src/core.ts' },
    ];
    const chains = [['src/a.ts', 'src/core.ts'], ['src/z.ts', 'src/b.ts']];
    const base = buildOnboardingFacts(input({ ranked, edges, chains }));
    for (const seed of [1, 2, 3, 4]) {
      const again = buildOnboardingFacts(
        input({
          ranked: shuffled(ranked, seed),
          edges: shuffled(edges, seed),
          chains: shuffled(chains, seed),
        }),
      );
      expect(again).toEqual(base);
    }
  });
});

describe('buildOnboardingFacts — critical files (AC-7, AC-29)', () => {
  it('returns at most 5 distinct chain files, rank desc / path asc, with index counts', () => {
    const ranked = [
      { path: 'a.ts', rank: 5 },
      { path: 'b.ts', rank: 4 },
      { path: 'c.ts', rank: 4 }, // tie with b → path asc
      { path: 'd.ts', rank: 3 },
      { path: 'e.ts', rank: 2 },
      { path: 'f.ts', rank: 1 },
      { path: 'unchained.ts', rank: 100 }, // highest rank but in no chain
    ];
    const chains = [
      ['a.ts', 'b.ts', 'c.ts'],
      ['a.ts', 'd.ts'], // `a.ts` again → distinct
      ['e.ts', 'f.ts'],
    ];
    const edges = [
      { fromFile: 'a.ts', toFile: 'b.ts' },
      { fromFile: 'c.ts', toFile: 'b.ts' },
      { fromFile: 'd.ts', toFile: 'b.ts' },
      { fromFile: 'b.ts', toFile: 'e.ts' },
    ];
    const facts = buildOnboardingFacts(input({ ranked, chains, edges }));

    expect(facts.criticalPaths.map((r) => r.path)).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts']);
    const b = facts.criticalPaths.find((r) => r.path === 'b.ts')!;
    expect(b).toMatchObject({ importedBy: 3, imports: 1, rank: 4 });
    expect(facts.criticalPaths.find((r) => r.path === 'a.ts')).toMatchObject({
      importedBy: 0,
      imports: 1,
    });
  });

  it('yields no critical files when the index has no dependency chains', () => {
    const facts = buildOnboardingFacts(
      input({ ranked: [{ path: 'a.ts', rank: 1 }], chains: [] }),
    );
    expect(facts.criticalPaths).toEqual([]);
    expect(facts.readingPath).toHaveLength(1);
  });

  it('exposes every indexed path (the allow-list for AC-14), rank desc / path asc', () => {
    const facts = buildOnboardingFacts(
      input({
        ranked: [
          { path: 'b.ts', rank: 1 },
          { path: 'a.ts', rank: 1 },
          { path: 'c.ts', rank: 2 },
        ],
      }),
    );
    expect(facts.indexedPaths).toEqual(['c.ts', 'a.ts', 'b.ts']);
  });

  it('emptyOnboardingFacts has three empty lists', () => {
    expect(emptyOnboardingFacts()).toEqual({ indexedPaths: [], readingPath: [], criticalPaths: [] });
  });
});

/**
 * AC-11 regression — the REAL `isJunkPath` (via the facade, stubbed repository,
 * no DB). Root-level `test/…`, `tests/…`, `migrations/…` used to slip into the
 * reading path because the junk patterns are `/dir/` and the path had no
 * leading slash. Substring look-alikes (`contest`, `latest`) must stay eligible.
 */
describe('RepoIntelService.getOnboardingFacts — junk filtering of root-level dirs (AC-11)', () => {
  it('excludes root and nested test/tests/migrations paths, keeps look-alikes', async () => {
    const ranked = [
      { path: 'test/a.ts', rank: 9 },
      { path: 'tests/a.ts', rank: 8 },
      { path: 'migrations/0001.sql', rank: 7 },
      { path: 'src/test/a.ts', rank: 6 },
      { path: 'src/contest/a.ts', rank: 5 },
      { path: 'src/latest.ts', rank: 4 },
    ];
    const svc = new RepoIntelService({
      config: { repoIntelEnabled: true },
      db: {} as never,
    } as never);
    (svc as unknown as { repo: Record<string, unknown> }).repo = {
      getRankedPaths: async () => ranked,
      getEdges: async () => [],
    };

    const facts = await svc.getOnboardingFacts('r1', { readingPath: 7, criticalPaths: 5 });

    expect(facts.readingPath.map((r) => r.path)).toEqual(['src/contest/a.ts', 'src/latest.ts']);
    expect(facts.indexedPaths).toHaveLength(6); // allow-list is not junk-filtered
  });
});
