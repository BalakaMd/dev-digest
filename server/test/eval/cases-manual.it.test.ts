import { it, expect, beforeAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import * as t from '../../src/db/schema.js';
import { ScriptedLLM } from './scripted-llm.js';
import {
  DIFF_A,
  addCase,
  createAgent,
  describeDb,
  installFetchTrap,
  makeApp,
  useEvalDb,
  type EvalApp,
} from './harness.js';

/**
 * SPEC-06 T-7 — manual cases and single-case runs: AC-10 (list + last result), 12, 51,
 * 53, 71, 72, 75, name > 120 -> 422, EC-14 (body > 1 MB -> 413, nothing stored).
 */
describeDb('eval cases (manual) and single-case runs', () => {
  const env = useEvalDb();
  const trap = installFetchTrap();
  const llm = new ScriptedLLM({ respond: () => [{ file: 'src/a.ts', start_line: 2, end_line: 2, title: 'Found it' }] });
  let app: EvalApp;
  let agentId: string;

  beforeAll(async () => {
    app = await makeApp(env, { llm });
    agentId = (await createAgent(env)).id;
  });

  const body = (over: Record<string, unknown> = {}) => ({
    name: 'manual-1',
    input_diff: DIFF_A,
    input_meta: { title: 'T', body: 'B' },
    expected_output: [{ type: 'must_find', file: 'src/a.ts', start_line: 2, end_line: 2 }],
    ...over,
  });
  const create = (over: Record<string, unknown> = {}, id = agentId) =>
    app.inject({ method: 'POST', url: `/agents/${id}/eval-cases`, payload: body(over) });
  const count = async () =>
    (await env.pg.handle.db.select({ n: sql<number>`count(*)::int` }).from(t.evalCases))[0]!.n;

  it('AC-71/10: creates a case (optional notes kept) and lists it with last_result null', async () => {
    const res = await create({
      expected_output: [
        { type: 'must_find', file: 'src/a.ts', start_line: 2, end_line: 2, title: 'note', severity: 'high', category: 'bug' },
        { type: 'must_not_flag', file: 'src/a.ts', start_line: 1, end_line: 1 },
      ],
    });
    expect(res.statusCode).toBe(201);
    const c = res.json();
    expect(c.input_files).toEqual(['src/a.ts']);
    expect(c.expected_output[0]).toMatchObject({ title: 'note', severity: 'high', category: 'bug' });
    const list = (await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-cases` })).json();
    expect(list.map((x: any) => x.name)).toContain('manual-1');
    expect(list.find((x: any) => x.id === c.id).last_result).toBeNull();
    expect(list[0]).not.toHaveProperty('input_diff'); // the list is a summary
  });

  it('AC-71: invalid expected output is rejected with 422 before the handler', async () => {
    const before = await count();
    for (const expected_output of [
      [],
      [{ type: 'maybe', file: 'src/a.ts', start_line: 1, end_line: 1 }],
      [{ type: 'must_find', file: '', start_line: 1, end_line: 1 }],
      [{ type: 'must_find', file: 'src/a.ts', start_line: 1.5, end_line: 1 }],
    ]) {
      expect((await create({ expected_output })).statusCode).toBe(422);
    }
    expect(await count()).toBe(before);
  });

  it('name: empty and > 120 chars -> 422', async () => {
    expect((await create({ name: '' })).statusCode).toBe(422);
    expect((await create({ name: 'n'.repeat(121) })).statusCode).toBe(422);
    expect((await create({ name: 'n'.repeat(120) })).statusCode).toBe(201);
  });

  it('unknown agent -> 404; a diff without files -> 422', async () => {
    expect((await create({}, '00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
    expect((await create({ input_diff: 'not a diff' })).statusCode).toBe(422);
  });

  it('AC-75: an expectation outside the case diff is rejected with the reason', async () => {
    const before = await count();
    const wrongFile = await create({
      expected_output: [{ type: 'must_find', file: 'src/other.ts', start_line: 1, end_line: 1 }],
    });
    expect(wrongFile.statusCode).toBe(422);
    expect(wrongFile.json().error.message).toMatch(/src\/other\.ts.*not in the case diff/);
    const wrongLines = await create({
      expected_output: [{ type: 'must_find', file: 'src/a.ts', start_line: 500, end_line: 510 }],
    });
    expect(wrongLines.statusCode).toBe(422);
    expect(wrongLines.json().error.message).toMatch(/do not intersect any hunk/);
    expect(await count()).toBe(before);
  });

  it('AC-72: the stored input cannot be changed (strict schema); name and expectations can', async () => {
    const c = (await create({ name: 'editable' })).json();
    for (const extra of [{ input_diff: 'x' }, { input_meta: { title: 'a', body: 'b' } }, { input_files: [] }]) {
      expect(
        (await app.inject({ method: 'PUT', url: `/eval-cases/${c.id}`, payload: { name: 'renamed', ...extra } })).statusCode,
      ).toBe(422);
    }
    const ok = await app.inject({
      method: 'PUT',
      url: `/eval-cases/${c.id}`,
      payload: { name: 'renamed', expected_output: [{ type: 'must_not_flag', file: 'src/a.ts', start_line: 3, end_line: 4 }] },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ name: 'renamed', input_diff: DIFF_A });
    expect(ok.json().expected_output[0].type).toBe('must_not_flag');
    // AC-75 also applies on edit
    const bad = await app.inject({
      method: 'PUT',
      url: `/eval-cases/${c.id}`,
      payload: { expected_output: [{ type: 'must_find', file: 'src/zzz.ts', start_line: 1, end_line: 1 }] },
    });
    expect(bad.statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: `/eval-cases/${c.id}` })).json().name).toBe('renamed');
    expect((await app.inject({ method: 'PUT', url: `/eval-cases/00000000-0000-4000-8000-000000000000`, payload: { name: 'x' } })).statusCode).toBe(404);
  });

  it('AC-51/53: running one case updates only its last result and creates no run', async () => {
    const a = await createAgent(env);
    const c = await addCase(app, a.id, { name: 'single' });
    const suiteBefore = (await env.pg.handle.db.select({ n: sql<number>`count(*)::int` }).from(t.evalSuiteRuns))[0]!.n;
    const callsBefore = llm.calls.length;

    const res = await app.inject({ method: 'POST', url: `/eval-cases/${c.id}/run` });
    expect(res.statusCode).toBe(200);
    expect(res.json().last_result).toMatchObject({ passed: true, expected_count: 1, returned_count: 1, cost_usd: 0.01 });
    expect(res.json().last_result.duration_ms).toBeGreaterThanOrEqual(0);
    expect(llm.calls.length).toBe(callsBefore + 1);

    const suiteAfter = (await env.pg.handle.db.select({ n: sql<number>`count(*)::int` }).from(t.evalSuiteRuns))[0]!.n;
    expect(suiteAfter).toBe(suiteBefore);
    const hist = await app.inject({ method: 'GET', url: `/agents/${a.id}/eval-runs` });
    expect(hist.json()).toEqual([]);
    const rows = await env.pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.caseId, c.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.suiteRunId).toBeNull();

    const list = (await app.inject({ method: 'GET', url: `/agents/${a.id}/eval-cases` })).json();
    expect(list[0].last_result.passed).toBe(true);
  });

  it('AC-51: a failing model call stores no result and answers with the error', async () => {
    const a = await createAgent(env);
    const c = await addCase(app, a.id, { name: 'will-fail' });
    llm.setRespond(() => {
      throw new Error('upstream exploded');
    });
    const res = await app.inject({ method: 'POST', url: `/eval-cases/${c.id}/run` });
    llm.setRespond(() => [{ file: 'src/a.ts', start_line: 2, end_line: 2 }]);
    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toContain('upstream exploded');
    const rows = await env.pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.caseId, c.id));
    expect(rows).toHaveLength(0);
  });

  it('AC-18 (single case): a missing provider key -> 422 before any model call', async () => {
    const noKey = await makeApp(env, { llm, keys: {} });
    const a = await createAgent(env);
    const c = await addCase(app, a.id, { name: 'nokey' });
    const before = llm.calls.length;
    const res = await noKey.inject({ method: 'POST', url: `/eval-cases/${c.id}/run` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('missing_key');
    expect(llm.calls.length).toBe(before);
    await noKey.close();
  });

  it('AC-12: delete removes the case; a second delete is 404', async () => {
    const a = await createAgent(env);
    const c = await addCase(app, a.id, { name: 'to-delete' });
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'GET', url: `/agents/${a.id}/eval-cases` })).json()).toEqual([]);
    expect((await app.inject({ method: 'GET', url: `/eval-cases/${c.id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` })).statusCode).toBe(404);
  });

  it('EC-14: a body over the global 1 MB cap -> 413 and nothing is stored', async () => {
    const before = await count();
    const huge = 'x'.repeat(1_100_000);
    const res = await create({ name: 'too-big', input_diff: `${DIFF_A}\n+${huge}` });
    expect(res.statusCode).toBe(413);
    expect(await count()).toBe(before);
  });

  it('NFR-8: no network call, no intent classifier use', () => {
    expect(trap.calls).toEqual([]);
    expect(env.intentCalls.n).toBe(0);
  });
});
