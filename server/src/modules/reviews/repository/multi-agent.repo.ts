import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { RunEstimate } from '@devdigest/shared';
import { findingRowToDto, type ReviewDtoFinding } from '../helpers.js';

/** Window of newest completed runs behind an estimate. */
const ESTIMATE_WINDOW = 10;

export interface MultiAgentRecordRow {
  id: string;
  prId: string;
  repoId: string;
  prNumber: number;
  prTitle: string;
  ranAt: Date;
  estimate: RunEstimate | null;
}

export interface MultiAgentEntryRow {
  runId: string;
  agentId: string | null;
  agentName: string | null;
  provider: string | null;
  model: string | null;
  status: string | null;
  error: string | null;
  durationMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  ranAt: Date;
  finishedAt: Date | null;
  review: { verdict: string | null; summary: string | null; score: number | null } | null;
  findings: ReviewDtoFinding[];
}

/**
 * Create the batch record and one `running` agent_runs row per target in ONE
 * transaction, so a batch is never half-created. `runIds` follows `targets`.
 */
export async function createMultiAgentRun(
  db: Db,
  values: {
    workspaceId: string;
    prId: string;
    estimate: RunEstimate | null;
    targets: { agentId: string; provider: string | null; model: string | null }[];
  },
): Promise<{ id: string; ranAt: Date; runIds: string[] }> {
  return db.transaction(async (tx) => {
    const [record] = await tx
      .insert(t.multiAgentRuns)
      .values({ workspaceId: values.workspaceId, prId: values.prId, estimate: values.estimate })
      .returning({ id: t.multiAgentRuns.id, ranAt: t.multiAgentRuns.ranAt });
    const runIds: string[] = [];
    for (const target of values.targets) {
      const [run] = await tx
        .insert(t.agentRuns)
        .values({
          workspaceId: values.workspaceId,
          agentId: target.agentId,
          prId: values.prId,
          provider: target.provider,
          model: target.model,
          status: 'running',
          source: 'local',
          multiAgentRunId: record!.id,
        })
        .returning({ id: t.agentRuns.id });
      runIds.push(run!.id);
    }
    return { id: record!.id, ranAt: record!.ranAt, runIds };
  });
}

/** The batch record joined to its PR; both filtered by workspace. */
export async function getMultiAgentRun(
  db: Db,
  workspaceId: string,
  id: string,
): Promise<MultiAgentRecordRow | undefined> {
  const [row] = await db
    .select({
      id: t.multiAgentRuns.id,
      prId: t.multiAgentRuns.prId,
      ranAt: t.multiAgentRuns.ranAt,
      estimate: t.multiAgentRuns.estimate,
      repoId: t.pullRequests.repoId,
      prNumber: t.pullRequests.number,
      prTitle: t.pullRequests.title,
    })
    .from(t.multiAgentRuns)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
    .where(
      and(
        eq(t.multiAgentRuns.id, id),
        eq(t.multiAgentRuns.workspaceId, workspaceId),
        eq(t.pullRequests.workspaceId, workspaceId),
      ),
    );
  return row;
}

/** Every run of the batch with agent name, review and findings (total order). */
export async function listEntries(
  db: Db,
  workspaceId: string,
  id: string,
): Promise<MultiAgentEntryRow[]> {
  const runs = await db
    .select({ run: t.agentRuns, agentName: t.agents.name })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(and(eq(t.agentRuns.multiAgentRunId, id), eq(t.agentRuns.workspaceId, workspaceId)))
    .orderBy(asc(t.agentRuns.ranAt), asc(t.agentRuns.id));
  if (runs.length === 0) return [];
  const runIds = runs.map((r) => r.run.id);

  const reviews = await db
    .select()
    .from(t.reviews)
    .where(
      and(
        inArray(t.reviews.runId, runIds),
        eq(t.reviews.workspaceId, workspaceId),
        eq(t.reviews.kind, 'review'),
      ),
    )
    .orderBy(desc(t.reviews.createdAt), desc(t.reviews.id));
  const reviewByRun = new Map<string, (typeof reviews)[number]>();
  for (const r of reviews) if (r.runId && !reviewByRun.has(r.runId)) reviewByRun.set(r.runId, r);

  const findings = reviews.length
    ? await db
        .select()
        .from(t.findings)
        .where(inArray(t.findings.reviewId, [...reviewByRun.values()].map((r) => r.id)))
        .orderBy(
          asc(t.findings.file),
          asc(t.findings.startLine),
          asc(t.findings.endLine),
          asc(t.findings.id),
        )
    : [];

  return runs.map(({ run, agentName }) => {
    const review = reviewByRun.get(run.id);
    return {
      runId: run.id,
      agentId: run.agentId,
      agentName: agentName ?? null,
      provider: run.provider,
      model: run.model,
      status: run.status,
      error: run.error,
      durationMs: run.durationMs,
      tokensIn: run.tokensIn,
      tokensOut: run.tokensOut,
      costUsd: run.costUsd,
      ranAt: run.ranAt,
      finishedAt: run.finishedAt,
      review: review
        ? { verdict: review.verdict, summary: review.summary, score: review.score }
        : null,
      findings: review
        ? findings.filter((f) => f.reviewId === review.id).map(findingRowToDto)
        : [],
    };
  });
}

/** Newest batch of a PR (workspace-scoped), or undefined. */
export async function latestForPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<{ id: string; ranAt: Date } | undefined> {
  const [row] = await db
    .select({ id: t.multiAgentRuns.id, ranAt: t.multiAgentRuns.ranAt })
    .from(t.multiAgentRuns)
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.prId, prId)))
    .orderBy(desc(t.multiAgentRuns.ranAt), desc(t.multiAgentRuns.id))
    .limit(1);
  return row;
}

/**
 * Per agent: the newest <=10 completed durations and, separately, the newest
 * <=10 completed costs that are non-null (window applied after dropping runs
 * without the value). Raw samples only; medians are computed by the caller.
 */
export async function estimateSamples(
  db: Db,
  workspaceId: string,
  agentIds: string[],
): Promise<{ agentId: string; durations: number[]; costs: number[] }[]> {
  const base = (agentId: string) =>
    and(
      eq(t.agentRuns.workspaceId, workspaceId),
      eq(t.agentRuns.agentId, agentId),
      eq(t.agentRuns.status, 'done'),
    );
  return Promise.all(
    agentIds.map(async (agentId) => {
      const [durRows, costRows] = await Promise.all([
        db
          .select({ v: t.agentRuns.durationMs })
          .from(t.agentRuns)
          .where(and(base(agentId), isNotNull(t.agentRuns.durationMs)))
          .orderBy(desc(t.agentRuns.ranAt), desc(t.agentRuns.id))
          .limit(ESTIMATE_WINDOW),
        db
          .select({ v: t.agentRuns.costUsd })
          .from(t.agentRuns)
          .where(and(base(agentId), isNotNull(t.agentRuns.costUsd)))
          .orderBy(desc(t.agentRuns.ranAt), desc(t.agentRuns.id))
          .limit(ESTIMATE_WINDOW),
      ]);
      return {
        agentId,
        durations: durRows.map((r) => r.v!),
        costs: costRows.map((r) => r.v!),
      };
    }),
  );
}
