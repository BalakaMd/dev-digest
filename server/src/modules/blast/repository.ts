import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { BlastPullContext, BlastRepositoryPort } from './types.js';

/** Blast data-access — the ONLY file in this module touching Drizzle. Workspace-scoped. */
export class BlastRepository implements BlastRepositoryPort {
  constructor(private db: Db) {}

  async getPullContext(workspaceId: string, prId: string): Promise<BlastPullContext | undefined> {
    const [row] = await this.db
      .select({
        prId: t.pullRequests.id,
        repoId: t.pullRequests.repoId,
        headSha: t.pullRequests.headSha,
      })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return undefined;
    const files = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(asc(t.prFiles.path));
    return { ...row, files: files.map((f) => f.path) };
  }
}
