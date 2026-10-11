import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { EvalCaseRunRow, EvalSuiteRunRow } from '../../../db/rows.js';
import type {
  EvalCaseRun,
  EvalCaseRunDetail,
  EvalExpectation,
  EvalExpectationMatch,
  EvalRunDroppedFinding,
  EvalRunFinding,
  EvalSuiteRun,
  EvalSuiteRunStatus,
} from '@devdigest/shared';
import type { CompareCaseRow, RunScore } from '../types.js';

/** Eval suite runs + per-case result rows data-access. Workspace-scoped; total ORDER BYs. */

/** What the executor persists per case in `eval_runs.actual_output` (NFR-7). */
export interface CaseRunActual {
  findings: EvalRunFinding[];
  dropped: EvalRunDroppedFinding[];
  expectation_matches: EvalExpectationMatch[];
}

export interface InsertCaseRunInput {
  /** NULL suite = a single-case run (AC-51): never part of any history. */
  suiteRunId: string | null;
  caseId: string;
  /** Always written (the column is nullable only for old rows). */
  caseName: string;
  status: 'ok' | 'error';
  error?: string | null;
  expectations: EvalExpectation[];
  /** null for an errored case. */
  actual: CaseRunActual | null;
  passed: boolean | null;
  findingsReturned: number;
  findingsKept: number;
  mustFindTotal: number;
  mustFindMatched: number;
  mustNotFlagHits: number;
  durationMs: number | null;
  costUsd: number | null;
}

export interface ListSuiteRunsQuery {
  agentId?: string;
  status?: EvalSuiteRunStatus;
  /** Only runs started at or after this instant (period filter, AC-55). */
  since?: Date;
  limit?: number;
}

export function toSuiteRun(row: EvalSuiteRunRow, agentName?: string): EvalSuiteRun {
  return {
    id: row.id,
    agent_id: row.agentId,
    ...(agentName !== undefined ? { agent_name: agentName } : {}),
    agent_version: row.agentVersion,
    status: row.status,
    error: row.error,
    started_at: row.startedAt.toISOString(),
    finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
    cases_total: row.casesTotal,
    cases_done: row.casesDone,
    cases_errored: row.casesErrored,
    cases_passed: row.casesPassed,
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    cost_usd: row.costUsd,
    duration_ms: row.durationMs,
  };
}

const expectationsOf = (row: EvalCaseRunRow): EvalExpectation[] =>
  Array.isArray(row.expectedSnapshot) ? (row.expectedSnapshot as EvalExpectation[]) : [];

function toCaseRun(row: EvalCaseRunRow): EvalCaseRun {
  const exp = expectationsOf(row);
  return {
    id: row.id,
    case_id: row.caseId,
    case_name: row.caseName ?? '',
    expectation_types: exp.map((e) => e.type),
    status: row.status,
    error: row.error,
    passed: row.status === 'error' ? null : row.pass,
    expected_count: exp.length,
    returned_count: row.findingsKept,
    duration_ms: row.durationMs,
    cost_usd: row.costUsd,
  };
}

// ---------------------------------------------------------------- suite runs

/**
 * Start a run. The partial unique index (one `running` run per agent) makes this
 * atomic: a concurrent start inserts nothing and gets `already_running` (AC-19).
 */
export async function createSuiteRun(
  db: Db,
  workspaceId: string,
  input: { agentId: string; agentVersion: number; casesTotal: number },
): Promise<{ kind: 'created'; run: EvalSuiteRun } | { kind: 'already_running' }> {
  const [row] = await db
    .insert(t.evalSuiteRuns)
    .values({
      workspaceId,
      agentId: input.agentId,
      agentVersion: input.agentVersion,
      status: 'running',
      casesTotal: input.casesTotal,
    })
    .onConflictDoNothing({
      target: t.evalSuiteRuns.agentId,
      where: sql`${t.evalSuiteRuns.status} = 'running'`,
    })
    .returning();
  return row ? { kind: 'created', run: toSuiteRun(row) } : { kind: 'already_running' };
}

