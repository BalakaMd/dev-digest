import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, statSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { loadConfig } from '../src/platform/config.js';
import { buildApp } from '../src/app.js';
import { MockContextDocStore } from '../src/adapters/mocks.js';
import { FsContextDocStore, ContextDocError } from '../src/adapters/context-docs/index.js';
import type { ContextDocScope } from '../src/adapters/context-docs/index.js';
import { compileGlobs, DEFAULT_CONTEXT_GLOBS } from '../src/adapters/context-docs/glob.js';

const DEFAULT = '**/{specs,docs,insights}/**/*.md';
const env = (extra: Record<string, string | undefined>) =>
  ({ ...process.env, NODE_ENV: 'test', ...extra }) as NodeJS.ProcessEnv;

/** T-7 — search globs from the environment (AC-2, AC-80, EC-24, NFR-4). */
describe('search globs from the server configuration', () => {
  it('uses the default `**/{specs,docs,insights}/**/*.md` when none is configured (AC-2)', () => {
    const cfg = loadConfig(env({ CONTEXT_DOC_GLOBS: undefined }));
    expect(cfg.contextDocGlobs).toEqual([DEFAULT]);
    expect(cfg.contextDocGlobsRejected).toBeNull();
    expect(DEFAULT_CONTEXT_GLOBS).toEqual([DEFAULT]);
  });

  it('takes the globs from CONTEXT_DOC_GLOBS, `;`-separated (AC-2)', () => {
    const one = loadConfig(env({ CONTEXT_DOC_GLOBS: 'notes/**/*.md' }));
    expect(one.contextDocGlobs).toEqual(['notes/**/*.md']);
    expect(one.contextDocGlobsRejected).toBeNull();

    const two = loadConfig(env({ CONTEXT_DOC_GLOBS: 'notes/**/*.md; rfc/*.md ' }));
    expect(two.contextDocGlobs).toEqual(['notes/**/*.md', 'rfc/*.md']);
  });

  it('keeps the commas inside braces: one glob, not several', () => {
    const cfg = loadConfig(env({ CONTEXT_DOC_GLOBS: '{adr,rfc}/**/*.md' }));
    expect(cfg.contextDocGlobs).toEqual(['{adr,rfc}/**/*.md']);
  });

  it.each([
    ['only separators', ';;'],
    ['only whitespace', '   '],
    ['an absolute pattern', '/etc/**/*.md'],
    ['a parent segment', '../outside/*.md'],
    ['a NUL byte', 'docs/\0/*.md'],
    ['a non-markdown pattern', 'docs/**/*.txt'],
    ['an unbalanced brace', 'docs/{a,b/*.md'],
    ['one bad pattern among good ones', 'docs/**/*.md;/abs/*.md'],
  ])('falls back to the default globs and reports the rejected value for %s (AC-80)', (_label, raw) => {
    const cfg = loadConfig(env({ CONTEXT_DOC_GLOBS: raw }));
    expect(cfg.contextDocGlobs).toEqual([DEFAULT]);
    expect(cfg.contextDocGlobsRejected).toBe(raw);
  });

  describe('server log (AC-80, NFR-4)', () => {
    afterEach(() => vi.restoreAllMocks());

    async function bootAndCaptureLog(raw: string | undefined) {
      const written: string[] = [];
      vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
        written.push(String(chunk));
        return true;
      }) as typeof process.stdout.write);
      const cfg = { ...loadConfig(env({ CONTEXT_DOC_GLOBS: raw })), logLevel: 'warn' };
      const app = await buildApp({ config: cfg });
      await app.close();
      vi.restoreAllMocks();
      return { cfg, written: written.join('') };
    }

    it('starts with the default globs and writes a warning naming the rejected value', async () => {
      const { cfg, written } = await bootAndCaptureLog(';;');
      expect(cfg.contextDocGlobs).toEqual([DEFAULT]);
      const warn = written
        .split('\n')
        .filter((l) => l.startsWith('{'))
        .map((l) => JSON.parse(l) as { level: number; value?: string; msg: string })
        .find((l) => l.value === ';;');
      expect(warn).toBeDefined();
      expect(warn!.level).toBe(40); // warn
      expect(warn!.msg).toMatch(/CONTEXT_DOC_GLOBS/);
    });

    it('writes no such warning for a valid or unset value', async () => {
      const { written } = await bootAndCaptureLog('notes/**/*.md');
      expect(written).not.toMatch(/CONTEXT_DOC_GLOBS/);
      const unset = await bootAndCaptureLog(undefined);
      expect(unset.written).not.toMatch(/CONTEXT_DOC_GLOBS/);
    });
  });
});

