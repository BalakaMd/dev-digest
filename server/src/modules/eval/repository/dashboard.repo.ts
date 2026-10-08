import { and, asc, desc, eq, lte, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { EvalDashboardAgent, EvalDashboardOverview } from '@devdigest/shared';
import { toSuiteRun } from './runs.repo.js';

/**
 * Read models for the Eval Dashboard (AC-35/36). Every agent of the workspace is
 * listed — disabled and never-run included (EC-15) — in the agents-list order.
 */
export async function overview(
  db: Db,
  workspaceId: string,
  opts: { sparkPoints: number; recentLimit: number },
): Promise<EvalDashboardOverview> {
  const [agentRows, caseCounts, latestDone, running, recent] = await Promise.all([
    db
      .select()
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(asc(t.agents.createdAt), asc(t.agents.name), asc(t.agents.id)),
    db
      .select({ agentId: t.evalCases.ownerId, n: sql<number>`count(*)::int` })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'agent')))
      .groupBy(t.evalCases.ownerId),
    db
      .selectDistinctOn([t.evalSuiteRuns.agentId])
      .from(t.evalSuiteRuns)
      .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.status, 'done')))
      .orderBy(asc(t.evalSuiteRuns.agentId), desc(t.evalSuiteRuns.startedAt), desc(t.evalSuiteRuns.id)),
    db
      .select()
      .from(t.evalSuiteRuns)
      .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.status, 'running')))
      .orderBy(desc(t.evalSuiteRuns.startedAt), desc(t.evalSuiteRuns.id)),
    db
      .select({ run: t.evalSuiteRuns, agentName: t.agents.name })
      .from(t.evalSuiteRuns)
      .innerJoin(t.agents, eq(t.evalSuiteRuns.agentId, t.agents.id))
      .where(eq(t.evalSuiteRuns.workspaceId, workspaceId))
      .orderBy(desc(t.evalSuiteRuns.startedAt), desc(t.evalSuiteRuns.id))
      .limit(opts.recentLimit),
  ]);

  // Recall of the last N completed runs per agent (window function), oldest first.
  const ranked = db
    .select({
      agentId: t.evalSuiteRuns.agentId,
      recall: t.evalSuiteRuns.recall,
      startedAt: t.evalSuiteRuns.startedAt,
      id: t.evalSuiteRuns.id,
      rn: sql<number>`row_number() over (partition by ${t.evalSuiteRuns.agentId} order by ${t.evalSuiteRuns.startedAt} desc, ${t.evalSuiteRuns.id} desc)`.as(
        'rn',
      ),
    })
    .from(t.evalSuiteRuns)
    .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.status, 'done')))
    .as('ranked');
  const sparkRows = await db
    .select()
    .from(ranked)
    .where(lte(ranked.rn, opts.sparkPoints))
    .orderBy(asc(ranked.agentId), asc(ranked.startedAt), asc(ranked.id));

  const counts = new Map(caseCounts.map((c) => [c.agentId, c.n]));
  const latest = new Map(latestDone.map((r) => [r.agentId, r]));
  const runningBy = new Map<string, (typeof running)[number]>();
  for (const r of running) if (!runningBy.has(r.agentId)) runningBy.set(r.agentId, r);
  const spark = new Map<string, Array<number | null>>();
  for (const s of sparkRows) {
    const list = spark.get(s.agentId) ?? [];
    list.push(s.recall);
    spark.set(s.agentId, list);
  }

  const agents: EvalDashboardAgent[] = agentRows.map((a) => {
    const l = latest.get(a.id);
    const r = runningBy.get(a.id);
    return {
      agent_id: a.id,
      name: a.name,
      provider: a.provider,
      model: a.model,
      enabled: a.enabled,
      cases_total: counts.get(a.id) ?? 0,
      latest: l ? toSuiteRun(l, a.name) : null,
      running: r ? toSuiteRun(r, a.name) : null,
      recall_spark: spark.get(a.id) ?? [],
    };
  });

  return {
    agents,
    recent_runs: recent.map((r) => toSuiteRun(r.run, r.agentName)),
  };
}