/** Atomic progress increment after a case finished (concurrent cases are safe). */
export async function bumpProgress(
  db: Db,
  runId: string,
  step: { errored: boolean; passed: boolean },
): Promise<void> {
  await db
    .update(t.evalSuiteRuns)
    .set({
      casesDone: sql`${t.evalSuiteRuns.casesDone} + 1`,
      casesErrored: sql`${t.evalSuiteRuns.casesErrored} + ${step.errored ? 1 : 0}`,
      casesPassed: sql`${t.evalSuiteRuns.casesPassed} + ${step.passed ? 1 : 0}`,
    })
    .where(and(eq(t.evalSuiteRuns.id, runId), eq(t.evalSuiteRuns.status, 'running')));
}

/** Close a run as `done` with the scored metrics (guarded: only a `running` run). */
export async function finishSuiteRun(
  db: Db,
  runId: string,
  score: RunScore,
  finishedAt: Date,
  durationMs: number,
): Promise<void> {
  await db
    .update(t.evalSuiteRuns)
    .set({
      status: 'done',
      error: null,
      finishedAt,
      durationMs,
      casesErrored: score.cases_errored,
      casesPassed: score.cases_passed,
      recall: score.recall,
      precision: score.precision,
      citationAccuracy: score.citation_accuracy,
      costUsd: score.cost_usd,
    })
    .where(and(eq(t.evalSuiteRuns.id, runId), eq(t.evalSuiteRuns.status, 'running')));
}

export async function failSuiteRun(
  db: Db,
  runId: string,
  error: string,
  finishedAt: Date,
  durationMs: number | null,
): Promise<void> {
  await db
    .update(t.evalSuiteRuns)
    .set({ status: 'failed', error, finishedAt, durationMs })
    .where(and(eq(t.evalSuiteRuns.id, runId), eq(t.evalSuiteRuns.status, 'running')));
}

/**
 * Boot reap (AC-74): every run left `running` by a previous process becomes
 * `failed` with `reason`. All workspaces — a single API instance per DB is assumed.
 * Returns the number of runs reaped.
 */
export async function failStaleRunning(db: Db, reason: string, finishedAt: Date): Promise<number> {
  const rows = await db
    .update(t.evalSuiteRuns)
    .set({ status: 'failed', error: reason, finishedAt })
    .where(eq(t.evalSuiteRuns.status, 'running'))
    .returning({ id: t.evalSuiteRuns.id });
  return rows.length;
}

export async function getSuiteRun(
  db: Db,
  workspaceId: string,
  runId: string,
): Promise<EvalSuiteRun | undefined> {
  const [r] = await db
    .select({ run: t.evalSuiteRuns, agentName: t.agents.name })
    .from(t.evalSuiteRuns)
    .innerJoin(t.agents, eq(t.evalSuiteRuns.agentId, t.agents.id))
    .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.id, runId)));
  return r ? toSuiteRun(r.run, r.agentName) : undefined;
}

/** Runs of any status unless `status` is given (Q-6), newest first. */
export async function listSuiteRuns(
  db: Db,
  workspaceId: string,
  q: ListSuiteRunsQuery = {},
): Promise<EvalSuiteRun[]> {
  const rows = await db
    .select({ run: t.evalSuiteRuns, agentName: t.agents.name })
    .from(t.evalSuiteRuns)
    .innerJoin(t.agents, eq(t.evalSuiteRuns.agentId, t.agents.id))
    .where(
      and(
        eq(t.evalSuiteRuns.workspaceId, workspaceId),
        q.agentId ? eq(t.evalSuiteRuns.agentId, q.agentId) : undefined,
        q.status ? eq(t.evalSuiteRuns.status, q.status) : undefined,
        q.since ? gte(t.evalSuiteRuns.startedAt, q.since) : undefined,
      ),
    )
    .orderBy(desc(t.evalSuiteRuns.startedAt), desc(t.evalSuiteRuns.id))
    .limit(q.limit ?? 1000);
  return rows.map((r) => toSuiteRun(r.run, r.agentName));
}

/** Completed runs of one agent, oldest first (trend chart / "previous completed run"). */
export async function listDoneRunsAscending(
  db: Db,
  workspaceId: string,
  agentId: string,
  since?: Date,
): Promise<EvalSuiteRun[]> {
  const rows = await db
    .select()
    .from(t.evalSuiteRuns)
    .where(
      and(
        eq(t.evalSuiteRuns.workspaceId, workspaceId),
        eq(t.evalSuiteRuns.agentId, agentId),
        eq(t.evalSuiteRuns.status, 'done'),
        since ? gte(t.evalSuiteRuns.startedAt, since) : undefined,
      ),
    )
    .orderBy(asc(t.evalSuiteRuns.startedAt), asc(t.evalSuiteRuns.id));
  return rows.map((r) => toSuiteRun(r));
}

