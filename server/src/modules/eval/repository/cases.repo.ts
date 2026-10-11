import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { EvalCaseRow } from '../../../db/rows.js';
import type {
  EvalCaseDetail,
  EvalCaseLastResult,
  EvalCaseMeta,
  EvalCaseSummary,
  EvalExpectation,
} from '@devdigest/shared';

/**
 * Eval cases data-access. Cases are owned by an agent (`owner_kind = 'agent'`,
 * `owner_id = agent id`); every query is workspace-scoped and lists have a
 * total ORDER BY (created_at, id).
 */

export interface InsertCaseInput {
  agentId: string;
  name: string;
  inputDiff: string;
  inputMeta: EvalCaseMeta;
  /** Paths of the files in `inputDiff` (computed by the service). */
  inputFiles: string[];
  expectedOutput: EvalExpectation[];
  /** Set for a case made from a finding: at most one case per finding (AC-9). */
  sourceFindingId?: string | null;
}

export interface UpdateCaseInput {
  name?: string;
  expectedOutput?: EvalExpectation[];
}

const ownedBy = (workspaceId: string, agentId: string) =>
  and(
    eq(t.evalCases.workspaceId, workspaceId),
    eq(t.evalCases.ownerKind, 'agent'),
    eq(t.evalCases.ownerId, agentId),
  );

/** Latest scored (status ok) execution per case — suite OR single-case run (AC-10/AC-53). */
async function latestResults(db: Db, caseIds: string[]): Promise<Map<string, EvalCaseLastResult>> {
  if (caseIds.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([t.evalRuns.caseId], {
      caseId: t.evalRuns.caseId,
      pass: t.evalRuns.pass,
      expected: t.evalRuns.expectedSnapshot,
      returned: t.evalRuns.findingsKept,
      durationMs: t.evalRuns.durationMs,
      costUsd: t.evalRuns.costUsd,
      ranAt: t.evalRuns.ranAt,
    })
    .from(t.evalRuns)
    .where(and(inArray(t.evalRuns.caseId, caseIds), eq(t.evalRuns.status, 'ok')))
    .orderBy(asc(t.evalRuns.caseId), desc(t.evalRuns.ranAt), desc(t.evalRuns.id));
  const out = new Map<string, EvalCaseLastResult>();
  for (const r of rows) {
    if (!r.caseId) continue;
    out.set(r.caseId, {
      passed: r.pass === true,
      expected_count: Array.isArray(r.expected) ? r.expected.length : 0,
      // Grounded findings: the ones shown in the case result (AC-39).
      returned_count: r.returned,
      duration_ms: r.durationMs,
      cost_usd: r.costUsd,
      ran_at: r.ranAt.toISOString(),
    });
  }
  return out;
}

function toSummary(row: EvalCaseRow, last: EvalCaseLastResult | undefined): EvalCaseSummary {
  return {
    id: row.id,
    agent_id: row.ownerId,
    name: row.name,
    expected_output: (row.expectedOutput ?? []) as EvalExpectation[],
    source_finding_id: row.sourceFindingId,
    created_at: row.createdAt.toISOString(),
    last_result: last ?? null,
  };
}

function toDetail(row: EvalCaseRow, last: EvalCaseLastResult | undefined): EvalCaseDetail {
  return {
    ...toSummary(row, last),
    input_diff: row.inputDiff ?? '',
    input_meta: (row.inputMeta ?? { title: '', body: '' }) as EvalCaseMeta,
    input_files: (row.inputFiles ?? []) as string[],
  };
}

async function detailOf(db: Db, row: EvalCaseRow): Promise<EvalCaseDetail> {
  const last = await latestResults(db, [row.id]);
  return toDetail(row, last.get(row.id));
}

/**
 * Insert a case. For a case made from a finding the partial unique index on
 * `source_finding_id` is the guard: a concurrent double click inserts nothing and
 * the existing case comes back with `created: false` (AC-9).
 */
export async function insertCase(
  db: Db,
  workspaceId: string,
  input: InsertCaseInput,
): Promise<{ case: EvalCaseDetail; created: boolean }> {
  const [row] = await db
    .insert(t.evalCases)
    .values({
      workspaceId,
      ownerKind: 'agent',
      ownerId: input.agentId,
      name: input.name,
      inputDiff: input.inputDiff,
      inputFiles: input.inputFiles,
      inputMeta: input.inputMeta,
      expectedOutput: input.expectedOutput,
      sourceFindingId: input.sourceFindingId ?? null,
    })
    .onConflictDoNothing({
      target: t.evalCases.sourceFindingId,
      where: sql`${t.evalCases.sourceFindingId} is not null`,
    })
    .returning();
  if (row) return { case: toDetail(row, undefined), created: true };

  const existing = input.sourceFindingId
    ? await getCaseBySourceFinding(db, workspaceId, input.sourceFindingId)
    : undefined;
  if (!existing) throw new Error('eval case insert conflicted but no existing case was found');
  return { case: existing, created: false };
}

export async function getCaseBySourceFinding(
  db: Db,
  workspaceId: string,
  findingId: string,
): Promise<EvalCaseDetail | undefined> {
  const [row] = await db
    .select()
    .from(t.evalCases)
    .where(
      and(
        eq(t.evalCases.workspaceId, workspaceId),
        eq(t.evalCases.ownerKind, 'agent'),
        eq(t.evalCases.sourceFindingId, findingId),
      ),
    );
  return row ? detailOf(db, row) : undefined;
}

export async function getCase(
  db: Db,
  workspaceId: string,
  caseId: string,
): Promise<EvalCaseDetail | undefined> {
  const [row] = await db
    .select()
    .from(t.evalCases)
    .where(
      and(
        eq(t.evalCases.workspaceId, workspaceId),
        eq(t.evalCases.ownerKind, 'agent'),
        eq(t.evalCases.id, caseId),
      ),
    );
  return row ? detailOf(db, row) : undefined;
}

async function listRows(db: Db, workspaceId: string, agentId: string): Promise<EvalCaseRow[]> {
  return db
    .select()
    .from(t.evalCases)
    .where(ownedBy(workspaceId, agentId))
    .orderBy(asc(t.evalCases.createdAt), asc(t.evalCases.id));
}

/** The agent's cases with their latest scored result (AC-10), oldest first. */
export async function listCases(
  db: Db,
  workspaceId: string,
  agentId: string,
): Promise<EvalCaseSummary[]> {
  const rows = await listRows(db, workspaceId, agentId);
  const last = await latestResults(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toSummary(r, last.get(r.id)));
}

/** The agent's cases with the stored input — what a suite run executes. Oldest first. */
export async function listCaseDetails(
  db: Db,
  workspaceId: string,
  agentId: string,
): Promise<EvalCaseDetail[]> {
  const rows = await listRows(db, workspaceId, agentId);
  return rows.map((r) => toDetail(r, undefined));
}

export async function caseNamesForAgent(
  db: Db,
  workspaceId: string,
  agentId: string,
): Promise<string[]> {
  const rows = await db
    .select({ name: t.evalCases.name })
    .from(t.evalCases)
    .where(ownedBy(workspaceId, agentId))
    .orderBy(asc(t.evalCases.createdAt), asc(t.evalCases.id));
  return rows.map((r) => r.name);
}

export async function countCases(db: Db, workspaceId: string, agentId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.evalCases)
    .where(ownedBy(workspaceId, agentId));
  return row?.n ?? 0;
}

