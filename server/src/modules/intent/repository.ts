import { and, eq } from 'drizzle-orm';
import { IntentSource, type IntentConfidence } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullContext, StoredIntentFields, UpsertIntentValues } from './types.js';

/**
 * Intent data-access — the ONLY file in this module touching Drizzle. Every
 * method is workspace-scoped through a join on `pull_requests` (`pr_intent`
 * itself carries no `workspace_id`). Rows are mapped to contract fields
 * (`intent` column → `summary`); `stale` is NOT computed here — the service
 * compares against `currentHeadSha` (the caller already read the pull row).
 */

/** Deliberately re-validate persisted JSON on the way out (`jsonb.$type<unknown[]>()` is a cast, not a guarantee). */
function mapSources(raw: unknown): IntentSource[] {
  const parsed = IntentSource.array().safeParse(raw);
  return parsed.success ? parsed.data : [];
}

function mapRow(row: typeof t.prIntent.$inferSelect): StoredIntentFields {
  return {
    pr_id: row.prId,
    summary: row.intent,
    in_scope: row.inScope ?? [],
    out_of_scope: row.outOfScope ?? [],
    confidence: row.confidence as IntentConfidence,
    sources: mapSources(row.sources),
    head_sha: row.headSha,
    provider: row.provider,
    model: row.model,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
    derived_at: row.derivedAt.toISOString(),
  };
}

export class IntentRepository {
  constructor(private db: Db) {}

  /** The pull's title/body/head SHA + repo ref + changed files (path, patch), workspace-scoped. */
  async getPullContext(workspaceId: string, prId: string): Promise<PullContext | undefined> {
    const [row] = await this.db
      .select({
        prId: t.pullRequests.id,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        body: t.pullRequests.body,
        headSha: t.pullRequests.headSha,
        owner: t.repos.owner,
        name: t.repos.name,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return undefined;
    const files = await this.db
      .select({ path: t.prFiles.path, patch: t.prFiles.patch })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return {
      prId: row.prId,
      number: row.number,
      title: row.title,
      body: row.body,
      headSha: row.headSha,
      repo: { owner: row.owner, name: row.name },
      files,
    };
  }

  /**
   * Lean existence check + current head SHA, workspace-scoped. Callers use
   * this to tell "no PR" (→ 404) apart from "PR exists, no intent yet" (→
   * `{ intent: null }`), and to compute staleness without re-fetching title/
   * body/files.
   */
  async getPullHeadSha(workspaceId: string, prId: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ headSha: t.pullRequests.headSha })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row?.headSha;
  }

  /** The stored intent, if any, workspace-scoped through a join on `pull_requests`. */
  async getIntent(workspaceId: string, prId: string): Promise<StoredIntentFields | undefined> {
    const [row] = await this.db
      .select({ intent: t.prIntent })
      .from(t.prIntent)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prIntent.prId))
      .where(and(eq(t.prIntent.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)));
    return row ? mapRow(row.intent) : undefined;
  }

  /**
   * Insert-or-replace the PR's intent. Ownership is checked inside this
   * transaction (not left to the caller): `prId` must belong to
   * `workspaceId`, or nothing is written and `undefined` is returned.
   */
  async upsert(
    workspaceId: string,
    prId: string,
    values: UpsertIntentValues,
  ): Promise<StoredIntentFields | undefined> {
    return this.db.transaction(async (tx) => {
      const [owned] = await tx
        .select({ id: t.pullRequests.id })
        .from(t.pullRequests)
        .where(and(eq(t.pullRequests.id, prId), eq(t.pullRequests.workspaceId, workspaceId)));
      if (!owned) return undefined;

      const [row] = await tx
        .insert(t.prIntent)
        .values({
          prId,
          intent: values.summary,
          inScope: values.inScope,
          outOfScope: values.outOfScope,
          confidence: values.confidence,
          sources: values.sources,
          headSha: values.headSha,
          provider: values.provider,
          model: values.model,
          tokensIn: values.tokensIn,
          tokensOut: values.tokensOut,
          costUsd: values.costUsd,
          promptTokensEst: values.promptTokensEst,
          derivedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: t.prIntent.prId,
          set: {
            intent: values.summary,
            inScope: values.inScope,
            outOfScope: values.outOfScope,
            confidence: values.confidence,
            sources: values.sources,
            headSha: values.headSha,
            provider: values.provider,
            model: values.model,
            tokensIn: values.tokensIn,
            tokensOut: values.tokensOut,
            costUsd: values.costUsd,
            promptTokensEst: values.promptTokensEst,
            derivedAt: new Date(),
          },
        })
        .returning();
      return mapRow(row!);
    });
  }
}
