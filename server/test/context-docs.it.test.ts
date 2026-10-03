import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { InjectOptions } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[context-docs.it] Docker not available — skipping integration tests.');
}

/**
 * The project-context HTTP API, in process, against a real Postgres and real
 * temp-dir working copies (SPEC-01 — AC-1, 3, 4, 5, 6, 7, 55, 56, 60, 69, 70,
 * 71, 72, 82, 84, 85, 86, 87).
 *
 * Needs Docker; skipped without it. The path-guard and store rules themselves
 * have DB-free coverage in `context-docs-reader|local|glob|service.test.ts`;
 * this file proves the wiring: routes, schemas, error envelope, repository
 * lookup, repo removal.
 */

/** Working copies under a temp dir; `sync()` can be made to fail with an error that embeds a path. */
class TmpGit extends MockGitClient {
  failSync = false;
  constructor(private root: string) {
    super();
  }
  override clonePathFor(repo: { owner: string; name: string }): string {
    return join(this.root, repo.owner, repo.name);
  }
  override async sync(repo: { owner: string; name: string }, branch: string): Promise<{ head: string }> {
    if (this.failSync) throw new Error(`fatal: cannot lock ref in ${this.clonePathFor(repo)}`);
    return super.sync(repo, branch);
  }
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64');

d('context documents API', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let base: string;
  let clonesDir: string;
  let ctxDir: string;
  let outsideDir: string;
  let git: TmpGit;
  let app: Awaited<ReturnType<typeof makeApp>>;
  let seq = 0;
  /** Every response payload seen by the current test (for the no-absolute-path check). */
  let payloads: string[] = [];

  function makeApp() {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test', DEVDIGEST_CONTEXT_DIR: ctxDir } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { git, github: new MockGitHubClient() },
    });
  }

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'devdigest-ctx-api-'));
    clonesDir = join(base, 'clones');
    ctxDir = join(base, 'ctx');
    outsideDir = join(base, 'outside');
    for (const dir of [clonesDir, ctxDir, outsideDir]) mkdirSync(dir, { recursive: true });
    git = new TmpGit(clonesDir);
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    app = await makeApp();
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    rmSync(base, { recursive: true, force: true });
  });
  beforeEach(() => {
    payloads = [];
    git.failSync = false;
    git.syncs.length = 0;
  });

  // ── helpers ──────────────────────────────────────────────────────────────

  interface Fixture {
    id: string;
    cloneRoot: string;
    localRoot: string;
    put: (rel: string, content: string | Buffer) => void;
  }

  /** A repo row; `cloned: false` leaves `clone_path` null and no working copy on disk. */
  async function makeRepo(opts: { cloned?: boolean } = {}): Promise<Fixture> {
    const cloned = opts.cloned ?? true;
    const name = `ctx-api-${seq++}`;
    const cloneRoot = join(clonesDir, 'acme', name);
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        clonePath: cloned ? cloneRoot : null,
      })
      .returning();
    if (cloned) mkdirSync(cloneRoot, { recursive: true });
    return {
      id: repo!.id,
      cloneRoot,
      localRoot: join(ctxDir, repo!.id),
      put: (rel, content) => {
        const abs = join(cloneRoot, rel);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content);
      },
    };
  }

  async function call(opts: InjectOptions) {
    const res = await app.inject(opts);
    payloads.push(res.payload);
    return res;
  }
  const list = async (id: string) => (await call({ url: `/repos/${id}/context-docs` })).json();
  const content = (id: string, path: string, source?: string) =>
    call({ url: `/repos/${id}/context-docs/content`, query: { path, ...(source ? { source } : {}) } });
  const writeLocal = (id: string, body: Record<string, unknown>) =>
    call({ method: 'PUT', url: `/repos/${id}/context-docs/local`, payload: body });
  const upload = (id: string, folder: string, files: Array<{ name: string; content_b64: string }>) =>
    call({ method: 'POST', url: `/repos/${id}/context-docs/local/upload`, payload: { folder, files } });

  /** Relative file listing of a directory tree (to prove a tree was not touched). */
  function tree(root: string): string[] {
    if (!existsSync(root)) return [];
    const out: string[] = [];
    const walk = (rel: string) => {
      for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        out.push(e.isDirectory() ? `${r}/` : `${r}:${readFileSync(join(root, r), 'utf8').length}`);
        if (e.isDirectory()) walk(r);
      }
    };
    walk('');
    return out.sort();
  }

  /** AC-5 — nothing the API said contains a filesystem location. */
  function expectNoAbsolutePath() {
    const all = payloads.join('\n');
    for (const needle of [base, tmpdir(), clonesDir, ctxDir, outsideDir]) expect(all).not.toContain(needle);
  }

  // ── listing & reading ────────────────────────────────────────────────────

  it('lists a hidden-folder spec with path, source, type, folder and tokens (AC-1)', async () => {
    const fx = await makeRepo();
    fx.put('.devdigest/specs/a.md', '# spec a');
    fx.put('README.md', 'not a context doc');

    const res = await call({ url: `/repos/${fx.id}/context-docs` });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.state).toBe('ok');
    expect(body.docs).toHaveLength(1);
    expect(body.docs[0]).toMatchObject({
      path: '.devdigest/specs/a.md',
      source: 'repo',
      type: 'specs',
      folder: '.devdigest/specs',
      too_large: false,
      shadowed: false,
    });
    expect(body.docs[0].tokens).toBeGreaterThan(0);
    expect(body.limits).toEqual({ max_doc_bytes: 65_536, max_attachments: 20, token_budget: 8_000 });
    expectNoAbsolutePath();
  });

  it('a repository that is not cloned reports state not_cloned, lists its local documents and refuses repository reads (AC-7)', async () => {
    const fx = await makeRepo({ cloned: false });
    expect((await writeLocal(fx.id, { folder: 'docs', name: 'mine.md', content: '# mine' })).statusCode).toBe(200);

    const body = await list(fx.id);
    expect(body.state).toBe('not_cloned');
    expect(body.docs.map((x: { path: string; source: string }) => [x.path, x.source])).toEqual([['docs/mine.md', 'local']]);

    const repoRead = await content(fx.id, 'docs/other.md', 'repo');
    expect(repoRead.statusCode).toBe(409);
    expectNoAbsolutePath();
  });

  it('answers 404 for a repository that does not exist or belongs to no workspace', async () => {
    const unknown = '00000000-0000-4000-8000-000000000000';
    expect((await call({ url: `/repos/${unknown}/context-docs` })).statusCode).toBe(404);
    expect((await content(unknown, 'docs/a.md')).statusCode).toBe(404);
  });

  it('returns a document verbatim with its version (AC-1, AC-8)', async () => {
    const fx = await makeRepo();
    const text = '# t\n![x](http://example.invalid/x.png)\n---\ninclude: other.md\n---\n';
    fx.put('docs/a.md', text);

    const res = await content(fx.id, 'docs/a.md');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ path: 'docs/a.md', source: 'repo', content: text, size_bytes: Buffer.byteLength(text) });
    expect(res.json().version).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['a parent-directory path', '../a.md'],
    ['a deeper parent-directory path', 'docs/../../a.md'],
    ['an absolute path', '/a.md'],
    ['a non-markdown path', 'a.txt'],
    ['a NUL byte', 'a\u0000.md'],
    ['a backslash path', 'docs\\a.md'],
    ['a path outside the configured folders', 'src/a.md'],
  ])('refuses to read %s with 422 and reads nothing (AC-4)', async (_label, path) => {
    const fx = await makeRepo();
    fx.put('docs/a.md', 'fine');
    fx.put('src/a.md', 'secret');
    writeFileSync(join(outsideDir, 'a.md'), 'OUTSIDE-SECRET');

    const res = await content(fx.id, path);

    expect(res.statusCode).toBe(422);
    expect(res.payload).not.toContain('OUTSIDE-SECRET');
    expect(res.payload).not.toContain('secret');
    expectNoAbsolutePath();
  });

  it('a symlinked document is neither listed nor readable (AC-3)', async () => {
    const fx = await makeRepo();
    fx.put('docs/real.md', 'real');
    writeFileSync(join(outsideDir, 'passwd.md'), 'OUTSIDE-SECRET');
    mkdirSync(join(fx.cloneRoot, 'docs'), { recursive: true });
    symlinkSync(join(outsideDir, 'passwd.md'), join(fx.cloneRoot, 'docs', 'x.md'));
    mkdirSync(join(outsideDir, 'dir'), { recursive: true });
    writeFileSync(join(outsideDir, 'dir', 'y.md'), 'OUTSIDE-SECRET');
    symlinkSync(join(outsideDir, 'dir'), join(fx.cloneRoot, 'docs', 'linked'));

    const body = await list(fx.id);
    expect(body.docs.map((x: { path: string }) => x.path)).toEqual(['docs/real.md']);

    for (const path of ['docs/x.md', 'docs/linked/y.md']) {
      const res = await content(fx.id, path);
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(res.statusCode).toBeLessThan(500);
      expect(res.payload).not.toContain('OUTSIDE-SECRET');
    }
    expectNoAbsolutePath();
  });

  it('a document over 65,536 bytes is listed as too large and its content is refused (AC-6)', async () => {
    const fx = await makeRepo();
    fx.put('docs/big.md', 'a'.repeat(70 * 1024));

    const body = await list(fx.id);
    expect(body.docs[0]).toMatchObject({ path: 'docs/big.md', too_large: true, tokens: null });
    expect((await content(fx.id, 'docs/big.md')).statusCode).toBe(422);
  });

  // ── local documents: create / edit / delete ──────────────────────────────

  it('create and edit write only under the data directory — the working copy is untouched (AC-55, AC-60)', async () => {
    const fx = await makeRepo();
    fx.put('docs/repo.md', 'repo doc');
    const before = tree(fx.cloneRoot);

    const created = await writeLocal(fx.id, { folder: 'docs', name: 'mine.md', content: 'v1' });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ path: 'docs/mine.md', source: 'local', content: 'v1' });
    const edited = await writeLocal(fx.id, {
      folder: 'docs',
      name: 'mine.md',
      content: 'v2',
      base_version: created.json().version,
    });
    expect(edited.statusCode).toBe(200);

    expect(readFileSync(join(fx.localRoot, 'docs', 'mine.md'), 'utf8')).toBe('v2');
    expect(tree(fx.cloneRoot)).toEqual(before);
    const entry = (await list(fx.id)).docs.find((x: { path: string }) => x.path === 'docs/mine.md');
    expect(entry).toMatchObject({ source: 'local', shadowed: false });
    expectNoAbsolutePath();
  });

  it.each([
    ['not a markdown file', { folder: 'docs', name: 'a.txt', content: 'x' }],
    ['over 65,536 bytes', { folder: 'docs', name: 'big.md', content: 'a'.repeat(70 * 1024) }],
    ['a name with a path separator', { folder: 'docs', name: 'a/b.md', content: 'x' }],
    ['a name with a backslash', { folder: 'docs', name: 'a\\b.md', content: 'x' }],
    ['a name with ..', { folder: 'docs', name: '..md', content: 'x' }],
    ['a name with a NUL byte', { folder: 'docs', name: 'a\u0000.md', content: 'x' }],
    ['a folder that climbs out', { folder: '../outside', name: 'a.md', content: 'x' }],
    ['an absolute folder', { folder: '/etc', name: 'a.md', content: 'x' }],
    ['a path outside the configured folders', { folder: 'src', name: 'a.md', content: 'x' }],
  ])('rejects a local save that is %s with 422 and writes nothing (AC-56)', async (_label, body) => {
    const fx = await makeRepo();

    const res = await writeLocal(fx.id, body);

    expect(res.statusCode).toBe(422);
    expect(tree(fx.localRoot)).toEqual([]);
    expect(tree(fx.cloneRoot)).toEqual([]);
    expect(tree(outsideDir).filter((p) => p.includes('a.md'))).toEqual([]);
    expectNoAbsolutePath();
  });

  it('creating onto an existing local or repository path is 422 and names the path (AC-84)', async () => {
    const fx = await makeRepo();
    fx.put('docs/repo.md', 'repo text');
    expect((await writeLocal(fx.id, { folder: 'docs', name: 'mine.md', content: 'v1' })).statusCode).toBe(200);

    const onLocal = await writeLocal(fx.id, { folder: 'docs', name: 'mine.md', content: 'again' });
    expect(onLocal.statusCode).toBe(422);
    expect(onLocal.json().error.message).toContain('docs/mine.md');
    expect(readFileSync(join(fx.localRoot, 'docs', 'mine.md'), 'utf8')).toBe('v1');

    const onRepo = await writeLocal(fx.id, { folder: 'docs', name: 'repo.md', content: 'shadow' });
    expect(onRepo.statusCode).toBe(422);
    expect(onRepo.json().error.message).toContain('docs/repo.md');
    expect(existsSync(join(fx.localRoot, 'docs', 'repo.md'))).toBe(false);
  });

  it('a save based on an older version is 409 and carries the newer content (AC-85)', async () => {
    const fx = await makeRepo();
    const created = await writeLocal(fx.id, { folder: 'docs', name: 'mine.md', content: 'v1' });
    const v1 = created.json().version as string;
    const v2 = (await writeLocal(fx.id, { folder: 'docs', name: 'mine.md', content: 'v2', base_version: v1 })).json();

    const stale = await writeLocal(fx.id, { folder: 'docs', name: 'mine.md', content: 'mine-from-v1', base_version: v1 });

    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.details).toMatchObject({ current_content: 'v2', current_version: v2.version });
    expect(readFileSync(join(fx.localRoot, 'docs', 'mine.md'), 'utf8')).toBe('v2');
  });

  it('a local document with the same path as a repository document is listed as shadowed (AC-65)', async () => {
    const fx = await makeRepo();
    fx.put('docs/x.md', 'REPO');
    mkdirSync(join(fx.localRoot, 'docs'), { recursive: true });
    writeFileSync(join(fx.localRoot, 'docs', 'x.md'), 'LOCAL');

    const body = await list(fx.id);
    expect(body.docs.map((x: { path: string; source: string; shadowed: boolean }) => [x.source, x.shadowed])).toEqual([
      ['repo', false],
      ['local', true],
    ]);
    expect((await content(fx.id, 'docs/x.md')).json()).toMatchObject({ source: 'repo', content: 'REPO' });
    expect((await content(fx.id, 'docs/x.md', 'local')).json()).toMatchObject({ source: 'local', content: 'LOCAL' });
  });

  it('deletes a local document; the repository document of the same name is untouched (AC-86)', async () => {
    const fx = await makeRepo();
    expect((await writeLocal(fx.id, { folder: 'docs', name: 'mine.md', content: 'v1' })).statusCode).toBe(200);

    const del = await call({ method: 'DELETE', url: `/repos/${fx.id}/context-docs/local`, query: { path: 'docs/mine.md' } });
    expect(del.statusCode).toBe(200);
    expect(existsSync(join(fx.localRoot, 'docs', 'mine.md'))).toBe(false);
    expect((await list(fx.id)).docs).toEqual([]);

    const again = await call({ method: 'DELETE', url: `/repos/${fx.id}/context-docs/local`, query: { path: 'docs/mine.md' } });
    expect(again.statusCode).toBe(404);

    // a repository document is never deletable through this endpoint
    fx.put('docs/repo.md', 'repo');
    const repoDel = await call({ method: 'DELETE', url: `/repos/${fx.id}/context-docs/local`, query: { path: 'docs/repo.md' } });
    expect(repoDel.statusCode).toBe(404);
    expect(readFileSync(join(fx.cloneRoot, 'docs', 'repo.md'), 'utf8')).toBe('repo');
  });

  // ── upload ───────────────────────────────────────────────────────────────

  it('validates every uploaded file separately, stores the valid ones and names each rejected one with its reason (AC-56, AC-70, AC-84)', async () => {
    const fx = await makeRepo();
    fx.put('docs/taken.md', 'repo');
    const before = tree(fx.cloneRoot);

    const res = await upload(fx.id, 'docs', [
      { name: 'ok.md', content_b64: b64('# ok') },
      { name: 'a.txt', content_b64: b64('text') },
      { name: 'big.md', content_b64: b64('a'.repeat(70 * 1024)) },
      { name: 'bin.md', content_b64: b64(Buffer.from([0xff, 0xfe, 0xfd, 0x00])) },
      { name: 'a/b.md', content_b64: b64('x') },
      { name: 'taken.md', content_b64: b64('shadow') },
      { name: 'bad64.md', content_b64: '***not base64***' },
    ]);

    expect(res.statusCode).toBe(200);
    const body = res.json() as { stored: string[]; rejected: Array<{ name: string; reason: string }> };
    expect(body.stored).toEqual(['docs/ok.md']);
    expect(body.rejected.map((r) => r.name).sort()).toEqual(['a.txt', 'a/b.md', 'bad64.md', 'big.md', 'bin.md', 'taken.md']);
    expect(body.rejected.every((r) => r.reason.length > 0)).toBe(true);
    expect(body.rejected.find((r) => r.name === 'taken.md')?.reason).toContain('docs/taken.md');
    expect(tree(fx.localRoot)).toEqual(['docs/', 'docs/ok.md:4']);
    expect(tree(fx.cloneRoot)).toEqual(before);
    expectNoAbsolutePath();
  });

  it('an upload into an off-glob or climbing folder stores nothing (AC-56)', async () => {
    const fx = await makeRepo();
    for (const folder of ['src', '../outside', '/etc']) {
      const res = await upload(fx.id, folder, [{ name: 'a.md', content_b64: b64('x') }]);
      // either the route rejects the body or every file is reported rejected
      if (res.statusCode === 200) expect(res.json().stored).toEqual([]);
      else expect(res.statusCode).toBe(422);
    }
    expect(tree(fx.localRoot)).toEqual([]);
    expect(tree(outsideDir).filter((p) => p.includes('a.md'))).toEqual([]);
  });

  // ── folders ──────────────────────────────────────────────────────────────

  it('creates an empty local folder that is listed, refuses a folder outside the search roots, and deletes only empty folders (AC-69, AC-86)', async () => {
    const fx = await makeRepo();

    const created = await call({ method: 'POST', url: `/repos/${fx.id}/context-docs/local/folders`, payload: { path: 'docs/new' } });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toEqual({ path: 'docs/new' });
    expect((await list(fx.id)).local_folders).toContain('docs/new');

    for (const path of ['src/new', '../x', '/abs']) {
      const bad = await call({ method: 'POST', url: `/repos/${fx.id}/context-docs/local/folders`, payload: { path } });
      expect(bad.statusCode).toBe(422);
    }

    await writeLocal(fx.id, { folder: 'docs/new', name: 'a.md', content: 'x' });
    const notEmpty = await call({ method: 'DELETE', url: `/repos/${fx.id}/context-docs/local/folders`, query: { path: 'docs/new' } });
    expect(notEmpty.statusCode).toBe(422);
    expect(existsSync(join(fx.localRoot, 'docs', 'new', 'a.md'))).toBe(true);

    await call({ method: 'DELETE', url: `/repos/${fx.id}/context-docs/local`, query: { path: 'docs/new/a.md' } });
    const ok = await call({ method: 'DELETE', url: `/repos/${fx.id}/context-docs/local/folders`, query: { path: 'docs/new' } });
    expect(ok.statusCode).toBe(200);
    expect((await list(fx.id)).local_folders).not.toContain('docs/new');
    expectNoAbsolutePath();
  });

  // ── sync ─────────────────────────────────────────────────────────────────

  it('syncs the working copy through the git client and leaves local documents alone (AC-60, AC-82)', async () => {
    const fx = await makeRepo();
    await writeLocal(fx.id, { folder: 'docs', name: 'mine.md', content: 'local survives' });
    const localBefore = tree(fx.localRoot);

    const res = await call({ method: 'POST', url: `/repos/${fx.id}/context-docs/sync` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ head: expect.any(String) });
    expect(git.syncs).toHaveLength(1);
    expect(git.syncs[0]?.repo).toMatchObject({ owner: 'acme' });
    expect(tree(fx.localRoot)).toEqual(localBefore);
    expect((await list(fx.id)).docs.map((x: { path: string }) => x.path)).toEqual(['docs/mine.md']);
  });

  it('a failing sync is 502 with a fixed message that carries no path, and keeps the list (AC-82, AC-5)', async () => {
    const fx = await makeRepo();
    fx.put('docs/a.md', 'a');
    git.failSync = true;

    const res = await call({ method: 'POST', url: `/repos/${fx.id}/context-docs/sync` });

    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toBeTruthy();
    expectNoAbsolutePath();
    expect((await list(fx.id)).docs.map((x: { path: string }) => x.path)).toEqual(['docs/a.md']);
  });

  it('refuses to sync a repository that was never cloned with 409', async () => {
    const fx = await makeRepo({ cloned: false });
    const res = await call({ method: 'POST', url: `/repos/${fx.id}/context-docs/sync` });
    expect(res.statusCode).toBe(409);
    expect(git.syncs).toHaveLength(0);
  });

  // ── usage / coverage ─────────────────────────────────────────────────────

  describe('usage and coverage (AC-71, AC-72)', () => {
    async function agent(name: string) {
      const res = await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name, provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review.' },
      });
      return res.json() as { id: string };
    }
    async function skill(name: string) {
      const res = await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name, description: 'When X.', type: 'rubric', body: 'Guidance.' },
      });
      return res.json() as { id: string };
    }
    const usage = async (repoId: string, path: string) =>
      (await call({ url: `/repos/${repoId}/context-docs/usage`, query: { path } })).json();
    const enabledAgents = async () =>
      ((await app.inject({ url: '/agents' })).json() as Array<{ id: string; enabled: boolean }>).filter((a) => a.enabled);

    it('counts an enabled agent once whether the document is attached directly, through an enabled skill, or both; ignores disabled skills and agents', async () => {
      const fx = await makeRepo();
      const path = 'docs/usage.md';
      const direct = await agent(`usage-direct-${seq++}`);
      const both = await agent(`usage-both-${seq++}`);
      const viaOff = await agent(`usage-skill-off-${seq++}`);
      const disabled = await agent(`usage-disabled-${seq++}`);
      const onSkill = await skill(`usage-on-${seq++}`);
      const offSkill = await skill(`usage-off-${seq++}`);

      await app.inject({ method: 'PUT', url: `/agents/${direct.id}/context-docs`, payload: { paths: [path] } });
      await app.inject({ method: 'PUT', url: `/agents/${both.id}/context-docs`, payload: { paths: [path] } });
      await app.inject({ method: 'PUT', url: `/skills/${onSkill.id}/context-docs`, payload: { paths: [path] } });
      await app.inject({ method: 'PUT', url: `/skills/${offSkill.id}/context-docs`, payload: { paths: [path] } });
      await app.inject({ method: 'POST', url: `/agents/${both.id}/skills`, payload: { skill_ids: [onSkill.id] } });
      await app.inject({ method: 'POST', url: `/agents/${viaOff.id}/skills`, payload: { skill_ids: [offSkill.id] } });
      await app.inject({ method: 'PUT', url: `/skills/${offSkill.id}`, payload: { enabled: false } });
      await app.inject({ method: 'PUT', url: `/agents/${disabled.id}/context-docs`, payload: { paths: [path] } });
      await app.inject({ method: 'PUT', url: `/agents/${disabled.id}`, payload: { enabled: false } });

      const body = await usage(fx.id, path);
      const enabled = (await enabledAgents()).length;

      expect(body.used_by_agents).toBe(2); // direct + both(direct and via skill); not viaOff, not disabled
      expect(body.enabled_agents).toBe(enabled);
      expect(body.coverage_pct).toBe(Math.round((2 / enabled) * 100));
      expect(body.attached_by_agents.map((a: { id: string }) => a.id).sort()).toEqual([direct.id, both.id, disabled.id].sort());
      expect(body.attached_by_skills.map((s: { id: string }) => s.id).sort()).toEqual([onSkill.id, offSkill.id].sort());
    });

    it('a document nobody attaches is used by 0 agents; with no enabled agent the coverage is null (AC-71)', async () => {
      const fx = await makeRepo();
      await agent(`usage-baseline-${seq++}`); // guarantees at least one enabled agent
      const none = await usage(fx.id, 'docs/nobody.md');
      expect(none.used_by_agents).toBe(0);
      expect(none.coverage_pct).toBe(0);

      const enabled = await enabledAgents();
      for (const a of enabled) await app.inject({ method: 'PUT', url: `/agents/${a.id}`, payload: { enabled: false } });
      try {
        const empty = await usage(fx.id, 'docs/nobody.md');
        expect(empty).toMatchObject({ used_by_agents: 0, enabled_agents: 0, coverage_pct: null });
      } finally {
        for (const a of enabled) await app.inject({ method: 'PUT', url: `/agents/${a.id}`, payload: { enabled: true } });
      }
    });

    it('keeps the attachments of a deleted local document (AC-86)', async () => {
      const fx = await makeRepo();
      const a = await agent(`usage-missing-${seq++}`);
      await writeLocal(fx.id, { folder: 'docs', name: 'gone.md', content: 'x' });
      await app.inject({ method: 'PUT', url: `/agents/${a.id}/context-docs`, payload: { paths: ['docs/gone.md'] } });

      await call({ method: 'DELETE', url: `/repos/${fx.id}/context-docs/local`, query: { path: 'docs/gone.md' } });

      expect(((await app.inject({ url: `/agents/${a.id}` })).json() as { context_docs: string[] }).context_docs).toEqual(['docs/gone.md']);
      expect((await usage(fx.id, 'docs/gone.md')).attached_by_agents.map((x: { id: string }) => x.id)).toContain(a.id);
    });
  });

  // ── repository removal ───────────────────────────────────────────────────

  it('counts local documents and removing the repository deletes them from the data directory (AC-87)', async () => {
    const fx = await makeRepo();
    await writeLocal(fx.id, { folder: 'docs', name: 'a.md', content: 'a' });
    await writeLocal(fx.id, { folder: 'specs', name: 'b.md', content: 'b' });
    await call({ method: 'POST', url: `/repos/${fx.id}/context-docs/local/folders`, payload: { path: 'insights/empty' } });

    const count = await call({ url: `/repos/${fx.id}/context-docs/local-count` });
    expect(count.json()).toEqual({ count: 2 });
    expect(existsSync(fx.localRoot)).toBe(true);

    const del = await call({ method: 'DELETE', url: `/repos/${fx.id}` });
    expect(del.statusCode).toBe(200);

    expect(existsSync(fx.localRoot)).toBe(false);
    const rows = await pg.handle.db.select().from(t.repos).where(eq(t.repos.id, fx.id));
    expect(rows).toHaveLength(0);
  });
});
