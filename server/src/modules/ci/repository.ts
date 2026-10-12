import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiRunDetail, CiRunItem, CiTraceData } from '@devdigest/shared';
import { CiTraceData as CiTraceDataSchema } from '@devdigest/shared';
import { parseRepoSlug } from './helpers.js';
import type {
  CiInstallationRecord,
  CiRepositoryPort,
  CiRunsSlice,
  InsertCiRunInput,
  ListCiRunsQuery,
  UpsertInstallationInput,
} from './types.js';

type InstallationRow = typeof t.ciInstallations.$inferSelect;
type RunRow = typeof t.agentRuns.$inferSelect;

const toRecord = (r: InstallationRow): CiInstallationRecord => ({
  id: r.id,
  agentId: r.agentId,
  repo: r.repo,
  targetType: r.targetType,
  agentSlug: r.agentSlug,
  agentName: r.agentName,
  workflowPath: r.workflowPath,
  status: r.status,
  statusChangedAt: r.statusChangedAt,
  installedAt: r.installedAt,
  exportedAgentVersion: r.exportedAgentVersion,
  triggers: r.triggers as CiInstallationRecord['triggers'],
  postAs: r.postAs,
  prUrl: r.prUrl,
  prNumber: r.prNumber,
  lastCollectedAt: r.lastCollectedAt,
});

/** Pull request link built from stored fields; only for a plain `owner/name`. */
const prUrlOf = (repo: string | null, n: number | null): string | null =>
  repo && n != null && parseRepoSlug(repo) ? `https://github.com/${repo}/pull/${n}` : null;

const toRunItem = (run: RunRow, agentName: string | null): CiRunItem => ({
  id: run.id,
  repo: run.repo,
  pr_number: run.externalPrNumber,
  pr_url: prUrlOf(run.repo, run.externalPrNumber),
  agent_id: run.agentId,
  agent_name: agentName,
  installation_id: run.ciInstallationId,
  verdict:
    run.status === 'failed'
      ? 'failed'
      : run.verdict === 'approve' || run.verdict === 'request_changes'
        ? run.verdict
        : 'comment',
  findings_count: run.findingsCount,
  cost_usd: run.costUsd,
  duration_ms: run.durationMs,
  job_url: run.actionsJobUrl,
  ran_at: run.ranAt.toISOString(),
});

