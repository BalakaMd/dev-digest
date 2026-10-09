import { it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import * as t from '../../src/db/schema.js';
import {
  DIFF_A,
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

const SOURCE = [
  "import type { App } from './app';", '', '// Types', '', '', 'interface Req {', '  params: { id: string };', '}',
  '', '', '', '', '', '', 'export function registerRoutes(app: App) {',
  "  app.get('/users', async (req, reply) => {", '    const users = await db.users();', '    return users;', '  });',
  '', '', "  app.get('/users/:id', async (req: Req) => {", '    const id = req.params.id;', '    return db.find(id);', '  });', '}',
];
const ROUTES = `diff --git a/src/routes.ts b/src/routes.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/routes.ts\n@@ -0,0 +1,${SOURCE.length} @@\n${SOURCE.map((l) => `+${l}`).join('\n')}\n`;
const README = 'diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1,2 +1,3 @@\n # Title\n+Use `needleTerm` here\n tail\n';
const TITLE = 'Unhandled promise rejection in GET /users route';

/**
 * SPEC-07 T-4 — `GET /findings/:id/eval-case/suggestion` and the optional range of
 * `POST /findings/:id/eval-case`: AC-3, 4, 13, 14, 15, 18, 35..39, 43, 44, NFR-1, NFR-7.
 */
describeDb('eval case line suggestion', () => {
  const env = useEvalDb();
  const trap = installFetchTrap();
  let app: EvalApp;
  let agentId: string;
  let reviewId: string;

  beforeAll(async () => {
    app = await makeApp(env, { diff: `${ROUTES}${README}${DIFF_A}\n` });
    agentId = (await createAgent(env)).id;
    const { pr } = await seedPr(env);
    reviewId = (await seedReview(env, pr.id, agentId)).id;
  });

  const get = (id: string) => app.inject({ method: 'GET', url: `/findings/${id}/eval-case/suggestion` });
  const post = (id: string, payload?: unknown) =>
    app.inject({ method: 'POST', url: `/findings/${id}/eval-case`, ...(payload === undefined ? {} : { payload: payload as object }) });
  const caseRows = async (fid: string) =>
    env.pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, fid));
  const routesFinding = (o: Parameters<typeof seedFinding>[2] = {}) =>
    seedFinding(env, reviewId, { accepted: true, file: 'src/routes.ts', start: 6, end: 8, title: TITLE, ...o });

  it('AC-36/AC-37/NFR-1: suggestion shape, 16-19 for the first example, stores nothing, deterministic', async () => {
    const f = await routesFinding();
    const res = await get(f.id);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.existing_case).toBeNull();
    const s = body.suggestion;
    expect(s).toMatchObject({
      file: 'src/routes.ts',
      type: 'must_find',
      cited: { start_line: 6, end_line: 8 },
      suggested: { start_line: 16, end_line: 19 },
      hunks: [{ start_line: 1, end_line: SOURCE.length }],
    });
    expect(s.reason).toMatchObject({ structure_available: true, function_too_long: false, expanded_to_function: { name: null } });
    expect(s.reason.terms).toEqual([{ term: "'/users'", count: 1 }]);
    expect(s.patch_lines).toHaveLength(SOURCE.length);
    expect(s.patch_lines[15]).toEqual({ line: 16, text: SOURCE[15] });
    expect(s.patch_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(await caseRows(f.id)).toHaveLength(0);
    expect((await get(f.id)).body).toBe(res.body);
  });

  it('AC-38: same errors as POST (404, 422 undecided, 409 deleted agent, 422 missing file)', async () => {
    expect((await get('00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
    const undecided = await seedFinding(env, reviewId, { file: 'src/routes.ts' });
    const u = await get(undecided.id);
    expect(u.statusCode).toBe(422);
    expect(u.json().error.message).toBe((await post(undecided.id)).json().error.message);

    const a = await createAgent(env);
    const rid = (await seedReview(env, (await seedPr(env)).pr.id, a.id)).id;
    const orphan = await seedFinding(env, rid, { accepted: true, file: 'src/routes.ts' });
    await app.inject({ method: 'DELETE', url: `/agents/${a.id}` });
    const d = await get(orphan.id);
    expect(d.statusCode).toBe(409);
    expect(d.json().error.code).toBe('agent_deleted');

    const missing = await routesFinding({ file: 'src/none.ts' });
    const m = await get(missing.id);
    expect(m.statusCode).toBe(422);
    expect(m.json().error.code).toBe('diff_unavailable');
    expect(m.json().error.message).toBe((await post(missing.id)).json().error.message);
  });

  it('AC-35: an existing case is answered with its id and name, no suggestion', async () => {
    const f = await routesFinding({ title: 'Existing one' });
    const created = (await post(f.id)).json().case;
    const body = (await get(f.id)).json();
    expect(body).toEqual({ existing_case: { id: created.id, name: created.name }, suggestion: null });
  });

  it('AC-44: a secret_leak finding suggests its cited range', async () => {
    const f = await routesFinding({ kind: 'secret_leak' });
    expect((await get(f.id)).json().suggestion.suggested).toEqual({ start_line: 6, end_line: 8 });
  });

  it('AC-13: an unsupported file still re-targets and reports structure_available:false (200)', async () => {
    const f = await seedFinding(env, reviewId, {
      accepted: true, file: 'README.md', start: 1, end: 1, title: 'Docs problem', rationale: 'The `needleTerm` is wrong',
    });
    const res = await get(f.id);
    expect(res.statusCode).toBe(200);
    const s = res.json().suggestion;
    expect(s.suggested).toEqual({ start_line: 2, end_line: 2 });
    expect(s.reason.structure_available).toBe(false);
  });

  it('AC-14: POST with a range stores it (a reversed range as min..max)', async () => {
    const f = await routesFinding({ title: 'Stored range' });
    const s = (await get(f.id)).json().suggestion;
    const res = await post(f.id, { start_line: 19, end_line: 16, patch_fingerprint: s.patch_fingerprint });
    expect(res.statusCode).toBe(201);
    expect(res.json().case.expected_output[0]).toMatchObject({ start_line: 16, end_line: 19 });
  });

  it('AC-39: a partial group is rejected with 422; no body stores the cited range even off-hunk', async () => {
    const f = await routesFinding({ title: 'Partial group', start: 900, end: 901 });
    expect((await post(f.id, { start_line: 1, end_line: 2 })).statusCode).toBe(422);
    expect(await caseRows(f.id)).toHaveLength(0);
    const res = await post(f.id);
    expect(res.statusCode).toBe(201);
    expect(res.json().case.expected_output[0]).toMatchObject({ start_line: 900, end_line: 901 });
  });

  it('AC-15: a range off every hunk -> 422 with the reason, no case', async () => {
    const f = await routesFinding({ title: 'Off hunk' });
    const fp = (await get(f.id)).json().suggestion.patch_fingerprint;
    const res = await post(f.id, { start_line: 900, end_line: 901, patch_fingerprint: fp });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toMatch(/do not intersect any hunk/);
    expect(await caseRows(f.id)).toHaveLength(0);
  });

  it('AC-43: a stale fingerprint -> 409 "The diff changed", no case', async () => {
    const f = await routesFinding({ title: 'Stale fp' });
    const res = await post(f.id, { start_line: 16, end_line: 19, patch_fingerprint: 'stale' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toBe('The diff changed');
    expect(await caseRows(f.id)).toHaveLength(0);
  });

  it('AC-18: an existing case + a range returns the case unchanged (200, created:false)', async () => {
    const f = await routesFinding({ title: 'Race existing' });
    const first = (await post(f.id)).json().case;
    const res = await post(f.id, { start_line: 16, end_line: 19, patch_fingerprint: 'whatever' });
    expect(res.statusCode).toBe(200);
    expect(res.json().created).toBe(false);
    expect(res.json().case.id).toBe(first.id);
    expect(res.json().case.expected_output[0]).toMatchObject({ start_line: 6, end_line: 8 });
  });

  it('AC-4 / NFR-7: no network call and no intent classifier use', () => {
    expect(trap.calls).toEqual([]);
    expect(env.intentCalls.n).toBe(0);
  });
});
