import { describe, it, expect } from 'vitest';
import { PrBlastRadiusResponse } from '@devdigest/shared';
import { BlastService } from '../src/modules/blast/service.js';
import type {
  BlastLog,
  BlastPullContext,
  BlastRepositoryPort,
  BlastServiceDeps,
} from '../src/modules/blast/types.js';
import { NotFoundError } from '../src/platform/errors.js';
import { MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/constants.js';
import type { BlastResult, IndexState } from '../src/modules/repo-intel/types.js';

/**
 * Hermetic coverage of `BlastService`: an in-memory repository and a fake
 * repo-intel facade. The deps type has no LLM or GitHub slot at all, so the
 * "no LLM in the main path" guarantee is structural; this suite also asserts
 * the service touches nothing but the two facade reads it is given.
 */

const WS = 'ws-1';
const PULL: BlastPullContext = {
  prId: 'pr-1',
  repoId: 'repo-1',
  headSha: 'head-sha',
  files: ['src/ctx.ts'],
};

class FakeRepo implements BlastRepositoryPort {
  calls: Array<[string, string]> = [];
  constructor(private pull: BlastPullContext | undefined = PULL) {}
  async getPullContext(workspaceId: string, prId: string) {
    this.calls.push([workspaceId, prId]);
    return this.pull && this.pull.prId === prId ? this.pull : undefined;
  }
}

function indexState(over: Partial<IndexState> = {}): IndexState {
  return {
    repoId: PULL.repoId,
    status: 'full',
    filesIndexed: 10,
    filesSkipped: 0,
    durationMs: 1,
    lastIndexedSha: 'indexed-sha',
    indexerVersion: 2,
    updatedAt: new Date(0),
    ...over,
  };
}

const SOME_RESULT: BlastResult = {
  changedSymbols: [{ name: 'getContext', file: 'src/ctx.ts', kind: 'function' }],
  callers: [{ file: 'src/a.ts', symbol: 'listA', viaSymbol: 'getContext', line: 12, rank: 0.4 }],
  impactedEndpoints: ['GET /a'],
  factsByFile: { 'src/a.ts': { endpoints: ['GET /a'], crons: ['@daily'] } },
  degraded: false,
};

interface Harness {
  service: BlastService;
  repo: FakeRepo;
  facadeCalls: { state: string[]; blast: Array<[string, string[]]> };
  logs: Array<{ msg: string; data?: unknown }>;
  log: BlastLog;
}

function harness(opts: {
  state?: IndexState;
  result?: BlastResult;
  enabled?: boolean;
  pull?: BlastPullContext | undefined;
} = {}): Harness {
  const repo = new FakeRepo('pull' in opts ? opts.pull : PULL);
  const facadeCalls: Harness['facadeCalls'] = { state: [], blast: [] };
  const deps: BlastServiceDeps = {
    repo,
    repoIntelEnabled: opts.enabled ?? true,
    repoIntel: {
      getIndexState: async (repoId: string) => {
        facadeCalls.state.push(repoId);
        return opts.state ?? indexState();
      },
      getBlastRadius: async (repoId: string, files: string[]) => {
        facadeCalls.blast.push([repoId, files]);
        return opts.result ?? SOME_RESULT;
      },
    },
  };
  const logs: Harness['logs'] = [];
  const log: BlastLog = { info: (msg, data) => void logs.push({ msg, data }) };
  return { service: new BlastService(deps), repo, facadeCalls, logs, log };
}

describe('BlastService.getForPull — happy path', () => {
  it('reads the index once, maps the result and returns a contract-valid response', async () => {
    const h = harness();
    const res = await h.service.getForPull(WS, 'pr-1', h.log);

    expect(h.facadeCalls.blast).toEqual([['repo-1', ['src/ctx.ts']]]);
    expect(res.degraded).toBe(false);
    expect(res.degraded_reason).toBeNull();
    expect(res.indexed_sha).toBe('indexed-sha');
    expect(res.changed_symbols).toEqual([{ name: 'getContext', file: 'src/ctx.ts', kind: 'function' }]);
    expect(res.downstream).toEqual([
      {
        symbol: 'getContext',
        callers: [{ name: 'listA', file: 'src/a.ts', line: 12 }],
        endpoints_affected: ['GET /a'],
        crons_affected: ['@daily'],
      },
    ]);
    expect(res.summary).toBe('1 changed symbol · 1 caller · 1 endpoint · 1 cron/job');
    expect(() => PrBlastRadiusResponse.parse(res)).not.toThrow();
  });

  it('scopes the pull lookup to the workspace', async () => {
    const h = harness();
    await h.service.getForPull(WS, 'pr-1', h.log);
    expect(h.repo.calls).toEqual([[WS, 'pr-1']]);
  });

  it('caps callers per symbol at the repo-intel constant', async () => {
    const callers = Array.from({ length: MAX_CALLERS_PER_SYMBOL + 7 }, (_, i) => ({
      file: `src/c${i}.ts`,
      symbol: `fn${i}`,
      viaSymbol: 'getContext',
      line: i + 1,
      rank: 1 - i / 1000,
    }));
    const h = harness({ result: { ...SOME_RESULT, callers, factsByFile: {} } });
    const res = await h.service.getForPull(WS, 'pr-1', h.log);
    expect(res.downstream[0]!.callers).toHaveLength(MAX_CALLERS_PER_SYMBOL);
  });

  it('drops a caller that lives in the file declaring the symbol', async () => {
    const h = harness({
      result: {
        ...SOME_RESULT,
        callers: [
          { file: 'src/ctx.ts', symbol: 'self', viaSymbol: 'getContext', line: 99, rank: 0.9 },
          ...SOME_RESULT.callers,
        ],
      },
    });
    const res = await h.service.getForPull(WS, 'pr-1', h.log);
    expect(res.downstream[0]!.callers.map((c) => c.file)).toEqual(['src/a.ts']);
  });

  it('logs exactly one line, saying the persisted index was read', async () => {
    const h = harness();
    await h.service.getForPull(WS, 'pr-1', h.log);
    expect(h.logs).toHaveLength(1);
    expect(h.logs[0]!.msg).toBe('Blast radius: read from persisted index');
    expect(h.logs[0]!.data).toMatchObject({
      repoId: 'repo-1',
      indexStatus: 'full',
      indexedSha: 'indexed-sha',
      changedFiles: 1,
      symbols: 1,
      callers: 1,
      endpoints: 1,
      crons: 1,
      degraded: false,
      reason: null,
    });
  });

  it('works without a logger', async () => {
    const h = harness();
    await expect(h.service.getForPull(WS, 'pr-1')).resolves.toMatchObject({ degraded: false });
  });
});

describe('BlastService.getForPull — degradation reaches the response', () => {
  it('flag off: facade never called, empty map, flag_off', async () => {
    const h = harness({ enabled: false });
    const res = await h.service.getForPull(WS, 'pr-1', h.log);

    expect(h.facadeCalls.state).toEqual([]);
    expect(h.facadeCalls.blast).toEqual([]);
    expect(res).toMatchObject({
      changed_symbols: [],
      downstream: [],
      degraded: true,
      degraded_reason: 'flag_off',
      indexed_sha: null,
    });
    expect(() => PrBlastRadiusResponse.parse(res)).not.toThrow();
    expect(h.logs.map((l) => l.msg)).toEqual(['Blast radius: index not usable, nothing read']);
  });

  it.each([
    ['degraded, no stated reason', indexState({ status: 'degraded' }), 'no_data'],
    ['failed', indexState({ status: 'failed', degraded: true }), 'index_failed'],
    [
      'degraded with a stated reason',
      indexState({ status: 'degraded', degradedReason: 'repo_too_large' }),
      'repo_too_large',
    ],
  ] as const)('%s index: getBlastRadius is NOT called, empty map + reason %s', async (_n, state, reason) => {
    const h = harness({ state });
    const res = await h.service.getForPull(WS, 'pr-1', h.log);

    expect(h.facadeCalls.state).toEqual(['repo-1']);
    expect(h.facadeCalls.blast).toEqual([]);
    expect(res).toMatchObject({
      changed_symbols: [],
      downstream: [],
      degraded: true,
      degraded_reason: reason,
      indexed_sha: null,
    });
    expect(h.logs).toEqual([
      { msg: 'Blast radius: index not usable, nothing read', data: { repoId: 'repo-1', reason } },
    ]);
  });

  it('partial index: facade called once, response carries index_partial together with the map', async () => {
    const h = harness({ state: indexState({ status: 'partial' }) });
    const res = await h.service.getForPull(WS, 'pr-1', h.log);

    expect(h.facadeCalls.blast).toHaveLength(1);
    expect(res.degraded).toBe(true);
    expect(res.degraded_reason).toBe('index_partial');
    expect(res.downstream).toHaveLength(1);
    expect(res.indexed_sha).toBe('indexed-sha');
  });

  it('a degraded facade result passes its reason through', async () => {
    const h = harness({
      result: { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: 'repo_too_large' },
    });
    const res = await h.service.getForPull(WS, 'pr-1', h.log);
    expect(res.degraded).toBe(true);
    expect(res.degraded_reason).toBe('repo_too_large');
  });

  it('a blank indexed sha is reported as null, not an empty string', async () => {
    const h = harness({ state: indexState({ lastIndexedSha: '' }) });
    const res = await h.service.getForPull(WS, 'pr-1', h.log);
    expect(res.indexed_sha).toBeNull();
  });
});

describe('BlastService.getForPull — edge cases', () => {
  it('unknown PR → NotFoundError, and nothing is read from the index', async () => {
    const h = harness({ pull: undefined });
    await expect(h.service.getForPull(WS, 'nope', h.log)).rejects.toBeInstanceOf(NotFoundError);
    expect(h.facadeCalls.state).toEqual([]);
    expect(h.facadeCalls.blast).toEqual([]);
  });

  it('a PR with no changed files gets an empty, non-degraded map without calling the facade', async () => {
    const h = harness({ pull: { ...PULL, files: [] } });
    const res = await h.service.getForPull(WS, 'pr-1', h.log);
    expect(h.facadeCalls.blast).toEqual([]);
    expect(res).toMatchObject({
      changed_symbols: [],
      downstream: [],
      degraded: false,
      degraded_reason: null,
      indexed_sha: 'indexed-sha',
    });
  });

  it('a PR with no changed files on a partial index still shows the index_partial marker', async () => {
    const h = harness({ pull: { ...PULL, files: [] }, state: indexState({ status: 'partial' }) });
    const res = await h.service.getForPull(WS, 'pr-1', h.log);
    expect(h.facadeCalls.blast).toEqual([]);
    expect(res).toMatchObject({ degraded: true, degraded_reason: 'index_partial' });
  });
});
