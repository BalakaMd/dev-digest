import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

/**
 * The conventions extractor end to end against Postgres: sampling (configs +
 * repo-intel top files), the structured LLM call, evidence verification,
 * persistence across app instances, accept/reject/edit, re-scan semantics and
 * turning accepted candidates into new skills.
 */

const FILES: Record<string, string> = {
  'tsconfig.json': '{\n  "compilerOptions": {\n    "strict": true,\n    "noUncheckedIndexedAccess": true\n  }\n}',
  'src/api/users.ts': [
    "import { db } from '../lib/db';",
    '',
    'export async function getUser(id: string) {',
    '  const user = await db.users.find(id);',
    '  const posts = await db.posts.findMany({ userId: id });',
    '  return { user, posts };',
    '}',
  ].join('\n'),
  'src/api/orders.ts': [
    'export async function getOrder(id: string) {',
    '  const order = await db.orders.find(id);',
    '  return order;',
    '}',
  ].join('\n'),
  'src/lib/redis.ts': 'export const redis = new Redis(config.redisUrl);',
};

const EXTRACTION = {
  candidates: [
    {
      category: 'async',
      rule: 'Always use async/await instead of .then() chains',
      confidence: 0.8,
      evidence: [
        { file: 'src/api/users.ts', line_start: 4, line_end: 5, snippet: 'const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId: id });' },
        { file: 'src/api/orders.ts', line_start: 2, line_end: 2, snippet: 'const order = await db.orders.find(id);' },
      ],
    },
    {
      category: 'typing',
      rule: 'TypeScript strict mode is on; never loosen compiler checks',
      confidence: 0.9,
      evidence: [{ file: 'tsconfig.json', line_start: 3, line_end: 3, snippet: '"strict": true,' }],
    },
    {
      category: 'data-access',
      rule: 'Redis access goes through the src/lib/redis.ts singleton',
      confidence: 0.7,
      evidence: [{ file: 'src/lib/redis.ts', line_start: 1, line_end: 1, snippet: 'export const redis = new Redis(config.redisUrl);' }],
    },
    {
      category: 'naming',
      rule: 'Hallucinated rule backed by a file that does not exist',
      confidence: 0.95,
      evidence: [{ file: 'src/ghost.ts', line_start: 1, line_end: 1, snippet: 'ghost()' }],
    },
    {
      category: 'api',
      rule: 'Handlers wrap results in ok()',
      confidence: 0.9,
      evidence: [{ file: 'src/api/users.ts', line_start: 6, line_end: 6, snippet: 'return ok(user);' }],
    },
    {
      category: 'async',
      rule: 'Use async/await, not .then() chains',
      confidence: 0.6,
      evidence: [{ file: 'src/api/orders.ts', line_start: 1, line_end: 1, snippet: 'export async function getOrder(id: string) {' }],
    },
  ],
};

