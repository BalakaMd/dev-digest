import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from '../helpers/pg.js';
import { seed } from '../../src/db/seed.js';
import * as t from '../../src/db/schema.js';
import { EvalRepository } from '../../src/modules/eval/repository.js';
import { scoreRun } from '../../src/modules/eval/scoring.js';
import type { EvalExpectation } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const EXP: EvalExpectation[] = [{ type: 'must_find', file: 'a.ts', start_line: 1, end_line: 3 }];

/** Smoke + guard tests of `EvalRepository` (unique-index guards, boot reap, listings). */
d('EvalRepository', () => {
  let pg: PgFixture;
  let repo: EvalRepository;
  let ws: string;
  let agentId: string;
  let otherAgentId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    repo = new EvalRepository(pg.handle.db);
    const [w] = await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    ws = w!.id;
    const mk = async (name: string) =>
      (
        await pg.handle.db
          .insert(t.agents)
          .values({ workspaceId: ws, name, provider: 'openai', model: 'm', systemPrompt: 'p' })
          .returning()
      )[0]!.id;
    agentId = await mk('Repo A');
    otherAgentId = await mk('Repo B');
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const newCase = (name: string, extra: { sourceFindingId?: string } = {}) =>
    repo.insertCase(ws, {
      agentId,
      name,
      inputDiff: 'diff',
      inputFiles: ['a.ts'],
      inputMeta: { title: 'T', body: 'B' },
      expectedOutput: EXP,
      ...extra,
    });

  it('cases: insert/list/update/delete, newest-last order, names, workspace scoping', async () => {
    const a = await newCase('one');
    const b = await newCase('two');
    expect(a.created).toBe(true);
    expect((await repo.listCases(ws, agentId)).map((c) => c.name)).toEqual(['one', 'two']);
    expect(await repo.caseNamesForAgent(ws, agentId)).toEqual(['one', 'two']);
    expect(await repo.countCases(ws, agentId)).toBe(2);
    expect((await repo.listCases(ws, agentId))[0]!.last_result).toBeNull();

    const upd = await repo.updateCase(ws, a.case.id, { name: 'uno' });
    expect(upd?.name).toBe('uno');
    expect(upd?.input_diff).toBe('diff'); // input untouched
    expect(await repo.getCase('00000000-0000-0000-0000-000000000000', a.case.id)).toBeUndefined();

    expect(await repo.deleteCase(ws, b.case.id)).toBe(true);
    expect(await repo.deleteCase(ws, b.case.id)).toBe(false);
  });

  it('one case per source finding: a second insert returns the existing case', async () => {
    const [f] = await pg.handle.db.select().from(t.findings).limit(1);
    if (!f) return; // seed has findings; guard only for an empty seed
    const first = await newCase('from-finding', { sourceFindingId: f.id });
    const second = await newCase('from-finding-2', { sourceFindingId: f.id });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.case.id).toBe(first.case.id);
    expect((await repo.getCaseBySourceFinding(ws, f.id))?.id).toBe(first.case.id);
  });

  it('suite runs: one running run per agent, progress, finish, history, last_result, boot reap', async () => {
    const c = (await repo.listCases(ws, agentId))[0]!;
    const r1 = await repo.createSuiteRun(ws, { agentId, agentVersion: 1, casesTotal: 2 });
    expect(r1.kind).toBe('created');
    expect((await repo.createSuiteRun(ws, { agentId, agentVersion: 1, casesTotal: 2 })).kind).toBe('already_running');
    // another agent is not blocked
    const other = await repo.createSuiteRun(ws, { agentId: otherAgentId, agentVersion: 1, casesTotal: 1 });
    expect(other.kind).toBe('created');
    const runId = r1.kind === 'created' ? r1.run.id : '';

    await repo.insertCaseRun({
      suiteRunId: runId, caseId: c.id, caseName: c.name, status: 'ok', expectations: EXP,
      actual: { findings: [], dropped: [], expectation_matches: [] },
      passed: true, findingsReturned: 2, findingsKept: 1, mustFindTotal: 1, mustFindMatched: 1,
      mustNotFlagHits: 0, durationMs: 10, costUsd: 0.01,
    });
    await repo.bumpProgress(runId, { errored: false, passed: true });
    expect((await repo.getSuiteRun(ws, runId))?.cases_done).toBe(1);

    const score = scoreRun([
      { status: 'ok', passed: true, findings_returned: 2, findings_kept: 1, must_find_total: 1,
        must_find_matched: 1, must_not_flag_hits: 0, cost_usd: 0.01 },
    ]);
    await repo.finishSuiteRun(runId, score, new Date(), 10);
    const done = await repo.getSuiteRun(ws, runId);
    expect(done).toMatchObject({ status: 'done', recall: 1, precision: 1, citation_accuracy: 0.5, agent_name: 'Repo A' });

    // a finished run no longer blocks a new one
    expect((await repo.createSuiteRun(ws, { agentId, agentVersion: 2, casesTotal: 1 })).kind).toBe('created');

    const rows = await repo.listCaseRuns(ws, runId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ case_name: c.name, passed: true, expected_count: 1, returned_count: 1 });
    expect((await repo.getCaseRunDetail(ws, runId, rows[0]!.id))?.expectations).toEqual(EXP);
    expect((await repo.listCompareRows(ws, runId))[0]).toMatchObject({ case_id: c.id, expectation_types: ['must_find'] });
    expect((await repo.listCases(ws, agentId)).find((x) => x.id === c.id)?.last_result).toMatchObject({
      passed: true, expected_count: 1, returned_count: 1,
    });

    // history: any status, newest first; status filter
    const all = await repo.listSuiteRuns(ws, { agentId });
    expect(all.map((r) => r.agent_version)).toEqual([2, 1]);
    expect((await repo.listSuiteRuns(ws, { agentId, status: 'done' })).map((r) => r.id)).toEqual([runId]);
    expect(await repo.listSuiteRuns(ws, { agentId, since: new Date(Date.now() + 60_000) })).toEqual([]);

    // dashboard overview
    const ov = await repo.dashboardOverview(ws, { sparkPoints: 10, recentLimit: 10 });
    const a = ov.agents.find((x) => x.agent_id === agentId)!;
    expect(a.latest?.id).toBe(runId);
    expect(a.running?.agent_version).toBe(2);
    expect(a.recall_spark).toEqual([1]);
    expect(ov.agents.some((x) => x.agent_id === otherAgentId && x.latest === null)).toBe(true);
    expect(ov.recent_runs.length).toBeGreaterThan(0);

    // boot reap
    const reaped = await repo.failStaleRunning('API restarted', new Date());
    expect(reaped).toBe(2);
    const failed = await repo.listSuiteRuns(ws, { status: 'failed' });
    expect(failed.every((r) => r.error === 'API restarted')).toBe(true);
  });

  it('deleting a case keeps its run rows (case_id set null)', async () => {
    const c = await newCase('doomed');
    const run = await repo.createSuiteRun(ws, { agentId: otherAgentId, agentVersion: 1, casesTotal: 1 });
    const runId = run.kind === 'created' ? run.run.id : '';
    await repo.insertCaseRun({
      suiteRunId: runId, caseId: c.case.id, caseName: 'doomed', status: 'error', error: 'boom',
      expectations: EXP, actual: null, passed: null, findingsReturned: 0, findingsKept: 0,
      mustFindTotal: 0, mustFindMatched: 0, mustNotFlagHits: 0, durationMs: null, costUsd: null,
    });
    await repo.deleteCase(ws, c.case.id);
    const rows = await repo.listCaseRuns(ws, runId);
    expect(rows[0]).toMatchObject({ case_id: null, case_name: 'doomed', status: 'error', error: 'boom', passed: null });
  });
});
