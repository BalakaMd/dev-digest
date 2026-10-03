import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, lstatSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { ContextDocsService, type RepoLookup, type AttachmentSource } from '../src/modules/context-docs/service.js';
import type { ContextDocsRepo } from '../src/modules/context-docs/repository.js';
import type { ContextAttachments } from '../src/modules/agents/repository.js';
import { FsContextDocStore } from '../src/adapters/context-docs/index.js';
import { DEFAULT_CONTEXT_GLOBS } from '../src/adapters/context-docs/glob.js';
import { AppError } from '../src/platform/errors.js';
import { MockGitClient } from '../src/adapters/mocks.js';

// `readFile` passes through to the real one; a test makes it fail for one stored
// file to simulate an I/O error (portable: root ignores chmod).
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

/**
 * Context-docs use cases against the real fs store on temp dirs, with the repos
 * lookup, agents repository and git faked — i.e. everything of T-10 that does
 * not need Postgres (SPEC-01: AC-4, 5, 7, 55, 56, 69, 70, 71, 72, 82, 84, 85,
 * 86). The HTTP-level counterpart is `context-docs.it.test.ts` (needs Docker).
 */
describe('ContextDocsService', () => {
  const WS = 'ws1';
  const REPO_ID = 'repo1';
  let base: string;
  let clone: string;
  let ctxDir: string;
  let repoRow: ContextDocsRepo;
  let attachments: ContextAttachments;
  let git: MockGitClient;

  const noAttachments = (): ContextAttachments => ({ agents: [], skills: [] });

  const tree = (root: string): string[] => {
    if (!existsSync(root)) return [];
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const abs = join(dir, name);
        if (lstatSync(abs).isDirectory()) walk(abs);
        else out.push(relative(root, abs));
      }
    };
    walk(root);
    return out.sort();
  };

  const putRepo = (rel: string, content: string) => {
    const abs = join(clone, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  };

  function makeService(overrides: { git?: Pick<MockGitClient, 'sync'> } = {}) {
    const store = new FsContextDocStore({
      globs: DEFAULT_CONTEXT_GLOBS,
      contextDir: ctxDir,
      clonePathFor: () => clone,
      countTokens: (t) => t.length,
    });
    const repos: RepoLookup = {
      getRepo: async (workspaceId, id) => (workspaceId === WS && id === repoRow.id ? repoRow : undefined),
    };
    const agents: AttachmentSource = { contextAttachments: async () => attachments };
    return { service: new ContextDocsService({ store, git: overrides.git ?? git, agents, repos }), store };
  }

  /** Run `fn`, return the AppError it throws (fails the test otherwise). */
  async function failure(fn: () => Promise<unknown>): Promise<AppError> {
    try {
      await fn();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      return err as AppError;
    }
    throw new Error('expected the call to fail');
  }

  /** A caller-visible text carries no absolute filesystem path (AC-5). */
  function expectPathFree(text: string): void {
    expect(text).not.toContain(base);
    expect(text).not.toContain(tmpdir());
    expect(text).not.toMatch(/(^|[\s:'"{,\[])\/[^\s"']/);
    expect(text).not.toMatch(/[A-Za-z]:\\/);
  }

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'devdigest-ctx-svc-'));
    clone = join(base, 'clone');
    ctxDir = join(base, 'ctx');
    mkdirSync(clone, { recursive: true });
    mkdirSync(ctxDir, { recursive: true });
    repoRow = { id: REPO_ID, owner: 'acme', name: 'api', defaultBranch: 'main', cloned: true };
    attachments = noAttachments();
    git = new MockGitClient({ syncedHead: 'deadbeef' });
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  describe('list (AC-1, AC-7)', () => {
    it('adds the search roots, limits and a scan time to the reader\'s list', async () => {
      putRepo('docs/a.md', '# a');
      const before = Date.now();
      const res = await makeService().service.list(WS, REPO_ID);
      expect(res.state).toBe('ok');
      expect(res.docs.map((d) => d.path)).toEqual(['docs/a.md']);
      expect(res.search_globs).toEqual(expect.arrayContaining(['specs', 'docs', 'insights']));
      expect(res.limits).toEqual({ max_doc_bytes: 65_536, max_attachments: 20, token_budget: 8_000 });
      expect(Date.parse(res.scanned_at)).toBeGreaterThanOrEqual(before - 1000);
      expect(Date.parse(res.scanned_at)).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('answers 404 for a repository that is not in the workspace', async () => {
      const { service } = makeService();
      expect((await failure(() => service.list(WS, 'other-repo'))).statusCode).toBe(404);
      expect((await failure(() => service.list('other-ws', REPO_ID))).statusCode).toBe(404);
    });
  });

  describe('read (AC-4, AC-6, AC-5)', () => {
    it('maps a rejected path to 422, an over-size document to 422, a missing one to 404', async () => {
      putRepo('docs/big.md', 'a'.repeat(70_000));
      const { service } = makeService();
      expect((await failure(() => service.read(WS, REPO_ID, '../a.md'))).statusCode).toBe(422);
      expect((await failure(() => service.read(WS, REPO_ID, 'src/notes.md'))).statusCode).toBe(422);
      expect((await failure(() => service.read(WS, REPO_ID, 'docs/big.md'))).statusCode).toBe(422);
      expect((await failure(() => service.read(WS, REPO_ID, 'docs/missing.md'))).statusCode).toBe(404);
    });

    it('never puts an absolute filesystem path into an error message or its details', async () => {
      putRepo('docs/big.md', 'a'.repeat(70_000));
      putRepo('docs/bin.md', '');
      writeFileSync(join(clone, 'docs/bin.md'), Buffer.from([0xff, 0xfe]));
      const { service } = makeService();
      const errors = [
        await failure(() => service.read(WS, REPO_ID, 'docs/big.md')),
        await failure(() => service.read(WS, REPO_ID, 'docs/bin.md')),
        await failure(() => service.read(WS, REPO_ID, 'docs/missing.md')),
        await failure(() => service.read(WS, REPO_ID, '/etc/passwd.md')),
        await failure(() => service.deleteLocal(WS, REPO_ID, 'docs/missing.md')),
      ];
      for (const e of errors) {
        const text = JSON.stringify({ m: e.message, d: e.details, c: e.code });
        expect(text).not.toContain(base);
        expect(text).not.toContain(tmpdir());
      }
    });

    it('reports a repository with no working copy as 409 rather than an empty answer (AC-7)', async () => {
      rmSync(clone, { recursive: true, force: true });
      const { service } = makeService();
      const err = await failure(() => service.read(WS, REPO_ID, 'docs/a.md', 'repo'));
      expect(err.statusCode).toBe(409);
      expect((await service.list(WS, REPO_ID)).state).toBe('not_cloned');
    });
  });

  describe('usage and coverage (AC-71, AC-72)', () => {
    const agent = (id: string, enabled: boolean, docs: string[], skills: ContextAttachments['agents'][number]['skills'] = []) => ({
      id,
      name: `agent-${id}`,
      enabled,
      docs,
      skills,
    });

    it('counts enabled agents using the document directly or through a linked, enabled skill — once per agent', async () => {
      attachments = {
        agents: [
          agent('a1', true, ['docs/x.md'], [{ id: 's1', name: 'sk1', enabled: true, docs: ['docs/x.md'] }]), // direct + via skill: once
          agent('a2', true, [], [{ id: 's1', name: 'sk1', enabled: true, docs: ['docs/x.md'] }]), // via skill only
          agent('a3', true, [], [{ id: 's2', name: 'sk2', enabled: false, docs: ['docs/x.md'] }]), // via DISABLED skill
          agent('a4', false, ['docs/x.md']), // disabled agent
          agent('a5', true, ['docs/other.md']), // unrelated
        ],
        skills: [
          { id: 's1', name: 'sk1', docs: ['docs/x.md'] },
          { id: 's2', name: 'sk2', docs: ['docs/x.md'] },
        ],
      };
      const usage = await makeService().service.usage(WS, REPO_ID, 'docs/x.md');
      expect(usage.used_by_agents).toBe(2); // a1, a2
      expect(usage.enabled_agents).toBe(4); // a1, a2, a3, a5
      expect(usage.coverage_pct).toBe(50);
      // the delete dialog lists everything that attaches the path directly, enabled or not
      expect(usage.attached_by_agents.map((a) => a.id)).toEqual(['a1', 'a4']);
      expect(usage.attached_by_skills.map((s) => s.id)).toEqual(['s1', 's2']);
    });

    it('rounds the coverage to a whole percentage', async () => {
      attachments = {
        agents: [agent('a1', true, ['docs/x.md']), agent('a2', true, []), agent('a3', true, [])],
        skills: [],
      };
      expect((await makeService().service.usage(WS, REPO_ID, 'docs/x.md')).coverage_pct).toBe(33);
    });

    it('is null when the workspace has no enabled agent', async () => {
      attachments = { agents: [agent('a1', false, ['docs/x.md'])], skills: [] };
      const usage = await makeService().service.usage(WS, REPO_ID, 'docs/x.md');
      expect(usage.coverage_pct).toBeNull();
      expect(usage.used_by_agents).toBe(0);
      expect(usage.enabled_agents).toBe(0);
    });

    it('is 0 for a document nothing attaches, and 100 when every enabled agent uses it', async () => {
      attachments = { agents: [agent('a1', true, [])], skills: [] };
      expect((await makeService().service.usage(WS, REPO_ID, 'docs/x.md')).coverage_pct).toBe(0);
      attachments = { agents: [agent('a1', true, ['docs/x.md'])], skills: [] };
      expect((await makeService().service.usage(WS, REPO_ID, 'docs/x.md')).coverage_pct).toBe(100);
    });
  });

  describe('sync (AC-82)', () => {
    it('syncs the working copy of the default branch and returns the new head', async () => {
      const res = await makeService().service.sync(WS, REPO_ID);
      expect(res).toEqual({ head: 'deadbeef' });
      expect(git.syncs).toEqual([{ repo: { owner: 'acme', name: 'api' }, branch: 'main' }]);
    });

    it('answers 409 for a repository that was never cloned and does not touch git', async () => {
      repoRow = { ...repoRow, cloned: false };
      const err = await failure(() => makeService().service.sync(WS, REPO_ID));
      expect(err.statusCode).toBe(409);
      expect(git.syncs).toEqual([]);
    });

    it('turns a git failure into a 502 with a fixed message that carries no path (AC-5)', async () => {
      const failing = {
        sync: async () => {
          throw new Error(`fatal: unable to access '${clone}/.git': Permission denied`);
        },
      };
      const err = await failure(() => makeService({ git: failing }).service.sync(WS, REPO_ID));
      expect(err.statusCode).toBe(502);
      expect(JSON.stringify({ m: err.message, d: err.details })).not.toContain(clone);
      expect(err.message).not.toContain('Permission denied');
    });

    it('makes no network call by listing (refresh) — only sync touches git', async () => {
      const { service } = makeService();
      await service.list(WS, REPO_ID);
      await service.read(WS, REPO_ID, 'docs/none.md').catch(() => undefined);
      expect(git.syncs).toEqual([]);
      expect(git.cloned).toEqual([]);
    });
  });

  describe('local documents (AC-55, AC-56, AC-84, AC-85)', () => {
    it('writes only to the local store, never to the working copy', async () => {
      putRepo('docs/repo.md', 'repo');
      const before = tree(clone);
      const { service } = makeService();
      const saved = await service.writeLocal(WS, REPO_ID, { folder: 'docs', name: 'mine.md', content: '# mine' });
      expect(saved).toMatchObject({ path: 'docs/mine.md', source: 'local' });
      expect(tree(clone)).toEqual(before);
      expect(tree(ctxDir)).toEqual(['repo1/docs/mine.md']);
    });

    it.each([
      ['a non-.md name', { folder: 'docs', name: 'a.txt', content: 'x' }],
      ['a name with a path separator', { folder: 'docs', name: 'a/b.md', content: 'x' }],
      ['a name with ..', { folder: 'docs', name: '../a.md', content: 'x' }],
      ['an off-glob folder', { folder: 'src', name: 'a.md', content: 'x' }],
      ['an oversize document', { folder: 'docs', name: 'a.md', content: 'a'.repeat(65_537) }],
      ['invalid UTF-8', { folder: 'docs', name: 'a.md', content: '\ud800' }],
    ])('rejects %s with 422 naming the reason and writes nothing', async (_label, body) => {
      const err = await failure(() => makeService().service.writeLocal(WS, REPO_ID, body));
      expect(err.statusCode).toBe(422);
      expect(err.message.length).toBeGreaterThan(0);
      expect(tree(ctxDir)).toEqual([]);
    });

    it('rejects a create that collides with a repository or local document: 422 naming the conflicting path', async () => {
      putRepo('docs/repo.md', 'repo');
      const { service } = makeService();
      await service.writeLocal(WS, REPO_ID, { folder: 'docs', name: 'mine.md', content: 'one' });

      const overRepo = await failure(() => service.writeLocal(WS, REPO_ID, { folder: 'docs', name: 'repo.md', content: 'x' }));
      expect(overRepo.statusCode).toBe(422);
      expect(overRepo.message).toContain('docs/repo.md');

      const overLocal = await failure(() => service.writeLocal(WS, REPO_ID, { folder: 'docs', name: 'mine.md', content: 'x' }));
      expect(overLocal.statusCode).toBe(422);
      expect(overLocal.message).toContain('docs/mine.md');
      expect(tree(ctxDir)).toEqual(['repo1/docs/mine.md']);
    });

    it('answers a stale save with 409 carrying the newer content and version', async () => {
      const { service } = makeService();
      const v1 = await service.writeLocal(WS, REPO_ID, { folder: 'docs', name: 'a.md', content: 'v1' });
      const v2 = await service.writeLocal(WS, REPO_ID, { folder: 'docs', name: 'a.md', content: 'v2', base_version: v1.version });

      const err = await failure(() =>
        service.writeLocal(WS, REPO_ID, { folder: 'docs', name: 'a.md', content: 'v3', base_version: v1.version }),
      );
      expect(err.statusCode).toBe(409);
      expect(err.details).toMatchObject({ current_content: 'v2', current_version: v2.version });
    });
  });

  describe('a stored local document that cannot be read (AC-5)', () => {
    /** Make `readFile` of the stored `rel` document fail like the OS would, naming the absolute path. */
    const failReadOf = (rel: string, code: string) => {
      const target = join(ctxDir, REPO_ID, rel);
      vi.mocked(readFile).mockImplementation((async (p: Parameters<typeof readFile>[0], ...rest: unknown[]) => {
        if (String(p) === target) {
          throw Object.assign(new Error(`${code}: operation failed, open '${target}'`), { code, path: target });
        }
        return (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).readFile(
          p,
          ...(rest as [never]),
        );
      }) as unknown as typeof readFile);
    };
    afterEach(async () => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
      vi.mocked(readFile).mockImplementation(actual.readFile as typeof readFile);
    });

    it('answers 500 `io_error` with a fixed message and a path-free body, and changes nothing', async () => {
      const { service } = makeService();
      const v1 = await service.writeLocal(WS, REPO_ID, { folder: 'docs', name: 'a.md', content: 'original' });
      failReadOf('docs/a.md', 'EACCES');

      const updates = [
        await failure(() =>
          service.writeLocal(WS, REPO_ID, { folder: 'docs', name: 'a.md', content: 'new', base_version: v1.version }),
        ),
        await failure(() => service.writeLocal(WS, REPO_ID, { folder: 'docs', name: 'a.md', content: 'new' })),
      ];
      for (const err of updates) {
        expect(err.statusCode).toBe(500);
        expect(err.code).toBe('io_error');
        expect(err.message).toBe('document storage failed');
        expect(err.details).toEqual({ reason: 'io_error', path: 'docs/a.md' });
        expectPathFree(JSON.stringify({ m: err.message, d: err.details, c: err.code }));
      }
      expect(tree(ctxDir)).toEqual(['repo1/docs/a.md']);
      expect(readFileSync(join(ctxDir, 'repo1/docs/a.md'), 'utf8')).toBe('original');
    });

    it('an upload onto it reports a fixed, path-free reason for the file', async () => {
      const { service } = makeService();
      await service.writeLocal(WS, REPO_ID, { folder: 'docs', name: 'a.md', content: 'original' });
      failReadOf('docs/a.md', 'EACCES');

      const up = await service.upload(WS, REPO_ID, {
        folder: 'docs',
        files: [{ name: 'a.md', content_b64: Buffer.from('new').toString('base64') }],
      });
      expect(up.stored).toEqual([]);
      expect(up.rejected).toEqual([{ name: 'a.md', reason: 'document storage failed' }]);
      expectPathFree(JSON.stringify(up.rejected));
      expect(readFileSync(join(ctxDir, 'repo1/docs/a.md'), 'utf8')).toBe('original');
    });

    it('a genuine path problem is still a 422 `unsafe`, not a 500', async () => {
      const { service } = makeService();
      await service.writeLocal(WS, REPO_ID, { folder: 'docs', name: 'a.md', content: 'original' });
      failReadOf('docs/a.md', 'ELOOP');

      const err = await failure(() => service.writeLocal(WS, REPO_ID, { folder: 'docs', name: 'a.md', content: 'x' }));
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('validation_error');
      expect(err.details).toMatchObject({ reason: 'unsafe', path: 'docs/a.md' });
      expectPathFree(JSON.stringify({ m: err.message, d: err.details }));
    });
  });

  describe('upload (AC-70)', () => {
    const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64');

    it('validates each file separately: stores the valid ones and reports each rejected file by name with a reason', async () => {
      putRepo('docs/taken.md', 'repo');
      const { service } = makeService();
      const res = await service.upload(WS, REPO_ID, {
        folder: 'docs',
        files: [
          { name: 'good.md', content_b64: b64('# good') },
          { name: 'notes.txt', content_b64: b64('text') },
          { name: 'big.md', content_b64: b64('a'.repeat(65_537)) },
          { name: 'bin.md', content_b64: b64(Buffer.from([0xff, 0xfe, 0xfd])) },
          { name: 'taken.md', content_b64: b64('x') },
          { name: 'a/b.md', content_b64: b64('x') },
          { name: 'nobase64.md', content_b64: '%%%not base64%%%' },
          { name: 'also-good.md', content_b64: b64('# also good') },
        ],
      });

      expect(res.stored).toEqual(['docs/good.md', 'docs/also-good.md']);
      expect(res.rejected.map((r) => r.name)).toEqual([
        'notes.txt',
        'big.md',
        'bin.md',
        'taken.md',
        'a/b.md',
        'nobase64.md',
      ]);
      for (const r of res.rejected) expect(r.reason.length).toBeGreaterThan(0);
      expect(res.rejected.find((r) => r.name === 'taken.md')!.reason).toContain('docs/taken.md');
      expect(tree(ctxDir)).toEqual(['repo1/docs/also-good.md', 'repo1/docs/good.md']);
      expect(tree(clone)).toEqual(['docs/taken.md']);
    });

    it('rejects a file whose name or folder would escape, without writing anywhere', async () => {
      const { service } = makeService();
      const names = await service.upload(WS, REPO_ID, {
        folder: 'docs',
        files: [{ name: '../escape.md', content_b64: b64('x') }, { name: 'nul\0.md', content_b64: b64('x') }],
      });
      expect(names.stored).toEqual([]);
      expect(names.rejected).toHaveLength(2);

      const folder = await service.upload(WS, REPO_ID, {
        folder: '../outside',
        files: [{ name: 'a.md', content_b64: b64('x') }],
      });
      expect(folder.stored).toEqual([]);
      expect(folder.rejected).toHaveLength(1);
      expect(readdirSync(base).sort()).toEqual(['clone', 'ctx']);
      expect(tree(ctxDir)).toEqual([]);
    });
  });

  describe('folders and delete (AC-69, AC-86)', () => {
    it('creates a folder that matches a search root and lists it while empty; rejects one that does not', async () => {
      const { service } = makeService();
      await expect(service.createFolder(WS, REPO_ID, 'docs/new')).resolves.toEqual({ path: 'docs/new' });
      expect((await service.list(WS, REPO_ID)).local_folders).toEqual(['docs/new']);
      const err = await failure(() => service.createFolder(WS, REPO_ID, 'foo'));
      expect(err.statusCode).toBe(422);
      expect(tree(ctxDir)).toEqual([]);
    });

    it('answers 422 `validation_error` naming the conflicting repo-relative path for a folder on a taken path (AC-84)', async () => {
      putRepo('docs/guides/intro.md', 'repo');
      putRepo('docs/repo.md', 'repo');
      const { service } = makeService();
      await service.writeLocal(WS, REPO_ID, { folder: 'docs', name: 'mine.md', content: 'x' });
      await service.createFolder(WS, REPO_ID, 'docs/made');

      for (const taken of ['docs/made', 'docs/mine.md', 'docs/guides', 'docs/repo.md']) {
        const err = await failure(() => service.createFolder(WS, REPO_ID, taken));
        expect(err.statusCode, taken).toBe(422);
        expect(err.code, taken).toBe('validation_error');
        expect(err.details, taken).toMatchObject({ path: taken, reason: 'conflict' });
        expect(err.message, taken).toContain(taken);
      }
      // nothing new on disk beyond what was set up
      expect(tree(ctxDir)).toEqual(['repo1/docs/mine.md']);
      expect((await service.list(WS, REPO_ID)).local_folders).toEqual(['docs/made']);
    });

    it('answers a path-free 422 when an ancestor of the target is already a document (AC-5, AC-84)', async () => {
      const { service } = makeService();
      await service.writeLocal(WS, REPO_ID, { folder: 'docs', name: 'x.md', content: 'x' });

      const attempts = [
        await failure(() => service.writeLocal(WS, REPO_ID, { folder: 'docs/x.md', name: 'a.md', content: 'y' })),
        await failure(() => service.createFolder(WS, REPO_ID, 'docs/x.md')),
        await failure(() => service.createFolder(WS, REPO_ID, 'docs/x.md/sub')),
      ];
      for (const e of attempts) {
        expect(e.statusCode).toBe(422);
        expect(e.code).toBe('validation_error');
        expectPathFree(JSON.stringify({ m: e.message, d: e.details, c: e.code }));
      }

      // an upload reports the same reason per file, again without a path
      const up = await service.upload(WS, REPO_ID, {
        folder: 'docs/x.md',
        files: [{ name: 'a.md', content_b64: Buffer.from('y').toString('base64') }],
      });
      expect(up.stored).toEqual([]);
      expect(up.rejected).toHaveLength(1);
      expectPathFree(JSON.stringify(up.rejected));
      expect(tree(ctxDir)).toEqual(['repo1/docs/x.md']);
    });

    it('deletes a local document and an empty local folder; a non-empty folder is refused with 422', async () => {
      const { service } = makeService();
      await service.writeLocal(WS, REPO_ID, { folder: 'docs/full', name: 'a.md', content: 'x' });
      await service.createFolder(WS, REPO_ID, 'docs/empty');

      expect((await failure(() => service.deleteFolder(WS, REPO_ID, 'docs/full'))).statusCode).toBe(422);
      await service.deleteFolder(WS, REPO_ID, 'docs/empty');
      await service.deleteLocal(WS, REPO_ID, 'docs/full/a.md');
      expect((await service.list(WS, REPO_ID)).docs).toEqual([]);
      expect((await failure(() => service.deleteLocal(WS, REPO_ID, 'docs/full/a.md'))).statusCode).toBe(404);
    });

    it('deleting a local document does not touch the attachments that reference it', async () => {
      attachments = {
        agents: [{ id: 'a1', name: 'agent', enabled: true, docs: ['docs/a.md'], skills: [] }],
        skills: [],
      };
      const { service } = makeService();
      await service.writeLocal(WS, REPO_ID, { folder: 'docs', name: 'a.md', content: 'x' });
      await service.deleteLocal(WS, REPO_ID, 'docs/a.md');
      // the attachment is still reported; the document is simply missing now
      const usage = await service.usage(WS, REPO_ID, 'docs/a.md');
      expect(usage.attached_by_agents.map((a) => a.id)).toEqual(['a1']);
      expect((await service.list(WS, REPO_ID)).docs).toEqual([]);
    });
  });

  describe('local count (AC-87)', () => {
    it('counts the repository\'s local documents', async () => {
      const { service } = makeService();
      expect(await service.localCount(WS, REPO_ID)).toEqual({ count: 0 });
      await service.writeLocal(WS, REPO_ID, { folder: 'docs', name: 'a.md', content: 'x' });
      await service.writeLocal(WS, REPO_ID, { folder: 'specs', name: 'b.md', content: 'x' });
      expect(await service.localCount(WS, REPO_ID)).toEqual({ count: 2 });
    });
  });
});
