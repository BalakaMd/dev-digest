import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** The slice of a `repos` row the context-docs module needs. */
export interface ContextDocsRepo {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
  cloned: boolean;
}

/** Data access for the context-docs module: only the workspace-scoped `repos` lookup. */
export class ContextDocsRepository {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, id: string): Promise<ContextDocsRepo | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        defaultBranch: t.repos.defaultBranch,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id)));
    if (!row) return undefined;
    return {
      id: row.id,
      owner: row.owner,
      name: row.name,
      defaultBranch: row.defaultBranch,
      cloned: row.clonePath != null,
    };
  }
}
