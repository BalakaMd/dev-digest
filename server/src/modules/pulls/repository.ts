import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * pulls module data-access — read-only lookup by (repo, number). Not the whole
 * pulls surface: `routes.ts` still queries `container.db` directly for the
 * list/detail/comments routes (known onion deviation, left as-is).
 */

/** A single PR row shaped for `PullsService.lookup`; not `$inferSelect`. */
export interface PullRow {
  id: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  lastReviewedSha: string | null;
  additions: number;
  deletions: number;
  filesCount: number;
  /** GitHub merge state (open/merged/closed), as stored — not the derived PrStatus. */
  ghStatus: string;
  openedAt: Date | null;
  updatedAt: Date | null;
}

export class PullsRepository {
  constructor(private db: Db) {}

  /** Scoped by workspace AND repo, addressed by the PR's GitHub number. */
  async findByRepoAndNumber(
    workspaceId: string,
    repoId: string,
    number: number,
  ): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        author: t.pullRequests.author,
        branch: t.pullRequests.branch,
        base: t.pullRequests.base,
        headSha: t.pullRequests.headSha,
        lastReviewedSha: t.pullRequests.lastReviewedSha,
        additions: t.pullRequests.additions,
        deletions: t.pullRequests.deletions,
        filesCount: t.pullRequests.filesCount,
        ghStatus: t.pullRequests.status,
        openedAt: t.pullRequests.openedAt,
        updatedAt: t.pullRequests.updatedAt,
      })
      .from(t.pullRequests)
      .where(
        and(
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, repoId),
          eq(t.pullRequests.number, number),
        ),
      );
    return row;
  }
}