/** Name / expected output only — the stored input is immutable (AC-72). */
export async function updateCase(
  db: Db,
  workspaceId: string,
  caseId: string,
  patch: UpdateCaseInput,
): Promise<EvalCaseDetail | undefined> {
  const set = {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.expectedOutput !== undefined ? { expectedOutput: patch.expectedOutput } : {}),
  };
  if (Object.keys(set).length === 0) return getCase(db, workspaceId, caseId);
  const [row] = await db
    .update(t.evalCases)
    .set(set)
    .where(
      and(
        eq(t.evalCases.workspaceId, workspaceId),
        eq(t.evalCases.ownerKind, 'agent'),
        eq(t.evalCases.id, caseId),
      ),
    )
    .returning();
  return row ? detailOf(db, row) : undefined;
}

/**
 * Sets ONLY `expected_output[0].type` of the agent case made from `findingId` (one atomic UPDATE
 * with `jsonb_set`, so other fields/expectations are never rewritten). True when a row changed;
 * false when there is no such case, it is in another workspace, or it already has that type.
 */
export async function setFirstExpectationType(
  db: Db,
  workspaceId: string,
  findingId: string,
  type: EvalExpectation['type'],
): Promise<boolean> {
  const rows = await db
    .update(t.evalCases)
    .set({ expectedOutput: sql`jsonb_set(${t.evalCases.expectedOutput}, '{0,type}', to_jsonb(${type}::text))` })
    .where(
      and(
        eq(t.evalCases.workspaceId, workspaceId),
        eq(t.evalCases.ownerKind, 'agent'),
        eq(t.evalCases.sourceFindingId, findingId),
        sql`${t.evalCases.expectedOutput}->0->>'type' is distinct from ${type}::text`,
      ),
    )
    .returning({ id: t.evalCases.id });
  return rows.length > 0;
}

/** Delete a case; its run rows stay (case_id is set null, EC-9). False when it did not exist. */
export async function deleteCase(db: Db, workspaceId: string, caseId: string): Promise<boolean> {
  const rows = await db
    .delete(t.evalCases)
    .where(
      and(
        eq(t.evalCases.workspaceId, workspaceId),
        eq(t.evalCases.ownerKind, 'agent'),
        eq(t.evalCases.id, caseId),
      ),
    )
    .returning({ id: t.evalCases.id });
  return rows.length > 0;
}
