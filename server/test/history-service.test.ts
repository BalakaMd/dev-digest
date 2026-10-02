import { describe, it, expect } from 'vitest';
import type { GitHubClient, PathPullHistory } from '@devdigest/shared';
import { PrHistoryResponse } from '@devdigest/shared';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import { HistoryService } from '../src/modules/history/service.js';
import { HISTORY_CACHE_TTL_MS } from '../src/modules/history/constants.js';
import type {
  HistoryLog,
  HistoryPullContext,
  HistoryRepositoryPort,
  HistoryServiceDeps,
} from '../src/modules/history/types.js';
import { ConfigError, NotFoundError } from '../src/platform/errors.js';

/**
 * Hermetic coverage of `HistoryService`: in-memory repository, MockGitHubClient
 * and a stubbed clock. The deps type has no LLM slot, so "no LLM" is structural.
 */

const WS = 'ws-1';
const PULL: HistoryPullContext = {
  prId: 'pr-1',
  repoId: 'repo-1',
  number: 7,
  base: 'feature-base',
  defaultBranch: 'main',
  repo: { owner: 'acme', name: 'api' },
  files: [{ path: 'src/a.ts', additions: 3, deletions: 1 }],
};

const HISTORY: PathPullHistory = {
  refFound: true,
  paths: [
    {
      path: 'src/a.ts',
      pulls: [{ number: 2, title: 'Older', mergedAt: '2026-01-01T00:00:00Z', author: 'dev', changedFiles: 2 }],
    },
  ],
};

function harness(opts: { pull?: HistoryPullContext | undefined; github?: MockGitHubClient; githubError?: Error } = {}) {
  const pull = 'pull' in opts ? opts.pull : PULL;
  const repo: HistoryRepositoryPort = {
    getPullContext: async (_ws, id) => (pull && pull.prId === id ? pull : undefined),
  };
  const mock = opts.github ?? new MockGitHubClient({ pathHistory: () => HISTORY });
  let clock = 1_000;
  const deps: HistoryServiceDeps = {
    repo,
    github: async () => {
      if (opts.githubError) throw opts.githubError;
      return mock as Pick<GitHubClient, 'listPathPullHistory'>;
    },
    now: () => clock,
  };
  const logs: Array<{ msg: string; data: unknown }> = [];
  const log: HistoryLog = { info: (msg, data) => void logs.push({ msg, data }) };
  return {
    svc: new HistoryService(deps),
    mock,
    logs,
    log,
    advance: (ms: number) => void (clock += ms),
  };
}

describe('HistoryService', () => {
  it('unknown pull → NotFoundError', async () => {
    const h = harness({ pull: undefined });
    await expect(h.svc.getForPull(WS, 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('no pr_files → degraded no_files, GitHub untouched', async () => {
    const h = harness({ pull: { ...PULL, files: [] } });
    const res = await h.svc.getForPull(WS, 'pr-1', h.log);
    expect(res).toEqual({ history: [], degraded: true, degraded_reason: 'no_files' });
    expect(h.mock.pathHistoryQueries).toHaveLength(0);
  });

  it('only noise files → empty, not degraded, GitHub untouched', async () => {
    const h = harness({ pull: { ...PULL, files: [{ path: 'pnpm-lock.yaml', additions: 9, deletions: 0 }] } });
    expect(await h.svc.getForPull(WS, 'pr-1')).toEqual({ history: [], degraded: false, degraded_reason: null });
    expect(h.mock.pathHistoryQueries).toHaveLength(0);
  });

  it('happy path: ranked items, contract-valid, one log line naming the source', async () => {
    const h = harness();
    const res = await h.svc.getForPull(WS, 'pr-1', h.log);
    expect(() => PrHistoryResponse.parse(res)).not.toThrow();
    expect(res.degraded).toBe(false);
    expect(res.history.map((i) => i.pr_number)).toEqual([2]);
    expect(h.mock.pathHistoryQueries[0]!.q).toMatchObject({ ref: 'feature-base', paths: ['src/a.ts'] });
    expect(h.logs).toHaveLength(1);
    expect(h.logs[0]!.msg).toBe('PR history: read from GitHub GraphQL (no LLM)');
    expect(h.logs[0]!.data).toMatchObject({ repoId: 'repo-1', ref: 'feature-base', filesQueried: 1, prsFound: 1, cached: false });
  });

  it('ConfigError → no_token; other throw → github_error; nothing escapes', async () => {
    const a = harness({ githubError: new ConfigError('no token') });
    expect(await a.svc.getForPull(WS, 'pr-1', a.log)).toMatchObject({ degraded: true, degraded_reason: 'no_token' });
    expect(a.logs[0]!.msg).toBe('PR history: not available');

    const b = harness({ githubError: new Error('boom') });
    expect(await b.svc.getForPull(WS, 'pr-1')).toMatchObject({ degraded_reason: 'github_error' });

    const c = harness({ github: new MockGitHubClient({ pathHistoryError: new Error('graphql down') }) });
    expect(await c.svc.getForPull(WS, 'pr-1', c.log)).toMatchObject({ degraded_reason: 'github_error' });
    expect(c.logs[0]!.data).toMatchObject({ reason: 'github_error', error: 'graphql down' });
  });

  it('refFound=false → one retry on the default branch', async () => {
    const github = new MockGitHubClient({
      pathHistory: (q) => (q.ref === 'main' ? HISTORY : { refFound: false, paths: [] }),
    });
    const h = harness({ github });
    const res = await h.svc.getForPull(WS, 'pr-1', h.log);
    expect(res.history).toHaveLength(1);
    expect(github.pathHistoryQueries.map((c) => c.q.ref)).toEqual(['feature-base', 'main']);
    expect(h.logs[0]!.data).toMatchObject({ ref: 'main' });
  });

  it('ref missing on both branches → github_error', async () => {
    const github = new MockGitHubClient({ pathHistory: () => ({ refFound: false, paths: [] }) });
    const h = harness({ github });
    expect(await h.svc.getForPull(WS, 'pr-1')).toMatchObject({ degraded: true, degraded_reason: 'github_error' });
    expect(github.pathHistoryQueries).toHaveLength(2);
  });

  it('caches successes for the TTL and refetches afterwards', async () => {
    const h = harness();
    await h.svc.getForPull(WS, 'pr-1');
    h.advance(HISTORY_CACHE_TTL_MS - 1);
    await h.svc.getForPull(WS, 'pr-1', h.log);
    expect(h.mock.pathHistoryQueries).toHaveLength(1);
    expect(h.logs[0]!.data).toMatchObject({ cached: true });
    h.advance(1);
    await h.svc.getForPull(WS, 'pr-1');
    expect(h.mock.pathHistoryQueries).toHaveLength(2);
  });

  it('does not cache degraded results', async () => {
    const github = new MockGitHubClient({ pathHistoryError: new Error('x') });
    const h = harness({ github });
    await h.svc.getForPull(WS, 'pr-1');
    await h.svc.getForPull(WS, 'pr-1');
    expect(github.pathHistoryQueries).toHaveLength(2);
  });
});
