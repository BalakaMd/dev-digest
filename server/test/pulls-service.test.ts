/**
 * Unit test for `PullsService.lookup` (X1) — a fake repository object, no DB.
 * Covers the row → PrMeta mapping (derived status) and the not-found path.
 */
import { describe, it, expect } from 'vitest';
import { PullsService } from '../src/modules/pulls/service.js';
import type { PullRow } from '../src/modules/pulls/repository.js';
import { NotFoundError } from '../src/platform/errors.js';

const NOW = new Date('2026-06-10T00:00:00Z').getTime();

function fakeRepo(row: PullRow | undefined) {
  return { findByRepoAndNumber: async () => row };
}

const baseRow: PullRow = {
  id: 'pr-1',
  number: 482,
  title: 'Add rate limiting',
  author: 'marisa.koch',
  branch: 'feat/rate-limit',
  base: 'main',
  headSha: 'abc123',
  lastReviewedSha: null,
  additions: 10,
  deletions: 2,
  filesCount: 3,
  ghStatus: 'open',
  openedAt: new Date('2026-06-01T00:00:00Z'),
  updatedAt: new Date('2026-06-02T00:00:00Z'),
};

describe('PullsService.lookup', () => {
  it('maps a row to PrMeta and derives status for a never-reviewed open PR', async () => {
    const service = new PullsService({ repo: fakeRepo(baseRow) as never, now: () => NOW });
    const meta = await service.lookup('ws-1', 'repo-1', 482);
    expect(meta).toMatchObject({
      id: 'pr-1',
      number: 482,
      title: 'Add rate limiting',
      status: 'needs_review',
      opened_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-02T00:00:00.000Z',
    });
  });

  it('derives "reviewed" when the last-reviewed sha matches head and is recent', async () => {
    const row: PullRow = { ...baseRow, lastReviewedSha: baseRow.headSha };
    const recentNow = new Date('2026-06-02T01:00:00Z').getTime();
    const service = new PullsService({ repo: fakeRepo(row) as never, now: () => recentNow });
    const meta = await service.lookup('ws-1', 'repo-1', 482);
    expect(meta.status).toBe('reviewed');
  });

  it('throws NotFoundError when no row matches', async () => {
    const service = new PullsService({ repo: fakeRepo(undefined) as never, now: () => NOW });
    await expect(service.lookup('ws-1', 'repo-1', 999)).rejects.toThrow(NotFoundError);
  });
});
