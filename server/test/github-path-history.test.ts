import { describe, it, expect } from 'vitest';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import {
  PATH_ALIASES_PER_QUERY,
  buildPathHistoryQuery,
  parsePathHistory,
} from '../src/adapters/github/path-history.js';

describe('buildPathHistoryQuery', () => {
  it('has one aliased history(path: $pN) per path and declares each variable', () => {
    const q = buildPathHistoryQuery(3);
    for (let i = 0; i < 3; i++) {
      expect(q).toContain(`h${i}: history(path: $p${i}, first: $n)`);
      expect(q).toContain(`$p${i}: String!`);
    }
    expect(q).not.toContain('$p3');
  });

  it('never contains a path literal (paths travel as variables only)', () => {
    const q = buildPathHistoryQuery(2);
    expect(q).not.toContain('src/');
    expect(q).not.toMatch(/history\(path: "/);
  });

  it('keeps the chunk size a named constant', () => {
    expect(PATH_ALIASES_PER_QUERY).toBeGreaterThan(0);
  });
});

describe('parsePathHistory', () => {
  const paths = ['a.ts', 'b.ts'];

  it('maps a null object to refFound=false with empty pulls per path', () => {
    const out = parsePathHistory({ repository: { object: null } }, paths);
    expect(out).toEqual({
      refFound: false,
      paths: [
        { path: 'a.ts', pulls: [] },
        { path: 'b.ts', pulls: [] },
      ],
    });
  });

  it('maps nested nodes to PathPull and null author to "unknown"', () => {
    const out = parsePathHistory(
      {
        repository: {
          object: {
            h0: {
              nodes: [
                {
                  associatedPullRequests: {
                    nodes: [
                      { number: 7, title: 'T', mergedAt: '2026-01-01T00:00:00Z', changedFiles: 3, author: { login: 'ann' } },
                      { number: 8, title: 'U', mergedAt: null, changedFiles: 1, author: null },
                    ],
                  },
                },
              ],
            },
            h1: null,
          },
        },
      },
      paths,
    );
    expect(out.refFound).toBe(true);
    expect(out.paths[0]!.pulls).toEqual([
      { number: 7, title: 'T', mergedAt: '2026-01-01T00:00:00Z', author: 'ann', changedFiles: 3 },
      { number: 8, title: 'U', mergedAt: null, author: 'unknown', changedFiles: 1 },
    ]);
    expect(out.paths[1]).toEqual({ path: 'b.ts', pulls: [] });
  });
});

describe('MockGitHubClient.listPathPullHistory', () => {
  const repo = { owner: 'a', name: 'b' };
  const q = { ref: 'main', paths: ['x.ts'], commitsPerPath: 5, pullsPerCommit: 2 };

  it('records queries and defaults to empty pulls', async () => {
    const gh = new MockGitHubClient();
    const out = await gh.listPathPullHistory(repo, q);
    expect(out).toEqual({ refFound: true, paths: [{ path: 'x.ts', pulls: [] }] });
    expect(gh.pathHistoryQueries).toEqual([{ repo, q }]);
  });

  it('honours pathHistoryError', async () => {
    const gh = new MockGitHubClient({ pathHistoryError: new Error('boom') });
    await expect(gh.listPathPullHistory(repo, q)).rejects.toThrow('boom');
    expect(gh.pathHistoryQueries).toHaveLength(1);
  });
});