/** A stored trace is re-validated on read; anything that no longer parses becomes null. */
const toTrace = (raw: unknown): CiTraceData | null => {
  const parsed = CiTraceDataSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

/**
 * ci data-access. The ONLY layer touching the DB for installations and CI runs.
 * Installations are scoped to a workspace through their agent; CI runs are
 * `agent_runs` rows with `source='ci'` (no `pr_id`, so PR run history never sees
 * them). Returns plain domain types, never `$inferSelect` rows.
 */
export class CiRepository implements CiRepositoryPort {
  constructor(private db: Db) {}

  async isImportedRepo(workspaceId: string, fullName: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, fullName)))
      .limit(1);
    return row != null;
  }

  // ---- installations ------------------------------------------------------

  private installationsWhere(workspaceId: string, ...conds: Array<ReturnType<typeof eq> | undefined>) {
    return this.db
      .select({ inst: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId))
      .where(and(eq(t.agents.workspaceId, workspaceId), ...conds))
      .orderBy(desc(t.ciInstallations.installedAt), t.ciInstallations.id);
  }

  async getInstallation(workspaceId: string, agentId: string, repo: string) {
    const [row] = await this.installationsWhere(
      workspaceId,
      eq(t.ciInstallations.agentId, agentId),
      eq(t.ciInstallations.repo, repo),
    );
    return row ? toRecord(row.inst) : undefined;
  }

  async getInstallationById(workspaceId: string, id: string) {
    const [row] = await this.installationsWhere(workspaceId, eq(t.ciInstallations.id, id));
    return row ? toRecord(row.inst) : undefined;
  }

  async listInstallations(workspaceId: string) {
    return (await this.installationsWhere(workspaceId)).map((r) => toRecord(r.inst));
  }

  async listInstallationsForAgent(workspaceId: string, agentId: string) {
    return (await this.installationsWhere(workspaceId, eq(t.ciInstallations.agentId, agentId))).map(
      (r) => toRecord(r.inst),
    );
  }

  async listInstallationsForRepo(workspaceId: string, repo: string) {
    return (await this.installationsWhere(workspaceId, eq(t.ciInstallations.repo, repo))).map((r) =>
      toRecord(r.inst),
    );
  }

  /**
   * Insert or update the (agent, repo) installation. The caller has resolved the
   * agent inside the workspace. `installed_at` and `last_collected_at` survive an
   * update; `status_changed_at` moves only when the status does.
   */
  async upsertInstallation(
    workspaceId: string,
    input: UpsertInstallationInput,
  ): Promise<CiInstallationRecord> {
    const existing = await this.getInstallation(workspaceId, input.agentId, input.repo);
    const fields = {
      agentSlug: input.agentSlug,
      agentName: input.agentName,
      workflowPath: input.workflowPath,
      status: input.status,
      exportedAgentVersion: input.exportedAgentVersion,
      triggers: input.triggers,
      postAs: input.postAs,
      prUrl: input.prUrl,
      prNumber: input.prNumber,
    };
    if (existing) {
      const [row] = await this.db
        .update(t.ciInstallations)
        .set({
          ...fields,
          statusChangedAt: existing.status === input.status ? existing.statusChangedAt : input.now,
        })
        .where(eq(t.ciInstallations.id, existing.id))
        .returning();
      return toRecord(row!);
    }
    const [row] = await this.db
      .insert(t.ciInstallations)
      .values({
        agentId: input.agentId,
        repo: input.repo,
        targetType: 'gha',
        installedAt: input.now,
        statusChangedAt: input.now,
        ...fields,
      })
      .returning();
    return toRecord(row!);
  }

  async updateStatus(
    workspaceId: string,
    id: string,
    status: CiInstallationRecord['status'],
    now: Date,
  ): Promise<void> {
    const owned = await this.getInstallationById(workspaceId, id);
    if (!owned || owned.status === status) return;
    await this.db
      .update(t.ciInstallations)
      .set({ status, statusChangedAt: now })
      .where(eq(t.ciInstallations.id, id));
  }

  async touchCollected(workspaceId: string, id: string, at: Date): Promise<void> {
    const owned = await this.getInstallationById(workspaceId, id);
    if (!owned) return;
    await this.db
      .update(t.ciInstallations)
      .set({ lastCollectedAt: at })
      .where(eq(t.ciInstallations.id, id));
  }

  // ---- CI runs (agent_runs, source='ci') ------------------------------------

  async insertCiRun(workspaceId: string, input: InsertCiRunInput): Promise<boolean> {
    const inserted = await this.db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        agentId: input.agentId,
        prId: null,
        ranAt: input.ranAt,
        provider: 'openrouter',
        model: input.model,
        durationMs: input.durationMs,
        costUsd: input.costUsd,
        status: input.status,
        source: 'ci',
        findingsCount: input.findingsCount,
        blockers: input.blockers,
        ciInstallationId: input.installationId,
        repo: input.repo,
        externalPrNumber: input.prNumber,
        actionsRunId: input.actionsRunId,
        actionsRunAttempt: input.actionsRunAttempt,
        actionsJobUrl: input.actionsJobUrl,
        headSha: input.headSha,
        verdict: input.verdict,
        ciTrace: input.trace,
      })
      .onConflictDoNothing()
      .returning({ id: t.agentRuns.id });
    return inserted.length > 0;
  }

  async ciRunExists(
    workspaceId: string,
    repo: string,
    actionsRunId: string,
    attempt: number,
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.agentRuns.id })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.source, 'ci'),
          eq(t.agentRuns.repo, repo),
          eq(t.agentRuns.actionsRunId, actionsRunId),
          eq(t.agentRuns.actionsRunAttempt, attempt),
        ),
      )
      .limit(1);
    return row != null;
  }

  /** Newest first by `(ran_at, id)`; keyset page of `limit` rows. */
  async listCiRuns(workspaceId: string, query: ListCiRunsQuery): Promise<CiRunsSlice> {
    const after = query.after;
    const rows = await this.db
      .select({ run: t.agentRuns, agentName: t.agents.name })
      .from(t.agentRuns)
      .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.source, 'ci'),
          query.installationId ? eq(t.agentRuns.ciInstallationId, query.installationId) : undefined,
          query.agentId ? eq(t.agentRuns.agentId, query.agentId) : undefined,
          after
            ? or(
                lt(t.agentRuns.ranAt, after.ranAt),
                and(eq(t.agentRuns.ranAt, after.ranAt), lt(t.agentRuns.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(t.agentRuns.ranAt), desc(t.agentRuns.id))
      .limit(query.limit + 1);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((r) => toRunItem(r.run, r.agentName ?? null)),
      next: rows.length > query.limit && last ? { ranAt: last.run.ranAt, id: last.run.id } : null,
    };
  }

  async getCiRun(workspaceId: string, id: string): Promise<CiRunDetail | undefined> {
    const [row] = await this.db
      .select({ run: t.agentRuns, agentName: t.agents.name })
      .from(t.agentRuns)
      .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.source, 'ci'),
          eq(t.agentRuns.id, id),
        ),
      );
    if (!row) return undefined;
    return {
      ...toRunItem(row.run, row.agentName ?? null),
      model: row.run.model,
      trace: toTrace(row.run.ciTrace),
      head_sha: row.run.headSha,
    };
  }

  async latestRunByInstallation(
    workspaceId: string,
    installationIds: string[],
  ): Promise<Map<string, CiRunItem>> {
    const out = new Map<string, CiRunItem>();
    if (installationIds.length === 0) return out;
    const rows = await this.db
      .selectDistinctOn([t.agentRuns.ciInstallationId], { run: t.agentRuns, agentName: t.agents.name })
      .from(t.agentRuns)
      .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.source, 'ci'),
          inArray(t.agentRuns.ciInstallationId, installationIds),
        ),
      )
      .orderBy(t.agentRuns.ciInstallationId, desc(t.agentRuns.ranAt), desc(t.agentRuns.id));
    for (const r of rows) {
      if (r.run.ciInstallationId) out.set(r.run.ciInstallationId, toRunItem(r.run, r.agentName ?? null));
    }
    return out;
  }
}
