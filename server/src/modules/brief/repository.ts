import { and, asc, eq } from 'drizzle-orm';
import { PrBrief, TourLanguage } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { TOUR_LANGUAGE_KEY } from './constants.js';
import type { BriefRepositoryPort, PullFacts } from './types.js';

/**
 * Brief data-access — the only file of this module touching Drizzle.
 * `pr_brief` carries no `workspace_id`: every method is scoped through a join
 * on (or an ownership check against) `pull_requests`.
 */
export class BriefRepository implements BriefRepositoryPort {
  constructor(private db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<PullFacts | undefined> {
    const [row] = await this.db
      .select({
        prId: t.pullRequests.id,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        body: t.pullRequests.body,
        headSha: t.pullRequests.headSha,
        repoId: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return undefined;
    const files = await this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
        patch: t.prFiles.patch,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(asc(t.prFiles.path));
    return {
      prId: row.prId,
      number: row.number,
      title: row.title,
      body: row.body,
      headSha: row.headSha,
      repo: { id: row.repoId, owner: row.owner, name: row.name },
      files,
    };
  }

  async getHeadSha(workspaceId: string, prId: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ headSha: t.pullRequests.headSha })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row?.headSha;
  }

  async getStored(workspaceId: string, prId: string): Promise<PrBrief | undefined> {
    const [row] = await this.db
      .select({ json: t.prBrief.json })
      .from(t.prBrief)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prBrief.prId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.prBrief.prId, prId)));
    if (!row) return undefined;
    // jsonb is a cast, not a guarantee — an old-shape row reads as "no brief".
    const parsed = PrBrief.safeParse(row.json);
    return parsed.success ? parsed.data : undefined;
  }

  async save(workspaceId: string, prId: string, brief: PrBrief): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [owned] = await tx
        .select({ id: t.pullRequests.id })
        .from(t.pullRequests)
        .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
      if (!owned) return false;
      await tx
        .insert(t.prBrief)
        .values({ prId, json: brief })
        .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: brief } });
      return true;
    });
  }

  async getTourLanguage(workspaceId: string): Promise<TourLanguage | undefined> {
    const [row] = await this.db
      .select({ value: t.settings.value })
      .from(t.settings)
      .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, TOUR_LANGUAGE_KEY)));
    const parsed = TourLanguage.safeParse(row?.value);
    return parsed.success ? parsed.data : undefined;
  }
}
