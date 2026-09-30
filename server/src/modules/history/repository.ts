import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { HistoryPullContext } from './types.js';

/**
 * History data-access — the ONLY file in this module touching Drizzle.
 * Workspace-scoped: the pull is looked up through `workspace_id`, its files by
 * the pull id that lookup returned.
 */
export class HistoryRepository {
  constructor(private db: Db) {}

  async getPullContext(workspaceId: string, prId: string): Promise<HistoryPullContext | undefined> {
    const [row] = await this.db
      .select({
        prId: t.pullRequests.id,
        repoId: t.pullRequests.repoId,
        number: t.pullRequests.number,
        base: t.pullRequests.base,
        owner: t.repos.owner,
        name: t.repos.name,
        defaultBranch: t.repos.defaultBranch,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return undefined;
    const files = await this.db
      .select({ path: t.prFiles.path, additions: t.prFiles.additions, deletions: t.prFiles.deletions })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(asc(t.prFiles.path));
    return {
      prId: row.prId,
      repoId: row.repoId,
      number: row.number,
      base: row.base,
      defaultBranch: row.defaultBranch,
      repo: { owner: row.owner, name: row.name },
      files,
    };
  }
}