d('conventions module', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;
  let llm: MockLLMProvider;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(opts: { extraction?: unknown; ranked?: string[] } = {}) {
    llm = new MockLLMProvider('openai', {
      structuredBySchema: { ConventionExtraction: opts.extraction ?? EXTRACTION },
    });
    const repoIntel = {
      getConventionSamples: async () => opts.ranked ?? ['src/api/users.ts', 'src/api/orders.ts', 'src/lib/redis.ts'],
    } as unknown as RepoIntel;
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: FILES }),
        github: new MockGitHubClient(),
        llm: { openrouter: llm },
        repoIntel,
      },
    });
  }

  async function newRepo(cloned = true) {
    const name = `conv-${seq++}-${Date.now()}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        clonePath: cloned ? `/mock/clones/acme/${name}` : null,
      })
      .returning();
    return repo!;
  }

  type Candidate = { id: string; rule: string; category: string; status: string; confidence: number; evidence: { path: string }[] };

  it('extracts, verifies evidence, dedupes and persists across app instances', async () => {
    const repo = await newRepo();
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    const state = res.json() as { scan: Record<string, unknown>; candidates: Candidate[] };

    // Ghost file + wrong snippet dropped; the two async rules merged into one.
    expect(state.candidates.map((c) => c.rule).sort()).toEqual([
      'Always use async/await instead of .then() chains',
      'Redis access goes through the src/lib/redis.ts singleton',
      'TypeScript strict mode is on; never loosen compiler checks',
    ]);
    expect(state.scan).toMatchObject({
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      proposed: 6,
      kept: 3,
      dropped_unverified: 2,
      merged_duplicates: 1,
    });
    // Configs are sampled (pure code) ahead of the ranked files.
    expect((state.scan.sample_files as string[])[0]).toBe('tsconfig.json');
    const asyncRule = state.candidates.find((c) => c.category === 'async')!;
    expect(new Set(asyncRule.evidence.map((e) => e.path))).toEqual(new Set(['src/api/users.ts', 'src/api/orders.ts']));
    expect(state.candidates.every((c) => c.status === 'pending')).toBe(true);
    await app.close();

    const app2 = await makeApp();
    const again = (await app2.inject({ url: `/repos/${repo.id}/conventions` })).json();
    expect(again.candidates).toHaveLength(3);
    expect(again.scan.id).toBe(state.scan.id);
    await app2.close();
  });

  it('uses the model chosen in Settings → Models', async () => {
    const repo = await newRepo();
    const app = await makeApp();
    await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { conventions: { provider: 'openrouter', model: 'z-ai/glm-4.7-flash' } } },
    });
    await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    const call = llm.calls.find((c) => c.method === 'completeStructured')!.req as { model: string; schemaName: string };
    expect(call).toMatchObject({ model: 'z-ai/glm-4.7-flash', schemaName: 'ConventionExtraction' });
    await app.inject({ method: 'PUT', url: '/settings', payload: { feature_models: {} } });
    await app.close();
  });

  it('accepts, rejects and edits; rejected never comes back, accepted and edited survive a re-scan', async () => {
    const repo = await newRepo();
    const app = await makeApp();
    const first = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();
    const byCat = (cat: string) => (first.candidates as Candidate[]).find((c) => c.category === cat)!;

    const acc = await app.inject({ method: 'PATCH', url: `/conventions/${byCat('async').id}`, payload: { status: 'accepted' } });
    expect(acc.json()).toMatchObject({ status: 'accepted' });
    const rej = await app.inject({ method: 'PATCH', url: `/conventions/${byCat('data-access').id}`, payload: { status: 'rejected' } });
    expect(rej.statusCode).toBe(200);
    const edit = await app.inject({
      method: 'PATCH',
      url: `/conventions/${byCat('typing').id}`,
      payload: { rule: 'Keep "strict": true in tsconfig', category: 'formatting' },
    });
    expect(edit.json()).toMatchObject({ rule: 'Keep "strict": true in tsconfig', category: 'formatting', status: 'pending' });

    const listed = (await app.inject({ url: `/repos/${repo.id}/conventions` })).json();
    expect((listed.candidates as Candidate[]).some((c) => c.id === byCat('data-access').id)).toBe(false);

    const rescan = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();
    const rules = (rescan.candidates as Candidate[]).map((c) => `${c.status}:${c.rule}`);
    expect(rules).toContain('accepted:Always use async/await instead of .then() chains');
    expect(rules.filter((r) => r.includes('async/await'))).toHaveLength(1);
    expect(rules.some((r) => r.includes('Redis'))).toBe(false);
    // A pending candidate the user edited survives; untouched pending ones are replaced.
    expect(rules).toContain('pending:Keep "strict": true in tsconfig');
    expect(rules).toContain('pending:TypeScript strict mode is on; never loosen compiler checks');
    expect(rescan.candidates).toHaveLength(3);
    expect(rescan.scan.id).not.toBe(first.scan.id);
    // Rejected ones are listed apart, never among the candidates.
    expect((rescan.rejected as Candidate[]).map((c) => c.id)).toEqual([byCat('data-access').id]);
    await app.close();
  });

  it('restores a rejected candidate back to pending, and it survives a re-scan', async () => {
    const repo = await newRepo();
    const app = await makeApp();
    const first = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();
    const redis = (first.candidates as Candidate[]).find((c) => c.category === 'data-access')!;
    await app.inject({ method: 'PATCH', url: `/conventions/${redis.id}`, payload: { status: 'rejected' } });

    const rejectedState = (await app.inject({ url: `/repos/${repo.id}/conventions` })).json();
    expect(rejectedState.rejected).toHaveLength(1);
    expect(rejectedState.rejected[0]).toMatchObject({ id: redis.id, status: 'rejected' });

    const restore = await app.inject({ method: 'PATCH', url: `/conventions/${redis.id}`, payload: { status: 'pending' } });
    expect(restore.json()).toMatchObject({ id: redis.id, status: 'pending' });
    const restored = (await app.inject({ url: `/repos/${repo.id}/conventions` })).json();
    expect(restored.rejected).toHaveLength(0);
    expect((restored.candidates as Candidate[]).some((c) => c.id === redis.id)).toBe(true);

    // Restoring counts as touching it: the next scan keeps it rather than replacing it.
    const rescan = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();
    const redisRules = (rescan.candidates as Candidate[]).filter((c) => c.rule.includes('Redis'));
    expect(redisRules.map((c) => c.id)).toEqual([redis.id]);
    await app.close();
  });

  it('validates input and repo state', async () => {
    const app = await makeApp();
    const notCloned = await newRepo(false);
    expect((await app.inject({ method: 'POST', url: `/repos/${notCloned.id}/conventions/extract` })).statusCode).toBe(422);
    const bare = await newRepo();
    const noFiles = await makeApp({ ranked: [] });
    // tsconfig.json is still found at the root, so configs alone are enough.
    expect((await noFiles.inject({ method: 'POST', url: `/repos/${bare.id}/conventions/extract` })).statusCode).toBe(200);
    await noFiles.close();
    expect((await app.inject({ url: `/repos/00000000-0000-0000-0000-000000000000/conventions` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'PATCH', url: `/conventions/00000000-0000-0000-0000-000000000000`, payload: { status: 'accepted' } })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'PATCH', url: `/conventions/00000000-0000-0000-0000-000000000000`, payload: { status: 'maybe' } })).statusCode,
    ).toBe(422);
    expect((await app.inject({ url: `/repos/${bare.id}/conventions/skill-drafts` })).statusCode).toBe(422);
    await app.close();
  });

  it('builds drafts from accepted conventions and creates NEW skills every time', async () => {
    const repo = await newRepo();
    const app = await makeApp();
    const state = (await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })).json();
    for (const c of state.candidates as Candidate[]) {
      if (c.category !== 'data-access') {
        await app.inject({ method: 'PATCH', url: `/conventions/${c.id}`, payload: { status: 'accepted' } });
      }
    }

    const single = (await app.inject({ url: `/repos/${repo.id}/conventions/skill-drafts?split=single` })).json();
    expect(single).toHaveLength(1);
    expect(single[0]).toMatchObject({ name: `${repo.name}-conventions`, type: 'convention', enabled: true });
    expect(single[0].convention_ids).toHaveLength(2);
    expect(single[0].body).toContain('Detected in `src/api/users.ts:4-5`');

    const perCat = (await app.inject({ url: `/repos/${repo.id}/conventions/skill-drafts?split=category` })).json();
    expect(perCat.map((d: { category: string }) => d.category)).toEqual(['async', 'typing']);

    const payload = {
      skills: [{ ...single[0], body: `${single[0].body}\nEdited by hand.`, enabled: false }],
    };
    const created = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/skills`, payload });
    expect(created.statusCode).toBe(201);
    const [skill] = created.json();
    expect(skill).toMatchObject({ type: 'convention', source: 'extracted', enabled: false, name: `${repo.name}-conventions` });
    expect(skill.body).toContain('Edited by hand.');
    expect(skill.evidence_files).toEqual(expect.arrayContaining(['src/api/users.ts', 'tsconfig.json']));

    const again = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/skills`, payload });
    expect(again.statusCode).toBe(201);
    expect(again.json()[0].id).not.toBe(skill.id);

    const skills = (await app.inject({ url: '/skills' })).json() as { name: string }[];
    expect(skills.filter((s) => s.name === `${repo.name}-conventions`)).toHaveLength(2);

    const rejectedId = (state.candidates as Candidate[]).find((c) => c.category === 'data-access')!.id;
    const bad = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/skills`,
      payload: { skills: [{ ...single[0], convention_ids: [rejectedId] }] },
    });
    expect(bad.statusCode).toBe(422);
    await app.close();
  });
});
