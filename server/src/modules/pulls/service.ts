import type { PrMeta } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { deriveReviewStatus } from './status.js';
import type { PullsRepository } from './repository.js';

/**
 * pulls module service — currently the single read `lookup` used by
 * `GET /repos/:id/pulls/:number` (X1). It exists so the route never touches
 * `container.db`, per onion-architecture rules/fastify.md. The rest of the
 * pulls surface (list/detail/comments) still lives directly in `routes.ts`
 * (known onion deviation, not fixed here).
 */
export interface PullsServiceDeps {
  repo: PullsRepository;
  now: () => number;
}

export class PullsService {
  constructor(private deps: PullsServiceDeps) {}

  /**
   * Resolve a PR by (workspace, repo, GitHub number). `score`/`cost_usd`/
   * `findings_counts` are left out — they are list-endpoint-only rollups
   * (nullish in `PrMeta`), computed in `GET /repos/:id/pulls`, not here.
   */
  async lookup(workspaceId: string, repoId: string, number: number): Promise<PrMeta> {
    const row = await this.deps.repo.findByRepoAndNumber(workspaceId, repoId, number);
    if (!row) throw new NotFoundError('Pull request not found');
    return {
      id: row.id,
      number: row.number,
      title: row.title,
      author: row.author,
      branch: row.branch,
      base: row.base,
      head_sha: row.headSha,
      additions: row.additions,
      deletions: row.deletions,
      files_count: row.filesCount,
      status: deriveReviewStatus({
        ghStatus: row.ghStatus,
        lastReviewedSha: row.lastReviewedSha,
        headSha: row.headSha,
        updatedAt: row.updatedAt,
        now: this.deps.now(),
      }),
      opened_at: row.openedAt?.toISOString() ?? null,
      updated_at: row.updatedAt?.toISOString() ?? null,
    };
  }
}
