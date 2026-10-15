import { and, asc, eq, gte, inArray, lt, max, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  AgentRef,
  DecisionCount,
  LastRun,
  PerformanceRepo,
  RepoRef,
  RunFact,
  TimeRange,
} from './types.js';

/**
 * Read-only persistence for Agent Performance. Every method is scoped to the workspace
 * and the repository, and orders totally (NFR-4). SQL only scopes; which runs count and
 * every rate live in `aggregate.ts`.
 */
export class AgentPerformanceRepository implements PerformanceRepo {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<RepoRef | undefined> {
    const [r] = await this.db
      .select({ id: t.repos.id, fullName: t.repos.fullName })
      .from(t.repos)
      .where(and(eq(t.repos.id, repoId), eq(t.repos.workspaceId, workspaceId)))
      .limit(1);
    return r;
  }

  async getAgent(workspaceId: string, agentId: string): Promise<AgentRef | undefined> {
    const [a] = await this.db
      .select({ id: t.agents.id, name: t.agents.name, enabled: t.agents.enabled })
      .from(t.agents)
      .where(and(eq(t.agents.id, agentId), eq(t.agents.workspaceId, workspaceId)))
      .limit(1);
    return a;
  }

  listAgents(workspaceId: string): Promise<AgentRef[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name, enabled: t.agents.enabled })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(asc(t.agents.name), asc(t.agents.id));
  }

  async listRunFacts(
    workspaceId: string,
    repo: RepoRef,
    range: TimeRange,
    agentId?: string,
  ): Promise<RunFact[]> {
    const rows = await this.db
      .select({
        id: t.agentRuns.id,
        agentId: t.agentRuns.agentId,
        ranAt: t.agentRuns.ranAt,
        status: t.agentRuns.status,
        source: t.agentRuns.source,
        costUsd: t.agentRuns.costUsd,
        costSource: t.agentRuns.costSource,
        durationMs: t.agentRuns.durationMs,
        model: t.agentRuns.model,
      })
      .from(t.agentRuns)
      .where(and(this.runScope(workspaceId, repo, agentId), gte(t.agentRuns.ranAt, range.from), lt(t.agentRuns.ranAt, range.to)))
      .orderBy(asc(t.agentRuns.ranAt), asc(t.agentRuns.id));
    return rows;
  }

  /** Per-run decision counts of the findings of the reviews the runs produced. */
  async decisionCounts(
    workspaceId: string,
    repo: RepoRef,
    range: TimeRange,
    agentId?: string,
  ): Promise<DecisionCount[]> {
    const rows = await this.db
      .select({
        runId: t.agentRuns.id,
        accepted: sql<number>`count(*) filter (where ${t.findings.acceptedAt} is not null)`.mapWith(Number),
        dismissed:
          sql<number>`count(*) filter (where ${t.findings.dismissedAt} is not null and ${t.findings.acceptedAt} is null)`.mapWith(
            Number,
          ),
        undecided:
          sql<number>`count(*) filter (where ${t.findings.acceptedAt} is null and ${t.findings.dismissedAt} is null)`.mapWith(
            Number,
          ),
      })
      .from(t.agentRuns)
      .innerJoin(
        t.reviews,
        and(eq(t.reviews.runId, t.agentRuns.id), eq(t.reviews.workspaceId, t.agentRuns.workspaceId)),
      )
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(
        and(
          this.runScope(workspaceId, repo, agentId),
          eq(t.agentRuns.source, 'local'),
          gte(t.agentRuns.ranAt, range.from),
          lt(t.agentRuns.ranAt, range.to),
        ),
      )
      .groupBy(t.agentRuns.id)
      .orderBy(asc(t.agentRuns.id));
    return rows;
  }

  /** Latest start time per agent over all time (not only the range), for the given statuses. */
  async lastRuns(
    workspaceId: string,
    repo: RepoRef,
    statuses: readonly string[],
    agentId?: string,
  ): Promise<LastRun[]> {
    const rows = await this.db
      .select({ agentId: t.agentRuns.agentId, at: max(t.agentRuns.ranAt) })
      .from(t.agentRuns)
      .where(and(this.runScope(workspaceId, repo, agentId), inArray(t.agentRuns.status, [...statuses])))
      .groupBy(t.agentRuns.agentId)
      .orderBy(asc(t.agentRuns.agentId));
    const out: LastRun[] = [];
    for (const r of rows) if (r.agentId != null && r.at != null) out.push({ agentId: r.agentId, at: r.at });
    return out;
  }

  /**
   * Runs that belong to the repository (AC-65): local runs through their pull request,
   * CI runs through the recorded `owner/name` (case-insensitive).
   */
  private runScope(workspaceId: string, repo: RepoRef, agentId?: string): SQL {
    const repoPrs = this.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repo.id), eq(t.pullRequests.workspaceId, workspaceId)));
    const parts: (SQL | undefined)[] = [
      eq(t.agentRuns.workspaceId, workspaceId),
      or(
        and(eq(t.agentRuns.source, 'local'), inArray(t.agentRuns.prId, repoPrs)),
        and(eq(t.agentRuns.source, 'ci'), sql`lower(${t.agentRuns.repo}) = lower(${repo.fullName})`),
      ),
      agentId ? eq(t.agentRuns.agentId, agentId) : undefined,
    ];
    return and(...parts) as SQL;
  }
}
