import { it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import * as t from '../../src/db/schema.js';
import { ScriptedLLM, type ScriptedCall, type ScriptedFinding } from './scripted-llm.js';
import {
  DIFF_B,
  addCase,
  createAgent,
  describeDb,
  installFetchTrap,
  makeApp,
  useEvalDb,
  waitRunFinished,
  type EvalApp,
} from './harness.js';

const at = (a: number, b = a): ScriptedFinding => ({ file: 'src/a.ts', start_line: a, end_line: b });
/** "GOOD" finds line 2 in every case, "BAD" flags nothing: so cases flip and recall drops. */
const respond = (c: ScriptedCall): ScriptedFinding[] => (c.system.includes('BAD') ? [] : [at(2)]);

const DAY = 86_400_000;

/**
 * SPEC-06 T-9 — history (AC-28, 55), compare (AC-31..33, EC-9), dashboard (AC-35, 36),
 * run-all (AC-44), the boot reap (AC-74) and "the agent edited during a run uses the start
 * configuration" (EC-13).
 */
describeDb('eval dashboard, compare, restart', () => {
  const env = useEvalDb();
  const trap = installFetchTrap();
  const llm = new ScriptedLLM({ respond });
  let app: EvalApp;

  beforeAll(async () => {
    app = await makeApp(env, { llm });
  });

  const run = async (agentId: string) => {
    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    expect(res.statusCode).toBe(202);
    return (await waitRunFinished(app, res.json().run_id)).run;
  };
  const edit = (agentId: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'PUT', url: `/agents/${agentId}`, payload });

  it('AC-28/55: history is newest first with all columns; status and period filters work', async () => {
    const agent = await createAgent(env);
    await addCase(app, agent.id, { name: 'h1' });
    const r1 = await run(agent.id);
    const r2 = await run(agent.id);
    // age the first run past 30 days
    await env.pg.handle.db
      .update(t.evalSuiteRuns)
      .set({ startedAt: new Date(Date.now() - 40 * DAY) })
      .where(eq(t.evalSuiteRuns.id, r1.id));

    const all = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` })).json();
    expect(all.map((r: any) => r.id)).toEqual([r2.id, r1.id]);
    expect(all[0]).toMatchObject({
      agent_id: agent.id,
      agent_version: 1,
      status: 'done',
      cases_total: 1,
      cases_passed: 1,
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
    });
    expect(all[0].started_at).toBeTruthy();
    expect(all[0].cost_usd).toBeCloseTo(0.01, 9);

    const d30 = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs?days=30` })).json();
    expect(d30.map((r: any) => r.id)).toEqual([r2.id]);
    const d90 = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs?days=90&limit=1` })).json();
    expect(d90).toHaveLength(1);
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs?days=0` })).statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs?status=failed` })).json()).toEqual([]);
    expect((await app.inject({ method: 'GET', url: `/agents/00000000-0000-4000-8000-000000000000/eval-runs` })).statusCode).toBe(404);
  });

  it('AC-31/32/33/41, EC-9: compare over shared cases, with a case added and one deleted between runs', async () => {
    const agent = await createAgent(env, { prompt: 'GOOD prompt line\nshared line' });
    const keep = await addCase(app, agent.id, { name: 'keep' });
    const gone = await addCase(app, agent.id, { name: 'gone' });
    const older = await run(agent.id);

    await app.inject({ method: 'DELETE', url: `/eval-cases/${gone.id}` }); // EC-9: deleted case
    await addCase(app, agent.id, { name: 'fresh', file: 'src/b.ts', diff: DIFF_B, start: 11, end: 11 }); // added case
    await edit(agent.id, { system_prompt: 'BAD prompt line\nshared line', model: 'gpt-4o' });
    const newer = await run(agent.id);
    expect(newer.agent_version).toBe(2);

    const res = await app.inject({ method: 'GET', url: `/eval/compare?a=${older.id}&b=${newer.id}` });
    expect(res.statusCode).toBe(200);
    const cmp = res.json();
    expect(cmp.only_in_older.map((c: any) => c.case_name)).toEqual(['gone']);
    expect(cmp.only_in_newer.map((c: any) => c.case_name)).toEqual(['fresh']);
    expect(cmp.shared_case_count).toBe(1);
    // over the shared case only: recall 1 -> 0, so -100 pp
    expect(cmp.recall).toEqual({ older: 1, newer: 0, delta_pp: -100 });
    expect(cmp.flipped).toEqual([
      expect.objectContaining({ case_id: keep.id, case_name: 'keep', from: 'passed', to: 'failed', expectation_types: ['must_find'] }),
    ]);
    expect(cmp.cost.older).toBeCloseTo(0.02, 9);
    expect(cmp.cost.newer).toBeCloseTo(0.02, 9); // every call costs 0.01, answers or not
    expect(cmp.cost.delta).toBeCloseTo(0, 9);
    expect(cmp.config_diff.model).toEqual({ older: 'gpt-4o-mini', newer: 'gpt-4o' });
    expect(cmp.config_diff.provider).toBeNull();
    expect(cmp.config_diff.system_prompt).toEqual([
      { kind: 'del', text: 'GOOD prompt line' },
      { kind: 'add', text: 'BAD prompt line' },
      { kind: 'same', text: 'shared line' },
    ]);
    expect(cmp.errored).toEqual({ older: 0, newer: 0 });
  });

  it('compare rejects: same run twice, unknown run, running run, runs of different agents', async () => {
    const a1 = await createAgent(env);
    const a2 = await createAgent(env);
    await addCase(app, a1.id, { name: 'x' });
    await addCase(app, a2.id, { name: 'y' });
    const r1 = await run(a1.id);
    const r2 = await run(a2.id);
    const q = (a: string, b: string) => app.inject({ method: 'GET', url: `/eval/compare?a=${a}&b=${b}` });
    expect((await q(r1.id, r1.id)).statusCode).toBe(422);
    expect((await q(r1.id, r2.id)).statusCode).toBe(422);
    expect((await q(r1.id, '00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
    expect((await q(r1.id, 'nope')).statusCode).toBe(422);
    const [running] = await env.pg.handle.db
      .insert(t.evalSuiteRuns)
      .values({ workspaceId: env.workspaceId, agentId: a1.id, agentVersion: 1, status: 'running', casesTotal: 1 })
      .returning();
    expect((await q(r1.id, running!.id)).statusCode).toBe(422);
    await env.pg.handle.db.delete(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.id, running!.id));
  });

  it('EC-13: an agent edited during a run is evaluated with its configuration at run start', async () => {
    const agent = await createAgent(env, { prompt: 'START-PROMPT GOOD' });
    await addCase(app, agent.id, { name: 'e1' });
    await addCase(app, agent.id, { name: 'e2' });
    let release!: () => void;
    llm.setGate(new Promise<void>((r) => (release = r)));
    const before = llm.calls.length;
    const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    await edit(agent.id, { system_prompt: 'EDITED-PROMPT BAD' });
    release();
    llm.setGate(undefined);
    const { run: done } = await waitRunFinished(app, res.json().run_id);
    const mine = llm.calls.slice(before);
    expect(done.agent_version).toBe(1);
    expect(mine).toHaveLength(2);
    expect(mine.every((c) => c.system.includes('START-PROMPT') && !c.system.includes('EDITED-PROMPT'))).toBe(true);
    expect(done.recall).toBe(1);
  });

  it('AC-35/36: the dashboard lists every agent (disabled, never run) and the 10 newest runs', async () => {
    const used = await createAgent(env, { name: 'dash-used' });
    const disabled = await createAgent(env, { name: 'dash-disabled', enabled: false });
    const never = await createAgent(env, { name: 'dash-never' });
    await addCase(app, used.id, { name: 'd1' });
    await addCase(app, disabled.id, { name: 'd2' });
    const runs = [];
    for (let i = 0; i < 3; i += 1) runs.push(await run(used.id));

    const res = await app.inject({ method: 'GET', url: '/eval/dashboard' });
    expect(res.statusCode).toBe(200);
    const dash = res.json();
    const byId = new Map<string, any>(dash.agents.map((a: any) => [a.agent_id, a]));
    expect(byId.get(never.id)).toMatchObject({ cases_total: 0, latest: null, running: null, recall_spark: [], enabled: true });
    expect(byId.get(disabled.id)).toMatchObject({ enabled: false, cases_total: 1, latest: null });
    const u = byId.get(used.id);
    expect(u).toMatchObject({ name: 'dash-used', model: 'gpt-4o-mini', provider: 'openai', cases_total: 1 });
    expect(u.latest.id).toBe(runs[2]!.id);
    expect(u.recall_spark).toEqual([1, 1, 1]);
    expect(dash.recent_runs.length).toBeLessThanOrEqual(10);
    expect(dash.recent_runs[0].id).toBe(runs[2]!.id);
    expect(dash.recent_runs[0].agent_name).toBe('dash-used');
    const started = dash.recent_runs.map((r: any) => r.started_at);
    expect([...started].sort().reverse()).toEqual(started);
  });

  it('AC-44: run-all starts only enabled agents with cases and no run in progress', async () => {
    const okAgent = await createAgent(env, { name: 'ra-ok' });
    const disabled = await createAgent(env, { name: 'ra-disabled', enabled: false });
    const empty = await createAgent(env, { name: 'ra-empty' });
    const busy = await createAgent(env, { name: 'ra-busy' });
    for (const a of [okAgent, disabled, busy]) await addCase(app, a.id, { name: `ra-${a.name}` });
    await env.pg.handle.db
      .insert(t.evalSuiteRuns)
      .values({ workspaceId: env.workspaceId, agentId: busy.id, agentVersion: 1, status: 'running', casesTotal: 1 });

    const res = await app.inject({ method: 'POST', url: '/eval/run-all' });
    expect(res.statusCode).toBe(200);
    const started: Array<{ agent_id: string; run_id: string }> = res.json().started;
    const ids = started.map((s) => s.agent_id);
    expect(ids).toContain(okAgent.id);
    expect(ids).not.toContain(disabled.id);
    expect(ids).not.toContain(empty.id);
    expect(ids).not.toContain(busy.id);
    for (const s of started) expect((await waitRunFinished(app, s.run_id)).run.status).toBe('done');
    // the busy agent's own run was left alone
    const busyRuns = await env.pg.handle.db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.agentId, busy.id));
    expect(busyRuns).toHaveLength(1);
    await env.pg.handle.db.delete(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.agentId, busy.id));
  });

  it('AC-74: booting the app fails every run left running, with a reason', async () => {
    const agent = await createAgent(env);
    await addCase(app, agent.id, { name: 'r1' });
    const [stale] = await env.pg.handle.db
      .insert(t.evalSuiteRuns)
      .values({ workspaceId: env.workspaceId, agentId: agent.id, agentVersion: 1, status: 'running', casesTotal: 1 })
      .returning();
    const rebooted = await makeApp(env, { llm });
    const [row] = await env.pg.handle.db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.id, stale!.id));
    expect(row).toMatchObject({ status: 'failed' });
    expect(row!.error).toMatch(/restarted/i);
    expect(row!.finishedAt).not.toBeNull();
    // the agent can run again
    const res = await rebooted.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    expect(res.statusCode).toBe(202);
    await waitRunFinished(rebooted, res.json().run_id);
    // failed runs are listed with their status (Q-6) and cannot be compared
    const hist = (await rebooted.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` })).json();
    expect(hist.map((r: any) => r.status).sort()).toEqual(['done', 'failed']);
    await rebooted.close();
  });

  it('NFR-8: no network call, no intent classifier use', () => {
    expect(trap.calls).toEqual([]);
    expect(env.intentCalls.n).toBe(0);
  });
});
