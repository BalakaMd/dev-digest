import { describe, expect, it, vi } from 'vitest';
import { actOnFinding } from '../src/modules/reviews/findings.js';
import type { ReviewRepository } from '../src/modules/reviews/repository.js';
import { AppError, NotFoundError } from '../src/platform/errors.js';

const row = { id: 'f1', reviewId: 'r1' };
function fakeRepo(workspaceId = 'w1') {
  const calls: string[] = [];
  const repo = {
    findingContext: vi.fn(async () => ({ pull: { workspaceId } })),
    setFindingAccepted: vi.fn(async () => (calls.push('accepted'), row)),
    setFindingDismissed: vi.fn(async () => (calls.push('dismissed'), row)),
  };
  return { repo: repo as unknown as ReviewRepository, calls };
}

describe('actOnFinding decision observer', () => {
  it('notifies with accepted after the accept is stored', async () => {
    const { repo, calls } = fakeRepo();
    const seen: unknown[] = [];
    const obs = vi.fn(async (e: unknown) => { seen.push([...calls], e); });
    await actOnFinding(repo, 'w1', 'f1', 'accept', obs);
    expect(obs).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([['accepted'], { workspaceId: 'w1', findingId: 'f1', decision: 'accepted' }]);
  });

  it('notifies with dismissed after the dismiss is stored', async () => {
    const { repo, calls } = fakeRepo();
    const seen: unknown[] = [];
    await actOnFinding(repo, 'w1', 'f1', 'dismiss', async (e) => { seen.push([...calls], e); });
    expect(seen).toEqual([['dismissed'], { workspaceId: 'w1', findingId: 'f1', decision: 'dismissed' }]);
  });

  it('does not notify for a foreign workspace (404) or a non-decision action (400)', async () => {
    const obs = vi.fn(async () => undefined);
    await expect(actOnFinding(fakeRepo('other').repo, 'w1', 'f1', 'accept', obs)).rejects.toBeInstanceOf(NotFoundError);
    await expect(actOnFinding(fakeRepo().repo, 'w1', 'f1', 'learn', obs)).rejects.toBeInstanceOf(AppError);
    expect(obs).not.toHaveBeenCalled();
  });

  it('propagates an observer error', async () => {
    const { repo } = fakeRepo();
    await expect(
      actOnFinding(repo, 'w1', 'f1', 'accept', async () => { throw new Error('sync failed'); }),
    ).rejects.toThrow('sync failed');
  });

  it('works without an observer', async () => {
    const { repo } = fakeRepo();
    await expect(actOnFinding(repo, 'w1', 'f1', 'accept')).resolves.toBeDefined();
  });
});
