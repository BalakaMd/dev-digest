import { it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import * as t from '../../src/db/schema.js';
import {
  DIFF_A,
  DIFF_B,
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

const TWO_FILES = `${DIFF_A}\n${DIFF_B}`;

/**
 * SPEC-06 T-6 — `POST /findings/:id/eval-case`: AC-1, 2, 4 (server), 7, 8, 9, 13, 65, 66,
 * the double-click race, and "a large finding patch is stored without a size check" (EC-14).
 */
describeDb('eval cases from findings', () => {
  const env = useEvalDb();
  const trap = installFetchTrap();
  let app: EvalApp;
  let agentId: string;
  let reviewId: string;
  let prId: string;

  beforeAll(async () => {
    app = await makeApp(env, { diff: TWO_FILES });
    agentId = (await createAgent(env)).id;
    const { pr } = await seedPr(env, { title: 'Add things', body: 'PR body text' });
    prId = pr.id;
    reviewId = (await seedReview(env, prId, agentId)).id;
  });

  const post = (findingId: string) => app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` });
  const casesOf = async (id = agentId) =>
    (await app.inject({ method: 'GET', url: `/agents/${id}/eval-cases` })).json() as Array<Record<string, any>>;

  it('AC-1/13: accepted finding -> must_find case with the whole file patch and the PR snapshot', async () => {
    const f = await seedFinding(env, reviewId, { accepted: true, file: 'src/a.ts', start: 2, end: 2, title: 'Alpha Bug in Parser' });
    const res = await post(f.id);
    expect(res.statusCode).toBe(201);
    const { case: c, created } = res.json();
    expect(created).toBe(true);
    expect(c.agent_id).toBe(agentId);
    expect(c.name).toBe('alpha-bug-in-parser');
    expect(c.source_finding_id).toBe(f.id);
    expect(c.expected_output).toEqual([
      expect.objectContaining({ type: 'must_find', file: 'src/a.ts', start_line: 2, end_line: 2 }),
    ]);
    expect(c.input_diff).toContain('+added2');
    expect(c.input_diff).not.toContain('src/b.ts'); // only the finding's file
    expect(c.input_meta).toEqual({ title: 'Add things', body: 'PR body text' });
    expect(c.input_files).toEqual(['src/a.ts']);
    const detail = (await app.inject({ method: 'GET', url: `/eval-cases/${c.id}` })).json();
    expect(detail.input_diff).toBe(c.input_diff);
  });

  it('AC-2: dismissed finding -> must_not_flag case', async () => {
    const f = await seedFinding(env, reviewId, { dismissed: true, file: 'src/b.ts', start: 11, end: 11, title: 'Beta nit' });
    const res = await post(f.id);
    expect(res.statusCode).toBe(201);
    expect(res.json().case.expected_output[0].type).toBe('must_not_flag');
    expect(res.json().case.input_diff).toContain('+eleven');
  });

  it('AC-4: an undecided finding is rejected (422) and nothing is stored', async () => {
    const before = (await casesOf()).length;
    const f = await seedFinding(env, reviewId, { title: 'Undecided' });
    const res = await post(f.id);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toMatch(/accepted or dismissed/);
    expect((await casesOf()).length).toBe(before);
  });

  it('AC-9: a second request returns the existing case (200, created:false)', async () => {
    const f = await seedFinding(env, reviewId, { accepted: true, title: 'Gamma' });
    const first = (await post(f.id)).json();
    const second = await post(f.id);
    expect(second.statusCode).toBe(200);
    expect(second.json().created).toBe(false);
    expect(second.json().case.id).toBe(first.case.id);
  });

  it('AC-9: a double click (concurrent requests) creates exactly one case', async () => {
    const f = await seedFinding(env, reviewId, { accepted: true, title: 'Delta race' });
    const [a, b] = await Promise.all([post(f.id), post(f.id)]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(a.json().case.id).toBe(b.json().case.id);
    const rows = await env.pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, f.id));
    expect(rows).toHaveLength(1);
  });

  it('AC-8: equal titles get -2, -3 suffixes', async () => {
    const a = await createAgent(env);
    const rid = (await seedReview(env, prId, a.id)).id;
    const names: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const f = await seedFinding(env, rid, { accepted: true, title: 'Same Title!' });
      names.push((await post(f.id)).json().case.name);
    }
    expect(names).toEqual(['same-title', 'same-title-2', 'same-title-3']);
  });

  it('AC-65 replaced by decision-sync (D1): a decision change via the API re-types the case', async () => {
    const a = await createAgent(env);
    const rid = (await seedReview(env, prId, a.id)).id;
    const f = await seedFinding(env, rid, { accepted: true, title: 'Flip me' });
    const created = (await post(f.id)).json().case;
    expect((await app.inject({ method: 'POST', url: `/findings/${f.id}/dismiss` })).statusCode).toBe(200);
    const list = await casesOf(a.id);
    expect(list).toHaveLength(1);
    expect(list[0]!.expected_output[0].type).toBe('must_not_flag');
    // and the card can still ask again: the existing case comes back
    const again = await post(f.id);
    expect(again.json().created).toBe(false);
    expect(again.json().case.id).toBe(created.id);
  });

  it('AC-66: every kind is allowed (secret_leak, lethal_trifecta, phantom, hook)', async () => {
    const a = await createAgent(env);
    const rid = (await seedReview(env, prId, a.id)).id;
    for (const kind of ['secret_leak', 'lethal_trifecta', 'phantom', 'hook']) {
      const f = await seedFinding(env, rid, { accepted: true, kind, title: `kind ${kind}` });
      expect((await post(f.id)).statusCode).toBe(201);
    }
    expect(await casesOf(a.id)).toHaveLength(4);
  });

  it('AC-7: a deleted agent -> 409 agent_deleted and no case', async () => {
    const a = await createAgent(env);
    const rid = (await seedReview(env, prId, a.id)).id;
    const f = await seedFinding(env, rid, { accepted: true, title: 'Orphan' });
    expect((await app.inject({ method: 'DELETE', url: `/agents/${a.id}` })).statusCode).toBe(200);
    const res = await post(f.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('agent_deleted');
    expect(res.json().error.message).toMatch(/deleted/);
    const rows = await env.pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, f.id));
    expect(rows).toHaveLength(0);
    // a review without any agent id behaves the same
    const noAgent = await seedReview(env, prId, null);
    const f2 = await seedFinding(env, noAgent.id, { accepted: true, title: 'No agent' });
    expect((await post(f2.id)).statusCode).toBe(409);
  });

  it('Q-3: a file that is not in the PR diff -> 422 diff_unavailable, no case', async () => {
    const a = await createAgent(env);
    const rid = (await seedReview(env, prId, a.id)).id;
    const f = await seedFinding(env, rid, { accepted: true, file: 'src/missing.ts', title: 'Gone' });
    const res = await post(f.id);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('diff_unavailable');
    expect(await casesOf(a.id)).toHaveLength(0);
  });

  it('unknown finding id -> 404, malformed id -> 422', async () => {
    expect((await post('00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
    expect((await post('not-a-uuid')).statusCode).toBe(422);
  });

  it('EC-14: a patch larger than 1 MB is stored whole (no size check for cases from findings)', async () => {
    const big = `diff --git a/src/big.ts b/src/big.ts\n--- a/src/big.ts\n+++ b/src/big.ts\n@@ -1,1 +1,${20_000} @@\n${Array.from({ length: 20_000 }, (_, i) => `+const v${i} = "${'x'.repeat(60)}";`).join('\n')}`;
    expect(big.length).toBeGreaterThan(1_048_576);
    const bigApp = await makeApp(env, { diff: big });
    const a = await createAgent(env);
    const { pr } = await seedPr(env);
    const rid = (await seedReview(env, pr.id, a.id)).id;
    const f = await seedFinding(env, rid, { accepted: true, file: 'src/big.ts', start: 5, end: 5, title: 'Big one' });
    const res = await bigApp.inject({ method: 'POST', url: `/findings/${f.id}/eval-case` });
    expect(res.statusCode).toBe(201);
    expect(res.json().case.input_diff.length).toBeGreaterThan(1_048_576);
    await bigApp.close();
  });

  it('keeps the other tests hermetic: no network call was attempted', () => {
    expect(trap.calls).toEqual([]);
    expect(env.intentCalls.n).toBe(0);
  });
});
