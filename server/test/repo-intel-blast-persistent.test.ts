import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { BFS_DEPTH, MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/constants.js';
import type {
  FullSymbolRow,
  IndexerEdgeRow,
  IndexerFileFactsRow,
  ResolvedCallerRow,
} from '../src/modules/repo-intel/repository.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';

/**
 * Persistent-index blast path of the repo-intel facade (`getBlastRadius` when
 * a usable index exists): per-symbol caller cap and endpoint/cron reach through
 * importers within `BFS_DEPTH`. No Postgres — the service's `repo` is patched
 * with in-memory rows, the same way `repo-intel-facade-degraded.test.ts` does.
 */

interface Fixture {
  symbols?: FullSymbolRow[];
  callers?: ResolvedCallerRow[];
  /** importer -> imported */
  edges?: IndexerEdgeRow[];
  facts?: IndexerFileFactsRow[];
  status?: IndexState['status'];
}

function sym(path: string, name: string, line = 1): FullSymbolRow {
  return { path, name, kind: 'function', line, endLine: line + 5, exported: true, signature: null };
}

function build(fx: Fixture): { svc: RepoIntelService } {
  const container = {
    config: { repoIntelEnabled: true },
    db: {} as never,
    codeIndex: {
      symbols: async () => {
        throw new Error('the ripgrep fallback must not run on the persistent path');
      },
      references: async () => {
        throw new Error('the ripgrep fallback must not run on the persistent path');
      },
    } as never,
  } as never;
  const svc = new RepoIntelService(container);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    tryGetIndexState: async () =>
      ({
        repoId: 'r1',
        status: fx.status ?? 'full',
        filesIndexed: 1,
        filesSkipped: 0,
        durationMs: 0,
        lastIndexedSha: 'sha',
        indexerVersion: 2,
        updatedAt: new Date(0),
      }) satisfies IndexState,
    getSymbolRows: async (_r: string, paths: string[]) =>
      (fx.symbols ?? []).filter((s) => paths.includes(s.path)),
    getResolvedCallers: async () => fx.callers ?? [],
    getImporters: async (_r: string, files: string[]) => {
      return (fx.edges ?? []).filter((e) => files.includes(e.toFile));
    },
    getFileFacts: async (_r: string, files: string[]) =>
      (fx.facts ?? []).filter((f) => files.includes(f.filePath)),
  };
  return { svc };
}

describe('persistent blast — per-symbol caller cap', () => {
  it('caps each changed symbol at MAX_CALLERS_PER_SYMBOL instead of capping the flat list', async () => {
    const changed = 'src/ctx.ts';
    const aCallers: ResolvedCallerRow[] = Array.from({ length: MAX_CALLERS_PER_SYMBOL + 5 }, (_, i) => ({
      fromPath: `src/a-${String(i).padStart(2, '0')}.ts`,
      toSymbol: 'symA',
      line: 3,
      rank: 1 - i / 100,
    }));
    const bCallers: ResolvedCallerRow[] = Array.from({ length: 3 }, (_, i) => ({
      fromPath: `src/b-${i}.ts`,
      toSymbol: 'symB',
      line: 4,
      rank: 0.001, // lower than every symA caller: a global cap would starve symB
    }));
    const { svc } = build({
      symbols: [sym(changed, 'symA'), sym(changed, 'symB', 20)],
      callers: [...aCallers, ...bCallers],
    });

    const res = await svc.getBlastRadius('r1', [changed]);

    const count = (via: string) => res.callers.filter((c) => c.viaSymbol === via).length;
    expect(count('symA')).toBe(MAX_CALLERS_PER_SYMBOL);
    expect(count('symB')).toBe(3);
    expect(res.callers).toHaveLength(MAX_CALLERS_PER_SYMBOL + 3);
    expect(res.degraded).toBe(false);
  });

  it('keeps the highest-ranked callers of a symbol when it is capped', async () => {
    const callers: ResolvedCallerRow[] = Array.from({ length: MAX_CALLERS_PER_SYMBOL + 1 }, (_, i) => ({
      fromPath: `src/c-${i}.ts`,
      toSymbol: 'symA',
      line: 1,
      rank: i, // c-<max> is the best, c-0 the worst
    }));
    const { svc } = build({ symbols: [sym('src/ctx.ts', 'symA')], callers });

    const res = await svc.getBlastRadius('r1', ['src/ctx.ts']);

    const files = res.callers.map((c) => c.file);
    expect(files).toContain(`src/c-${MAX_CALLERS_PER_SYMBOL}.ts`);
    expect(files).not.toContain('src/c-0.ts');
  });
});

