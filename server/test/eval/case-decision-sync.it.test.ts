import { it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import * as t from '../../src/db/schema.js';
import {
  DIFF_A,
  addCase,
  createAgent,
  describeDb,
  installFetchTrap,
  makeApp,
  seedFinding,
  seedPr,
  seedReview,
  useEvalDb,
  type EvalApp,
} from './harness.js';

/** Decision sync (D1/D2): accept <-> dismiss re-types the eval case made from the finding. */
describeDb('eval case follows the decision on its finding', () => {
  const env = useEvalDb();
  installFetchTrap();
  let app: EvalApp;
  let agentId: string;
  let reviewId: string;

  beforeAll(async () => {
    app = await makeApp(env, { diff: DIFF_A });
    agentId = (await createAgent(env)).id;
    const { pr } = await seedPr(env, { title: 'PR', body: 'b' });
    reviewId = (await seedReview(env, pr.id, agentId)).id;
  });

  const act = (id: string, a: 'accept' | 'dismiss') => app.inject({ method: 'POST', url: `/findings/${id}/${a}` });
  const mkCase = (id: string) => app.inject({ method: 'POST', url: `/findings/${id}/eval-case` });
  const casesOf = async () =>
    (await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-cases` })).json() as Array<Record<string, any>>;
  const detail = async (id: string) => (await app.inject({ method: 'GET', url: `/eval-cases/${id}` })).json();

  it('accept -> case -> dismiss -> accept flips the type; one case, same id/name, button stays disabled', async () => {
    const f = await seedFinding(env, reviewId, { accepted: true, title: 'Flip Flop' });
    const c = (await mkCase(f.id)).json().case;
    expect(c.expected_output[0].type).toBe('must_find');

    expect((await act(f.id, 'dismiss')).statusCode).toBe(200);
    let d = await detail(c.id);
    expect(d.expected_output[0].type).toBe('must_not_flag');
    expect(d.name).toBe(c.name);

    expect((await act(f.id, 'accept')).statusCode).toBe(200);
    d = await detail(c.id);
    expect(d.expected_output[0].type).toBe('must_find');

    const list = (await casesOf()).filter((x) => x.source_finding_id === f.id || x.id === c.id);
    expect(list).toHaveLength(1);
    const again = (await mkCase(f.id)).json();
    expect(again.created).toBe(false);
    expect(again.case.id).toBe(c.id);
  });

  it('D2: manual edits survive - only [0].type changes', async () => {
    const f = await seedFinding(env, reviewId, { accepted: true, title: 'Manual edits' });
    const c = (await mkCase(f.id)).json().case;
    const edited = [
      { ...c.expected_output[0], title: 'my title' },
      { type: 'must_find', file: 'src/a.ts', start_line: 2, end_line: 2 },
    ];
    const put = await app.inject({
      method: 'PUT',
      url: `/eval-cases/${c.id}`,
      payload: { name: 'renamed', expected_output: edited },
    });
    expect(put.statusCode).toBe(200);
    await act(f.id, 'dismiss');
    const d = await detail(c.id);
    expect(d.name).toBe('renamed');
    expect(d.expected_output[0]).toEqual({ ...edited[0], type: 'must_not_flag' });
    expect(d.expected_output[1]).toEqual(edited[1]);
    expect(d.input_diff).toBe(c.input_diff);
    expect(d.input_meta).toEqual(c.input_meta);
    expect(d.input_files).toEqual(c.input_files);
  });

  it('finding without a case: accept/dismiss work and no case appears; other and manual cases untouched', async () => {
    const withCase = await seedFinding(env, reviewId, { accepted: true, title: 'Has case' });
    const other = (await mkCase(withCase.id)).json().case;
    const manual = await addCase(app, agentId, { name: 'manual-sync-guard', type: 'must_find' });
    const before = (await casesOf()).length;

    const bare = await seedFinding(env, reviewId, { title: 'No case' });
    expect((await act(bare.id, 'accept')).statusCode).toBe(200);
    expect((await act(bare.id, 'dismiss')).statusCode).toBe(200);

    expect(await casesOf()).toHaveLength(before);
    expect((await detail(other.id)).expected_output[0].type).toBe('must_find');
    expect((await detail(manual.id)).expected_output[0].type).toBe('must_find');
  });

  it('repeating the same decision changes nothing; run history and metrics are untouched', async () => {
    const f = await seedFinding(env, reviewId, { accepted: true, title: 'History guard' });
    const c = (await mkCase(f.id)).json().case;
    const db = env.pg.handle.db;
    const [suite] = await db
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId: (await db.select().from(t.agents).where(eq(t.agents.id, agentId)))[0]!.workspaceId,
        agentId, agentVersion: 1, status: 'done', casesTotal: 1, casesDone: 1, casesPassed: 1, recall: 1, precision: 1,
      })
      .returning();
    const snapshot = c.expected_output;
    const [run] = await db
      .insert(t.evalRuns)
      .values({ caseId: c.id, suiteRunId: suite!.id, caseName: c.name, expectedSnapshot: snapshot, pass: true })
      .returning();

    await act(f.id, 'accept'); // same decision
    expect((await detail(c.id)).expected_output[0].type).toBe('must_find');
    await act(f.id, 'dismiss');
    expect((await detail(c.id)).expected_output[0].type).toBe('must_not_flag');

    const [runAfter] = await db.select().from(t.evalRuns).where(eq(t.evalRuns.id, run!.id));
    expect(runAfter!.expectedSnapshot).toEqual(snapshot);
    const [suiteAfter] = await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.id, suite!.id));
    expect(suiteAfter).toEqual(suite);
  });

  it('404 for an unknown finding is unchanged', async () => {
    const res = await act('00000000-0000-0000-0000-000000000000', 'dismiss');
    expect(res.statusCode).toBe(404);
  });
});
