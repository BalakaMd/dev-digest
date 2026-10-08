import type { Db } from '../../db/client.js';
import type {
  EvalCaseDetail,
  EvalCaseRun,
  EvalCaseRunDetail,
  EvalCaseSummary,
  EvalDashboardOverview,
  EvalSuiteRun,
} from '@devdigest/shared';
import type { CompareCaseRow, RunScore } from './types.js';
import * as casesRepo from './repository/cases.repo.js';
import * as runsRepo from './repository/runs.repo.js';
import * as dashboardRepo from './repository/dashboard.repo.js';

export type { InsertCaseInput, UpdateCaseInput } from './repository/cases.repo.js';
export type {
  CaseRunActual,
  InsertCaseRunInput,
  ListSuiteRunsQuery,
} from './repository/runs.repo.js';

/**
 * SPEC-06 — eval data-access. The ONLY layer touching the DB for the eval domain.
 * Owns `eval_cases` (agent-owned), `eval_suite_runs` and the per-case `eval_runs`
 * rows. Every method is workspace-scoped (the boot reap and the per-run writes,
 * which address a run by id the service already resolved, are the exceptions) and
 * returns `@devdigest/shared` contract types. The query implementations live in
 * `./repository/`; this facade composes them.
 *
 * Concurrency guards are unique indexes, surfaced as values:
 *  - `createSuiteRun` → `{ kind: 'already_running' }` (one running run per agent)
 *  - `insertCase` → `{ created: false }` (one case per source finding)
 */
export class EvalRepository {
  constructor(private db: Db) {}

  // ---- cases --------------------------------------------------------------

  insertCase(
    workspaceId: string,
    input: casesRepo.InsertCaseInput,
  ): Promise<{ case: EvalCaseDetail; created: boolean }> {
    return casesRepo.insertCase(this.db, workspaceId, input);
  }

  getCase(workspaceId: string, caseId: string): Promise<EvalCaseDetail | undefined> {
    return casesRepo.getCase(this.db, workspaceId, caseId);
  }

  getCaseBySourceFinding(workspaceId: string, findingId: string): Promise<EvalCaseDetail | undefined> {
    return casesRepo.getCaseBySourceFinding(this.db, workspaceId, findingId);
  }

  /** Cases with their latest scored result, oldest first (AC-10). */
  listCases(workspaceId: string, agentId: string): Promise<EvalCaseSummary[]> {
    return casesRepo.listCases(this.db, workspaceId, agentId);
  }

  /** Cases with the stored input (no last result), oldest first — what a run executes. */
  listCaseDetails(workspaceId: string, agentId: string): Promise<EvalCaseDetail[]> {
    return casesRepo.listCaseDetails(this.db, workspaceId, agentId);
  }

  caseNamesForAgent(workspaceId: string, agentId: string): Promise<string[]> {
    return casesRepo.caseNamesForAgent(this.db, workspaceId, agentId);
  }

  countCases(workspaceId: string, agentId: string): Promise<number> {
    return casesRepo.countCases(this.db, workspaceId, agentId);
  }

  updateCase(
    workspaceId: string,
    caseId: string,
    patch: casesRepo.UpdateCaseInput,
  ): Promise<EvalCaseDetail | undefined> {
    return casesRepo.updateCase(this.db, workspaceId, caseId, patch);
  }

  deleteCase(workspaceId: string, caseId: string): Promise<boolean> {
    return casesRepo.deleteCase(this.db, workspaceId, caseId);
  }

  // ---- suite runs ---------------------------------------------------------

  createSuiteRun(
    workspaceId: string,
    input: { agentId: string; agentVersion: number; casesTotal: number },
  ): Promise<{ kind: 'created'; run: EvalSuiteRun } | { kind: 'already_running' }> {
    return runsRepo.createSuiteRun(this.db, workspaceId, input);
  }

  bumpProgress(runId: string, step: { errored: boolean; passed: boolean }): Promise<void> {
    return runsRepo.bumpProgress(this.db, runId, step);
  }

  finishSuiteRun(runId: string, score: RunScore, finishedAt: Date, durationMs: number): Promise<void> {
    return runsRepo.finishSuiteRun(this.db, runId, score, finishedAt, durationMs);
  }

  failSuiteRun(
    runId: string,
    error: string,
    finishedAt: Date,
    durationMs: number | null,
  ): Promise<void> {
    return runsRepo.failSuiteRun(this.db, runId, error, finishedAt, durationMs);
  }

  /** Boot reap (AC-74): `running` → `failed` for every workspace; returns how many. */
  failStaleRunning(reason: string, finishedAt: Date): Promise<number> {
    return runsRepo.failStaleRunning(this.db, reason, finishedAt);
  }

  getSuiteRun(workspaceId: string, runId: string): Promise<EvalSuiteRun | undefined> {
    return runsRepo.getSuiteRun(this.db, workspaceId, runId);
  }

  /** Any status unless `status` is set (Q-6); newest first. */
  listSuiteRuns(workspaceId: string, q?: runsRepo.ListSuiteRunsQuery): Promise<EvalSuiteRun[]> {
    return runsRepo.listSuiteRuns(this.db, workspaceId, q);
  }

  /** Completed runs of an agent, OLDEST first (trend chart, previous-run deltas). */
  listDoneRunsAscending(workspaceId: string, agentId: string, since?: Date): Promise<EvalSuiteRun[]> {
    return runsRepo.listDoneRunsAscending(this.db, workspaceId, agentId, since);
  }

  // ---- per-case result rows ----------------------------------------------

  insertCaseRun(input: runsRepo.InsertCaseRunInput): Promise<string> {
    return runsRepo.insertCaseRun(this.db, input);
  }

  listCaseRuns(workspaceId: string, runId: string): Promise<EvalCaseRun[]> {
    return runsRepo.listCaseRuns(this.db, workspaceId, runId);
  }

  getCaseRunDetail(
    workspaceId: string,
    runId: string,
    rowId: string,
  ): Promise<EvalCaseRunDetail | undefined> {
    return runsRepo.getCaseRunDetail(this.db, workspaceId, runId, rowId);
  }

  listCompareRows(workspaceId: string, runId: string): Promise<CompareCaseRow[]> {
    return runsRepo.listCompareRows(this.db, workspaceId, runId);
  }

  // ---- dashboard ----------------------------------------------------------

  dashboardOverview(
    workspaceId: string,
    opts: { sparkPoints: number; recentLimit: number },
  ): Promise<EvalDashboardOverview> {
    return dashboardRepo.overview(this.db, workspaceId, opts);
  }
}