// ------------------------------------------------------------- case-run rows

/** Persist one case's result. Returns the row id. */
export async function insertCaseRun(db: Db, input: InsertCaseRunInput): Promise<string> {
  const [row] = await db
    .insert(t.evalRuns)
    .values({
      caseId: input.caseId,
      suiteRunId: input.suiteRunId,
      caseName: input.caseName,
      status: input.status,
      error: input.error ?? null,
      expectedSnapshot: input.expectations,
      actualOutput: input.actual,
      pass: input.passed,
      durationMs: input.durationMs,
      costUsd: input.costUsd,
      findingsReturned: input.findingsReturned,
      findingsKept: input.findingsKept,
      mustFindTotal: input.mustFindTotal,
      mustFindMatched: input.mustFindMatched,
      mustNotFlagHits: input.mustNotFlagHits,
      recall: input.mustFindTotal > 0 ? input.mustFindMatched / input.mustFindTotal : null,
      precision: input.findingsKept > 0 ? 1 - input.mustNotFlagHits / input.findingsKept : null,
      citationAccuracy: input.findingsReturned > 0 ? input.findingsKept / input.findingsReturned : null,
    })
    .returning({ id: t.evalRuns.id });
  return row!.id;
}

/** Case rows of a run (workspace-scoped through the run), in execution order. */
export async function listCaseRuns(
  db: Db,
  workspaceId: string,
  runId: string,
): Promise<EvalCaseRun[]> {
  const rows = await db
    .select({ row: t.evalRuns })
    .from(t.evalRuns)
    .innerJoin(t.evalSuiteRuns, eq(t.evalRuns.suiteRunId, t.evalSuiteRuns.id))
    .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.id, runId)))
    .orderBy(asc(t.evalRuns.ranAt), asc(t.evalRuns.id));
  return rows.map((r) => toCaseRun(r.row));
}

export async function getCaseRunDetail(
  db: Db,
  workspaceId: string,
  runId: string,
  rowId: string,
): Promise<EvalCaseRunDetail | undefined> {
  const [r] = await db
    .select({ row: t.evalRuns })
    .from(t.evalRuns)
    .innerJoin(t.evalSuiteRuns, eq(t.evalRuns.suiteRunId, t.evalSuiteRuns.id))
    .where(
      and(
        eq(t.evalSuiteRuns.workspaceId, workspaceId),
        eq(t.evalSuiteRuns.id, runId),
        eq(t.evalRuns.id, rowId),
      ),
    );
  if (!r) return undefined;
  const actual = (r.row.actualOutput ?? {}) as Partial<CaseRunActual>;
  return {
    ...toCaseRun(r.row),
    expectations: expectationsOf(r.row),
    findings: actual.findings ?? [],
    dropped: actual.dropped ?? [],
    expectation_matches: actual.expectation_matches ?? [],
  };
}

/** The rows `compareRuns` needs for one run (AC-31..33, AC-41). */
export async function listCompareRows(
  db: Db,
  workspaceId: string,
  runId: string,
): Promise<CompareCaseRow[]> {
  const rows = await db
    .select({ row: t.evalRuns })
    .from(t.evalRuns)
    .innerJoin(t.evalSuiteRuns, eq(t.evalRuns.suiteRunId, t.evalSuiteRuns.id))
    .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.id, runId)))
    .orderBy(asc(t.evalRuns.ranAt), asc(t.evalRuns.id));
  return rows.map(({ row }) => ({
    case_id: row.caseId,
    case_name: row.caseName ?? '',
    expectation_types: expectationsOf(row).map((e) => e.type),
    status: row.status,
    passed: row.pass,
    findings_returned: row.findingsReturned,
    findings_kept: row.findingsKept,
    must_find_total: row.mustFindTotal,
    must_find_matched: row.mustFindMatched,
    must_not_flag_hits: row.mustNotFlagHits,
    cost_usd: row.costUsd,
  }));
}