describe('glob matching', () => {
  const match = compileGlobs(DEFAULT_CONTEXT_GLOBS);

  it.each([
    'docs/a.md',
    'specs/a.md',
    'insights/a.md',
    '.devdigest/specs/a.md',
    'packages/x/docs/deep/er/a.md',
    'docs/specs/x.md',
  ])('default globs match %s', (p) => expect(match(p)).toBe(true));

  it.each([
    'README.md',
    'src/a.md',
    'docs/a.txt',
    'docs/a.md.bak',
    'docsx/a.md',
    'Docs/a.md', // case-sensitive
    'xdocs/a.md',
    'docs',
  ])('default globs do not match %s', (p) => expect(match(p)).toBe(false));

  it('custom globs replace the default: only matching files are listed (AC-2)', async () => {
    const base = mkdtempSync(join(tmpdir(), 'devdigest-ctx-glob-'));
    try {
      const clone = join(base, 'clone');
      for (const rel of ['notes/a.md', 'docs/b.md', 'rfc/c.md']) {
        mkdirSync(join(clone, rel, '..'), { recursive: true });
        writeFileSync(join(clone, rel), '# x');
      }
      const store = new FsContextDocStore({
        globs: ['notes/**/*.md', '{rfc,adr}/*.md'],
        contextDir: join(base, 'ctx'),
        clonePathFor: () => clone,
        countTokens: (t) => t.length,
      });
      const scope: ContextDocScope = { repoId: 'r1', repo: { owner: 'o', name: 'n' } };
      expect((await store.list(scope)).docs.map((d) => d.path)).toEqual(['notes/a.md', 'rfc/c.md']);
      expect(store.matchesGlobs('docs/b.md')).toBe(false);
      // a custom root has no specs/docs/insights folder → no type badge
      expect((await store.list(scope)).docs.map((d) => d.type)).toEqual([null, null]);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

/**
 * T-8 — path and name validation (AC-4, AC-56, EC-5). Re-derived from the
 * spec: every rejected request reads or writes nothing.
 */
describe('document path and name validation', () => {
  let base: string;
  let clone: string;
  let ctxDir: string;
  let outside: string;
  const scope: ContextDocScope = { repoId: 'repo1', repo: { owner: 'acme', name: 'api' } };

  const fileTree = (root: string): string[] => {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const abs = join(dir, name);
        if (statSync(abs).isDirectory()) walk(abs);
        else out.push(relative(root, abs));
      }
    };
    walk(root);
    return out.sort();
  };

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'devdigest-ctx-valid-'));
    clone = join(base, 'clone');
    ctxDir = join(base, 'ctx');
    outside = join(base, 'outside');
    for (const d of [clone, ctxDir, outside, join(clone, 'docs'), join(clone, 'src')]) {
      mkdirSync(d, { recursive: true });
    }
    writeFileSync(join(outside, 'secret.md'), 'TOP SECRET');
    writeFileSync(join(clone, 'docs', 'a.txt'), 'not markdown');
    writeFileSync(join(clone, 'src', 'notes.md'), 'off-glob markdown');
    writeFileSync(join(clone, 'docs', 'ok.md'), 'fine');
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  const store = () =>
    new FsContextDocStore({
      globs: DEFAULT_CONTEXT_GLOBS,
      contextDir: ctxDir,
      clonePathFor: () => clone,
      countTokens: (t) => t.length,
    });

  describe('read paths (AC-4)', () => {
    const cases: Array<[string, () => string]> = [
      ['an absolute path to a real file', () => join(outside, 'secret.md')],
      ['a `..` segment escaping the working copy', () => '../outside/secret.md'],
      ['a `..` segment in the middle', () => 'docs/../../outside/secret.md'],
      ['a leading slash', () => '/docs/ok.md'],
      ['a Windows drive path', () => 'C:/docs/ok.md'],
      ['a backslash separator', () => 'docs\\ok.md'],
      ['a NUL byte', () => 'docs/ok\0.md'],
      ['a NUL byte before the extension check', () => 'docs/ok.md\0'],
      ['a non-.md extension', () => 'docs/a.txt'],
      ['a missing extension', () => 'docs/ok'],
      ['an empty path', () => ''],
      ['an empty segment', () => 'docs//ok.md'],
      ['a path outside the configured globs', () => 'src/notes.md'],
      ['a top-level file outside the globs', () => 'README.md'],
    ];

    it.each(cases)('rejects %s without returning any content', async (_label, mk) => {
      const path = mk();
      const outcome = await store()
        .read(scope, path)
        .then((r) => ({ ok: true as const, r }))
        .catch((e: unknown) => ({ ok: false as const, e }));
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.e).toBeInstanceOf(ContextDocError);
        expect(String((outcome.e as Error).message)).not.toContain('TOP SECRET');
      }
      // the same refusal for an explicit source
      await expect(store().read(scope, path, 'repo')).rejects.toBeInstanceOf(ContextDocError);
      await expect(store().read(scope, path, 'local')).rejects.toBeInstanceOf(ContextDocError);
    });

    it('rejects a path to a repository file that exists but is outside the globs (the file is real)', async () => {
      await expect(store().read(scope, 'src/notes.md')).rejects.toMatchObject({ code: 'invalid_path' });
    });

    it('a valid path still reads', async () => {
      await expect(store().read(scope, 'docs/ok.md')).resolves.toMatchObject({ content: 'fine' });
    });

    it('does not follow a symlink planted at an otherwise valid path', async () => {
      symlinkSync(join(outside, 'secret.md'), join(clone, 'docs', 'planted.md'));
      await expect(store().read(scope, 'docs/planted.md')).rejects.toBeInstanceOf(ContextDocError);
    });
  });

  describe('write names and folders (AC-56, AC-4)', () => {
    const write = (folder: string, name: string, content = '# x') =>
      store().writeLocal(scope, { folder, name, content });

    it.each([
      ['a non-.md extension', 'docs', 'a.txt'],
      ['no extension', 'docs', 'a'],
      ['a forward slash in the name', 'docs', 'a/b.md'],
      ['a backslash in the name', 'docs', 'a\\b.md'],
      ['a `..` in the name', 'docs', '..md'],
      ['a path traversal name', 'docs', '../a.md'],
      ['a traversal name that stays below', 'docs', '../../outside.md'],
      ['a NUL byte in the name', 'docs', 'a\0.md'],
      ['an empty name', 'docs', ''],
      ['an absolute folder', '/docs', 'a.md'],
      ['a trailing slash in the folder', 'docs/', 'a.md'],
      ['a `..` folder', '../docs', 'a.md'],
      ['a folder that goes up and comes back', 'docs/../docs', 'a.md'],
      ['a NUL byte in the folder', 'docs\0', 'a.md'],
      ['a folder outside the globs', 'src', 'a.md'],
      ['the root folder (no search root)', '', 'a.md'],
    ])('rejects %s and writes nothing', async (_label, folder, name) => {
      await expect(write(folder, name)).rejects.toBeInstanceOf(ContextDocError);
      expect(fileTree(ctxDir)).toEqual([]);
      expect(fileTree(clone)).toEqual(['docs/a.txt', 'docs/ok.md', 'src/notes.md']);
      expect(fileTree(outside)).toEqual(['secret.md']);
    });

    it('rejects a document over 65,536 bytes and accepts exactly 65,536', async () => {
      await expect(write('docs', 'big.md', 'a'.repeat(65_537))).rejects.toMatchObject({ code: 'too_large' });
      expect(fileTree(ctxDir)).toEqual([]);
      await expect(write('docs', 'edge.md', 'a'.repeat(65_536))).resolves.toMatchObject({ size_bytes: 65_536 });
    });

    it('measures the size limit in bytes: 40,000 two-byte characters is too large', async () => {
      await expect(write('docs', 'wide.md', 'é'.repeat(40_000))).rejects.toMatchObject({ code: 'too_large' });
      expect(fileTree(ctxDir)).toEqual([]);
    });

    it('rejects content that is not valid UTF-8 (lone surrogate)', async () => {
      await expect(write('docs', 'bad.md', 'ok \ud800 not ok')).rejects.toMatchObject({ code: 'not_utf8' });
      expect(fileTree(ctxDir)).toEqual([]);
    });

    it('never writes into the working copy', async () => {
      const before = fileTree(clone);
      await write('docs', 'new.md', '# new');
      expect(fileTree(clone)).toEqual(before);
      expect(fileTree(ctxDir)).toEqual(['repo1/docs/new.md']);
    });
  });

  describe('folder creation (AC-69)', () => {
    it.each([
      ['a folder that matches no search root', 'foo'],
      ['an absolute folder', '/docs/new'],
      ['a `..` segment', 'docs/../../x'],
      ['a trailing slash', 'docs/new/'],
      ['an empty segment', 'docs//new'],
      ['a NUL byte', 'docs/new\0'],
      ['a backslash', 'docs\\new'],
      ['an empty path', ''],
    ])('rejects %s and creates nothing', async (_label, path) => {
      await expect(store().createLocalFolder(scope, path)).rejects.toBeInstanceOf(ContextDocError);
      expect(readdirSync(ctxDir)).toEqual([]);
      expect(readdirSync(outside)).toEqual(['secret.md']);
    });

    it('creates a folder that matches a search root, even nested under a hidden directory', async () => {
      await expect(store().createLocalFolder(scope, 'docs/new')).resolves.toBe('docs/new');
      await expect(store().createLocalFolder(scope, '.devdigest/specs')).resolves.toBe('.devdigest/specs');
      const listed = await store().list(scope);
      expect(listed.local_folders).toEqual(['.devdigest/specs', 'docs/new']);
    });
  });

  describe('API layer rejects before the handler runs (AC-4, AC-26, AC-56)', () => {
    const ID = '11111111-1111-4111-8111-111111111111';
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

    // A store that fails the test if the API ever reaches it for a bad path.
    class ForbiddenStore extends MockContextDocStore {
      touched: string[] = [];
      async read(...a: Parameters<MockContextDocStore['read']>) {
        this.touched.push(`read:${a[1]}`);
        return super.read(...a);
      }
      async writeLocal(...a: Parameters<MockContextDocStore['writeLocal']>) {
        this.touched.push(`write:${a[1].name}`);
        return super.writeLocal(...a);
      }
      async deleteLocal(...a: Parameters<MockContextDocStore['deleteLocal']>) {
        this.touched.push(`delete:${a[1]}`);
        return super.deleteLocal(...a);
      }
    }

    it.each([
      ['a `..` segment', '../a.md'],
      ['an absolute path', '/a.md'],
      ['a non-.md extension', 'docs/a.txt'],
      ['a NUL byte (percent-encoded)', 'docs/a%00.md'],
      ['a backslash', 'docs%5Ca.md'],
    ])('GET content and DELETE local → 422 for %s, store untouched', async (_label, path) => {
      const fake = new ForbiddenStore();
      const app = await buildApp({ config, overrides: { contextDocs: fake } });
      try {
        const get = await app.inject({ method: 'GET', url: `/repos/${ID}/context-docs/content?path=${path}` });
        expect(get.statusCode).toBe(422);
        expect(get.json().error.code).toBe('validation_error');
        const usage = await app.inject({ method: 'GET', url: `/repos/${ID}/context-docs/usage?path=${path}` });
        expect(usage.statusCode).toBe(422);
        const del = await app.inject({ method: 'DELETE', url: `/repos/${ID}/context-docs/local?path=${path}` });
        expect(del.statusCode).toBe(422);
        expect(fake.touched).toEqual([]);
      } finally {
        await app.close();
      }
    });

    it('PUT local with an empty or oversize name, or a missing body → 422, store untouched', async () => {
      const fake = new ForbiddenStore();
      const app = await buildApp({ config, overrides: { contextDocs: fake } });
      try {
        for (const payload of [
          { folder: 'docs', name: '', content: 'x' },
          { folder: 'docs', name: 'a'.repeat(256), content: 'x' },
          { folder: 'docs', content: 'x' },
          {},
        ]) {
          const res = await app.inject({ method: 'PUT', url: `/repos/${ID}/context-docs/local`, payload });
          expect(res.statusCode).toBe(422);
        }
        expect(fake.touched).toEqual([]);
      } finally {
        await app.close();
      }
    });

    it('PUT /agents|skills/:id/context-docs → 422 for a bad path, a duplicate and 21 paths (AC-26)', async () => {
      const app = await buildApp({ config, overrides: { contextDocs: new MockContextDocStore() } });
      try {
        const bad: string[][] = [
          ['../x.md'],
          ['/abs/docs/x.md'],
          ['docs/a.txt'],
          ['docs/a%00.md'.replace('%00', '\0')],
          ['docs/a.md', 'docs/a.md'],
          Array.from({ length: 21 }, (_, i) => `docs/${i}.md`),
        ];
        for (const kind of ['agents', 'skills']) {
          for (const paths of bad) {
            const res = await app.inject({ method: 'PUT', url: `/${kind}/${ID}/context-docs`, payload: { paths } });
            expect(res.statusCode, `${kind} ${JSON.stringify(paths).slice(0, 40)}`).toBe(422);
            expect(res.json().error.code).toBe('validation_error');
          }
        }
        // a non-array body is rejected as well
        const res = await app.inject({ method: 'PUT', url: `/agents/${ID}/context-docs`, payload: { paths: 'docs/a.md' } });
        expect(res.statusCode).toBe(422);
      } finally {
        await app.close();
      }
    });
  });
});