describe('persistent blast — endpoint/cron reach within BFS_DEPTH', () => {
  // svc.ts (caller of the changed symbol) <- routes.ts <- app.ts
  const symbols = [sym('src/ctx.ts', 'getContext'), sym('src/svc.ts', 'listThings', 3)];
  const callers: ResolvedCallerRow[] = [{ fromPath: 'src/svc.ts', toSymbol: 'getContext', line: 5, rank: 0.5 }];
  const edges: IndexerEdgeRow[] = [
    { fromFile: 'src/svc.ts', toFile: 'src/ctx.ts' },
    { fromFile: 'src/routes.ts', toFile: 'src/svc.ts' }, // 1 import hop from the caller file
    { fromFile: 'src/app.ts', toFile: 'src/routes.ts' }, // 2 import hops from the caller file
  ];
  const facts: IndexerFileFactsRow[] = [
    { filePath: 'src/svc.ts', endpoints: ['GET /direct'], crons: [] },
    { filePath: 'src/routes.ts', endpoints: ['GET /things'], crons: ['@hourly'] },
    { filePath: 'src/app.ts', endpoints: ['GET /too-far'], crons: ['@too-far'] },
  ];

  it('BFS_DEPTH is the documented 2 (caller file + its direct importers)', () => {
    expect(BFS_DEPTH).toBe(2);
  });

  it('includes the caller file and its direct importers, excludes files beyond BFS_DEPTH', async () => {
    const { svc } = build({ symbols, callers, edges, facts });
    const res = await svc.getBlastRadius('r1', ['src/ctx.ts']);

    expect(res.reachableFactsByFile).toEqual({
      'src/svc.ts': { endpoints: ['GET /direct', 'GET /things'], crons: ['@hourly'] },
    });
    expect(JSON.stringify(res.reachableFactsByFile)).not.toContain('too-far');
  });

  it('keeps factsByFile and impactedEndpoints as the direct caller-file facts only', async () => {
    const { svc } = build({ symbols, callers, edges, facts });
    const res = await svc.getBlastRadius('r1', ['src/ctx.ts']);

    expect(res.factsByFile).toEqual({ 'src/svc.ts': { endpoints: ['GET /direct'], crons: [] } });
    expect(res.impactedEndpoints).toEqual(['GET /direct']);
  });

  it('survives an import cycle and does not count the caller file twice', async () => {
    const cyclic: IndexerEdgeRow[] = [
      ...edges,
      { fromFile: 'src/svc.ts', toFile: 'src/routes.ts' }, // svc <-> routes
    ];
    const { svc } = build({ symbols, callers, edges: cyclic, facts });
    const res = await svc.getBlastRadius('r1', ['src/ctx.ts']);

    expect(res.reachableFactsByFile!['src/svc.ts']).toEqual({
      endpoints: ['GET /direct', 'GET /things'],
      crons: ['@hourly'],
    });
  });

  it('attributes reach per caller file (a sibling caller does not inherit another file\'s importers)', async () => {
    const twoCallers: ResolvedCallerRow[] = [
      ...callers,
      { fromPath: 'src/other.ts', toSymbol: 'getContext', line: 2, rank: 0.4 },
    ];
    const { svc } = build({
      symbols: [...symbols, sym('src/other.ts', 'otherFn')],
      callers: twoCallers,
      edges,
      facts,
    });
    const res = await svc.getBlastRadius('r1', ['src/ctx.ts']);

    expect(res.reachableFactsByFile!['src/other.ts']).toEqual({ endpoints: [], crons: [] });
    expect(res.reachableFactsByFile!['src/svc.ts']!.endpoints).toContain('GET /things');
  });

  it('a caller with no importers and no facts still gets an (empty) entry', async () => {
    const { svc } = build({ symbols, callers, edges: [], facts: [] });
    const res = await svc.getBlastRadius('r1', ['src/ctx.ts']);
    expect(res.reachableFactsByFile).toEqual({ 'src/svc.ts': { endpoints: [], crons: [] } });
  });
});
