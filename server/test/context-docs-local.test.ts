import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
  lstatSync,
  rmSync,
  symlinkSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { FsContextDocStore, ContextDocError } from '../src/adapters/context-docs/index.js';
import type { ContextDocScope } from '../src/adapters/context-docs/index.js';
import { DEFAULT_CONTEXT_GLOBS } from '../src/adapters/context-docs/glob.js';

// `readFile` passes through to the real one; a test makes it fail for one stored
// file to simulate an I/O error that cannot be produced portably (root ignores chmod).
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

/**
 * Local-document overlay on temp dirs (SPEC-01: AC-60, 61, 62, 64, 65, 69, 84,
 * 85, 86, 87; NFR-1). Hermetic — nothing outside the temp dirs is touched.
 */
describe('FsContextDocStore — local documents', () => {
  let base: string;
  let clone: string;
  let ctxDir: string;
  let outside: string;
  const scope: ContextDocScope = { repoId: 'repo1', repo: { owner: 'acme', name: 'api' } };

  const tree = (root: string): string[] => {
    if (!existsSync(root)) return [];
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const abs = join(dir, name);
        const st = lstatSync(abs);
        if (st.isDirectory()) walk(abs);
        else out.push(relative(root, abs));
      }
    };
    walk(root);
    return out.sort();
  };

  const putRepo = (rel: string, content: string | Buffer) => {
    const abs = join(clone, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  };
  /** Place a local document directly on disk (bypassing the API under test). */
  const putLocal = (rel: string, content: string | Buffer) => {
    const abs = join(ctxDir, scope.repoId, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  };

  const store = () =>
    new FsContextDocStore({
      globs: DEFAULT_CONTEXT_GLOBS,
      contextDir: ctxDir,
      clonePathFor: () => clone,
      countTokens: (t) => t.length,
    });

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'devdigest-ctx-local-'));
    clone = join(base, 'clone');
    ctxDir = join(base, 'ctx');
    outside = join(base, 'outside');
    for (const d of [clone, ctxDir, outside]) mkdirSync(d, { recursive: true });
    writeFileSync(join(outside, 'victim.md'), 'ORIGINAL');
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  describe('storage and listing (AC-60, AC-61)', () => {
    it('stores a created document under the data dir, outside the working copy, and lists it as source local', async () => {
      putRepo('docs/repo.md', 'repo doc');
      const cloneBefore = tree(clone);

      const saved = await store().writeLocal(scope, { folder: 'docs', name: 'mine.md', content: '# mine' });
      expect(saved).toMatchObject({ path: 'docs/mine.md', source: 'local', content: '# mine' });

      expect(tree(ctxDir)).toEqual(['repo1/docs/mine.md']);
      expect(readFileSync(join(ctxDir, 'repo1/docs/mine.md'), 'utf8')).toBe('# mine');
      expect(tree(clone)).toEqual(cloneBefore); // working copy untouched

      const docs = (await store().list(scope)).docs;
      expect(docs.map((d) => [d.path, d.source])).toEqual([
        ['docs/mine.md', 'local'],
        ['docs/repo.md', 'repo'],
      ]);
      expect(docs[0]).toMatchObject({ type: 'docs', folder: 'docs', overrides_repo: false, overridden: false, repo_changed: false, too_large: false });
    });

    it('keeps each repository\'s local documents separate (EC-9)', async () => {
      const other: ContextDocScope = { repoId: 'repo2', repo: { owner: 'acme', name: 'web' } };
      await store().writeLocal(scope, { folder: 'docs', name: 'a.md', content: 'one' });
      await store().writeLocal(other, { folder: 'docs', name: 'a.md', content: 'two' });
      expect((await store().read(scope, 'docs/a.md')).content).toBe('one');
      expect((await store().read(other, 'docs/a.md')).content).toBe('two');
      expect(await store().countLocal('repo1')).toBe(1);
      expect(await store().countLocal('repo2')).toBe(1);
    });

    it('local documents survive a working-copy sync that rewrites the clone (AC-60)', async () => {
      putRepo('docs/repo.md', 'v1');
      await store().writeLocal(scope, { folder: 'docs', name: 'mine.md', content: '# mine' });
      await store().createLocalFolder(scope, 'specs/empty');

      // `sync` = fetch + hard reset: simulate by wiping and re-creating the clone.
      rmSync(clone, { recursive: true, force: true });
      mkdirSync(clone, { recursive: true });
      putRepo('docs/repo.md', 'v2');

      const s = store();
      expect((await s.read(scope, 'docs/mine.md')).content).toBe('# mine');
      const listed = await s.list(scope);
      expect(listed.docs.map((d) => d.path)).toEqual(['docs/mine.md', 'docs/repo.md']);
      expect(listed.local_folders).toEqual(['specs/empty']);
    });

    it('lists local documents even when the repository has no working copy', async () => {
      rmSync(clone, { recursive: true, force: true });
      await store().writeLocal(scope, { folder: 'docs', name: 'mine.md', content: '# mine' });
      const res = await store().list(scope);
      expect(res.state).toBe('not_cloned');
      expect(res.docs.map((d) => [d.path, d.source])).toEqual([['docs/mine.md', 'local']]);
      // and a run can still read it
      await expect(store().read(scope, 'docs/mine.md')).resolves.toMatchObject({ source: 'local' });
    });
  });

  describe('same rules as repository documents (AC-62, AC-3, AC-6)', () => {
    it('a symlink inside the local folder is left out and refused', async () => {
      putLocal('docs/real.md', 'real');
      symlinkSync(join(outside, 'victim.md'), join(ctxDir, 'repo1', 'docs', 'link.md'));
      const s = store();
      expect((await s.list(scope)).docs.map((d) => d.path)).toEqual(['docs/real.md']);
      await expect(s.read(scope, 'docs/link.md')).rejects.toBeInstanceOf(ContextDocError);
      await expect(s.read(scope, 'docs/link.md', 'local')).rejects.toBeInstanceOf(ContextDocError);
    });

    it('a symlinked directory inside the local folder is not followed', async () => {
      putLocal('docs/real.md', 'real');
      symlinkSync(outside, join(ctxDir, 'repo1', 'docs', 'linked'));
      const s = store();
      expect((await s.list(scope)).docs.map((d) => d.path)).toEqual(['docs/real.md']);
      await expect(s.read(scope, 'docs/linked/victim.md', 'local')).rejects.toBeInstanceOf(ContextDocError);
    });

    it('an oversize local file is flagged too_large and not returned', async () => {
      putLocal('docs/big.md', 'a'.repeat(65_537));
      const [doc] = (await store().list(scope)).docs;
      expect(doc).toMatchObject({ path: 'docs/big.md', source: 'local', too_large: true, tokens: null });
      await expect(store().read(scope, 'docs/big.md')).rejects.toMatchObject({ code: 'too_large' });
    });

    it('a local file that is not valid UTF-8 is refused', async () => {
      putLocal('docs/bin.md', Buffer.from([0xff, 0xfe, 0xfd]));
      await expect(store().read(scope, 'docs/bin.md')).rejects.toMatchObject({ code: 'not_utf8' });
    });

    it('cannot be written through a symlinked folder under the local root (NFR-1)', async () => {
      mkdirSync(join(ctxDir, 'repo1'), { recursive: true });
      symlinkSync(outside, join(ctxDir, 'repo1', 'docs'));

      await expect(
        store().writeLocal(scope, { folder: 'docs', name: 'pwn.md', content: 'PWNED' }),
      ).rejects.toBeInstanceOf(ContextDocError);
      await expect(
        store().writeLocal(scope, { folder: 'docs/sub', name: 'pwn.md', content: 'PWNED' }),
      ).rejects.toBeInstanceOf(ContextDocError);
      await expect(store().createLocalFolder(scope, 'docs/made')).rejects.toBeInstanceOf(ContextDocError);

      expect(tree(outside)).toEqual(['victim.md']);
      expect(readFileSync(join(outside, 'victim.md'), 'utf8')).toBe('ORIGINAL');
    });

    it('cannot delete through a symlinked path or a symlinked file', async () => {
      mkdirSync(join(ctxDir, 'repo1', 'docs'), { recursive: true });
      symlinkSync(join(outside, 'victim.md'), join(ctxDir, 'repo1', 'docs', 'link.md'));
      await expect(store().deleteLocal(scope, 'docs/link.md')).rejects.toBeInstanceOf(ContextDocError);
      expect(readFileSync(join(outside, 'victim.md'), 'utf8')).toBe('ORIGINAL');
    });

    it('a repository id that is not a plain identifier cannot address another folder', async () => {
      const evil: ContextDocScope = { repoId: '../outside', repo: scope.repo };
      await expect(store().writeLocal(evil, { folder: 'docs', name: 'x.md', content: 'x' })).rejects.toBeInstanceOf(
        ContextDocError,
      );
      await expect(store().list(evil)).rejects.toBeInstanceOf(ContextDocError);
      await expect(store().removeRepoLocal('../outside')).rejects.toBeInstanceOf(ContextDocError);
      expect(tree(outside)).toEqual(['victim.md']);
    });
  });

  describe('precedence: local override wins (SPEC-02 AC-1, AC-2)', () => {
    it('the local copy wins; both rows stay listed, marked as override and overridden', async () => {
      putRepo('docs/rules.md', 'REPO TEXT');
      putLocal('docs/rules.md', 'LOCAL TEXT');
      const s = store();

      const docs = (await s.list(scope)).docs.filter((d) => d.path === 'docs/rules.md');
      expect(docs.map((d) => [d.source, d.overridden, d.overrides_repo])).toEqual([
        ['repo', true, false],
        ['local', false, true],
      ]);

      // effective read (what a run uses) is the local copy
      expect(await s.read(scope, 'docs/rules.md')).toMatchObject({ source: 'local', content: 'LOCAL TEXT' });
      // the overridden repository document is still addressable explicitly
      expect(await s.read(scope, 'docs/rules.md', 'repo')).toMatchObject({ source: 'repo', content: 'REPO TEXT' });
    });

    it('a repository that gains the path later turns an existing local document into an override', async () => {
      await store().writeLocal(scope, { folder: 'docs', name: 'rules.md', content: 'LOCAL TEXT' });
      expect(await store().read(scope, 'docs/rules.md')).toMatchObject({ source: 'local' });

      putRepo('docs/rules.md', 'REPO TEXT');
      expect(await store().read(scope, 'docs/rules.md')).toMatchObject({ source: 'local', content: 'LOCAL TEXT' });
      const local = (await store().list(scope)).docs.find((d) => d.source === 'local');
      expect(local?.overrides_repo).toBe(true);
    });

    it('a run reads a local document at its last saved content (AC-64)', async () => {
      const v1 = await store().writeLocal(scope, { folder: 'docs', name: 'a.md', content: 'first' });
      expect((await store().read(scope, 'docs/a.md')).content).toBe('first');
      await store().writeLocal(scope, { folder: 'docs', name: 'a.md', content: 'second', baseVersion: v1.version });
      expect((await store().read(scope, 'docs/a.md')).content).toBe('second');
    });

    it('deleting the override copy leaves the repository document in place', async () => {
      putRepo('docs/rules.md', 'REPO TEXT');
      putLocal('docs/rules.md', 'LOCAL TEXT');
      await store().deleteLocal(scope, 'docs/rules.md');
      expect(await store().read(scope, 'docs/rules.md')).toMatchObject({ source: 'repo', content: 'REPO TEXT' });
      expect((await store().list(scope)).docs.map((d) => d.source)).toEqual(['repo']);
    });
  });

  describe('creating an override copy (SPEC-02 AC-6, AC-7, AC-23, AC-29, AC-30; NFR-1)', () => {
    const sha = (t: string) => createHash('sha256').update(t).digest('hex');
    const origins = () =>
      (JSON.parse(readFileSync(join(ctxDir, 'repo1/.origins.json'), 'utf8')) as { origins: Record<string, string> }).origins;

    it('with the intent writes only into the overlay, records the sent origin, and keeps it across saves', async () => {
      putRepo('docs/rules.md', 'REPO TEXT');
      const cloneBefore = tree(clone);

      // identical text is stored like any other copy (AC-30)
      const first = await store().writeLocal(scope, {
        folder: 'docs',
        name: 'rules.md',
        content: 'REPO TEXT',
        override: { originVersion: sha('REPO TEXT') },
      });
      expect(first).toMatchObject({ path: 'docs/rules.md', source: 'local' });
      expect(tree(clone)).toEqual(cloneBefore); // NFR-1: the working copy is untouched
      expect(readFileSync(join(clone, 'docs/rules.md'), 'utf8')).toBe('REPO TEXT');
      expect(tree(ctxDir)).toEqual(['repo1/.origins.json', 'repo1/docs/rules.md']);
      expect(origins()).toEqual({ 'docs/rules.md': sha('REPO TEXT') });
      expect(await store().readEffective(scope, 'docs/rules.md')).toMatchObject({ source: 'local', overrides_repo: true });

      // saving the copy leaves its origin unchanged (AC-29)
      await store().writeLocal(scope, {
        folder: 'docs',
        name: 'rules.md',
        content: 'MY EDIT',
        baseVersion: first.version,
      });
      expect(origins()).toEqual({ 'docs/rules.md': sha('REPO TEXT') });
      expect(tree(clone)).toEqual(cloneBefore);
    });
  });

  describe('create conflicts (AC-84)', () => {
    it('rejects creating over an existing local document, names the path and leaves it unchanged', async () => {
      await store().writeLocal(scope, { folder: 'docs', name: 'a.md', content: 'original' });
      const err = await store()
        .writeLocal(scope, { folder: 'docs', name: 'a.md', content: 'overwrite' })
        .catch((e: unknown) => e as ContextDocError);
      expect(err).toBeInstanceOf(ContextDocError);
      expect(err).toMatchObject({ code: 'conflict', path: 'docs/a.md' });
      expect(readFileSync(join(ctxDir, 'repo1/docs/a.md'), 'utf8')).toBe('original');
    });

    it('rejects creating over a repository document, names the path and writes nothing', async () => {
      putRepo('docs/repo.md', 'repo text');
      const err = await store()
        .writeLocal(scope, { folder: 'docs', name: 'repo.md', content: 'mine' })
        .catch((e: unknown) => e as ContextDocError);
      expect(err).toMatchObject({ code: 'conflict', path: 'docs/repo.md' });
      expect(tree(ctxDir)).toEqual([]);
      expect(readFileSync(join(clone, 'docs/repo.md'), 'utf8')).toBe('repo text');
    });
  });

  /** What a caller may see of an error: nothing absolute (AC-5). */
  const visible = (e: ContextDocError): string => JSON.stringify({ m: e.message, p: e.path, c: e.code });
  const expectPathFree = (e: ContextDocError) => {
    const text = visible(e);
    expect(text).not.toContain(base);
    expect(text).not.toContain(tmpdir());
    expect(text).not.toContain(ctxDir);
    expect(text).not.toContain(clone);
    // no absolute-path marker: a segment that starts with `/` or a drive letter
    expect(text).not.toMatch(/(^|[\s:'"{,\[])\/[^\s"']/);
    expect(text).not.toMatch(/[A-Za-z]:\\/);
  };

  describe('an ancestor that is already a document (AC-5, AC-84)', () => {
    it('writing into a folder whose path is an existing local document is a path-free conflict', async () => {
      putLocal('docs/x.md', 'a document, not a folder');

      const err = await store()
        .writeLocal(scope, { folder: 'docs/x.md', name: 'a.md', content: 'nope' })
        .catch((e: unknown) => e as ContextDocError);

      expect(err).toBeInstanceOf(ContextDocError);
      expect(err).toMatchObject({ code: 'conflict' });
      expectPathFree(err);
      // nothing was written and the document is untouched
      expect(tree(ctxDir)).toEqual(['repo1/docs/x.md']);
      expect(readFileSync(join(ctxDir, 'repo1/docs/x.md'), 'utf8')).toBe('a document, not a folder');
    });

    it('creating a folder at the path of an existing local document is a path-free conflict', async () => {
      putLocal('docs/x.md', 'a document, not a folder');

      const err = await store()
        .createLocalFolder(scope, 'docs/x.md')
        .catch((e: unknown) => e as ContextDocError);

      expect(err).toBeInstanceOf(ContextDocError);
      expect(err).toMatchObject({ code: 'conflict', path: 'docs/x.md' });
      expectPathFree(err);
      expect(statSync(join(ctxDir, 'repo1/docs/x.md')).isFile()).toBe(true);
    });

    it('creating a folder beneath an existing local document is a path-free conflict', async () => {
      putLocal('docs/x.md', 'a document, not a folder');

      const err = await store()
        .createLocalFolder(scope, 'docs/x.md/sub')
        .catch((e: unknown) => e as ContextDocError);

      expect(err).toBeInstanceOf(ContextDocError);
      expect(err).toMatchObject({ code: 'conflict' });
      expectPathFree(err);
      expect(tree(ctxDir)).toEqual(['repo1/docs/x.md']);
    });
  });

  describe('a stored document that cannot be read (AC-5)', () => {
    /** Make `readFile` of the stored `rel` document fail like the OS would, naming the absolute path. */
    const failReadOf = (rel: string, code: string) => {
      const target = join(ctxDir, scope.repoId, rel);
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

    const settle = (p: Promise<unknown>) => p.then(() => undefined, (e: unknown) => e as ContextDocError);

    it.each([
      ['an update', 'v1'],
      ['a create', undefined],
    ])('%s onto a document that cannot be read is a path-free io_error and changes nothing', async (_label, base0) => {
      const v1 = await store().writeLocal(scope, { folder: 'docs', name: 'a.md', content: 'original' });
      failReadOf('docs/a.md', 'EACCES');

      const err = await settle(
        store().writeLocal(scope, {
          folder: 'docs',
          name: 'a.md',
          content: 'overwrite',
          baseVersion: base0 === undefined ? undefined : v1.version,
        }),
      );

      expect(err).toBeInstanceOf(ContextDocError);
      expect(err).toMatchObject({ code: 'io_error', message: 'document storage failed', path: 'docs/a.md' });
      expectPathFree(err as ContextDocError);
      // the stored document is as it was and no temporary file was left behind
      expect(tree(ctxDir)).toEqual(['repo1/docs/a.md']);
      expect(readFileSync(join(ctxDir, 'repo1/docs/a.md'), 'utf8')).toBe('original');
    });

    it.each(['EACCES', 'EPERM', 'ENOSPC', 'EIO', 'EROFS', 'EDQUOT', 'EMFILE', 'ENFILE'])(
      'a %s failure while reading the stored document is an io_error, not an unsafe path',
      async (code) => {
        putLocal('docs/a.md', 'original');
        failReadOf('docs/a.md', code);
        const err = await settle(store().writeLocal(scope, { folder: 'docs', name: 'a.md', content: 'x' }));
        expect(err).toMatchObject({ code: 'io_error', path: 'docs/a.md' });
        expectPathFree(err as ContextDocError);
      },
    );

    it.each([
      ['ELOOP', 'unsafe'],
      ['ENOENT', 'unsafe'],
      ['EINVAL', 'unsafe'],
      ['EEXIST', 'conflict'],
      ['ENOTDIR', 'conflict'],
    ])('a %s failure while reading the stored document is still %s (path-free)', async (code, expected) => {
      putLocal('docs/a.md', 'original');
      failReadOf('docs/a.md', code);
      const err = await settle(store().writeLocal(scope, { folder: 'docs', name: 'a.md', content: 'x' }));
      expect(err).toMatchObject({ code: expected, path: 'docs/a.md' });
      expectPathFree(err as ContextDocError);
      expect(readFileSync(join(ctxDir, 'repo1/docs/a.md'), 'utf8')).toBe('original');
    });
  });

  describe('creating a folder on a taken path (AC-84)', () => {
    it('a fresh folder is created; creating it a second time is a conflict naming the path', async () => {
      await expect(store().createLocalFolder(scope, 'docs/fresh')).resolves.toBe('docs/fresh');
      expect(statSync(join(ctxDir, 'repo1/docs/fresh')).isDirectory()).toBe(true);

      const err = await store()
        .createLocalFolder(scope, 'docs/fresh')
        .catch((e: unknown) => e as ContextDocError);
      expect(err).toBeInstanceOf(ContextDocError);
      expect(err).toMatchObject({ code: 'conflict', path: 'docs/fresh' });
      expectPathFree(err);
      // the folder is still there and still the only entry
      expect((await store().list(scope)).local_folders).toEqual(['docs/fresh']);
    });

    it('rejects an existing local folder that already holds documents', async () => {
      await store().writeLocal(scope, { folder: 'docs/full', name: 'a.md', content: 'x' });
      const err = await store()
        .createLocalFolder(scope, 'docs/full')
        .catch((e: unknown) => e as ContextDocError);
      expect(err).toMatchObject({ code: 'conflict', path: 'docs/full' });
      expect(tree(ctxDir)).toEqual(['repo1/docs/full/a.md']);
    });

    it('rejects a path equal to an existing local document, naming it', async () => {
      await store().writeLocal(scope, { folder: 'docs', name: 'a.md', content: 'x' });
      const err = await store()
        .createLocalFolder(scope, 'docs/a.md')
        .catch((e: unknown) => e as ContextDocError);
      expect(err).toMatchObject({ code: 'conflict', path: 'docs/a.md' });
      expect(readFileSync(join(ctxDir, 'repo1/docs/a.md'), 'utf8')).toBe('x');
    });

    it('rejects a path that is a repository folder, writing nothing locally', async () => {
      putRepo('docs/guides/intro.md', 'repo');
      const err = await store()
        .createLocalFolder(scope, 'docs/guides')
        .catch((e: unknown) => e as ContextDocError);
      expect(err).toMatchObject({ code: 'conflict', path: 'docs/guides' });
      expectPathFree(err);
      expect(existsSync(join(ctxDir, 'repo1/docs/guides'))).toBe(false);
      expect(tree(clone)).toEqual(['docs/guides/intro.md']);
    });

    it('rejects a path that is a repository document, writing nothing locally', async () => {
      putRepo('docs/repo.md', 'repo');
      const err = await store()
        .createLocalFolder(scope, 'docs/repo.md')
        .catch((e: unknown) => e as ContextDocError);
      expect(err).toMatchObject({ code: 'conflict', path: 'docs/repo.md' });
      expectPathFree(err);
      expect(existsSync(join(ctxDir, 'repo1/docs/repo.md'))).toBe(false);
      expect(readFileSync(join(clone, 'docs/repo.md'), 'utf8')).toBe('repo');
    });

    it('still creates a folder when the clone is absent (nothing to collide with)', async () => {
      rmSync(clone, { recursive: true, force: true });
      await expect(store().createLocalFolder(scope, 'docs/offline')).resolves.toBe('docs/offline');
    });
  });

  describe('stale saves (AC-85, EC-23)', () => {
    it('saves on top of the stored version, then rejects a second save based on the old one with the newer content', async () => {
      const v1 = await store().writeLocal(scope, { folder: 'docs', name: 'a.md', content: 'v1' });
      // tab A saves
      const v2 = await store().writeLocal(scope, { folder: 'docs', name: 'a.md', content: 'v2 from A', baseVersion: v1.version });
      expect(v2.version).not.toBe(v1.version);
      // tab B still holds v1
      const err = await store()
        .writeLocal(scope, { folder: 'docs', name: 'a.md', content: 'v2 from B', baseVersion: v1.version })
        .catch((e: unknown) => e as ContextDocError);
      expect(err).toMatchObject({
        code: 'stale',
        path: 'docs/a.md',
        currentContent: 'v2 from A',
        currentVersion: v2.version,
      });
      // nothing was overwritten
      expect(readFileSync(join(ctxDir, 'repo1/docs/a.md'), 'utf8')).toBe('v2 from A');
    });

    it('the same content has the same version, and a content change changes it', async () => {
      const a = await store().writeLocal(scope, { folder: 'docs', name: 'a.md', content: 'same' });
      const b = await store().writeLocal(scope, { folder: 'docs', name: 'b.md', content: 'same' });
      expect(a.version).toBe(b.version);
      expect((await store().read(scope, 'docs/a.md')).version).toBe(a.version);
      const c = await store().writeLocal(scope, { folder: 'docs', name: 'a.md', content: 'changed', baseVersion: a.version });
      expect(c.version).not.toBe(a.version);
    });

    it('updating a document that does not exist is not_found (nothing is created)', async () => {
      await expect(
        store().writeLocal(scope, { folder: 'docs', name: 'ghost.md', content: 'x', baseVersion: 'abc' }),
      ).rejects.toMatchObject({ code: 'not_found' });
      expect(tree(ctxDir)).toEqual([]);
    });

    it('leaves no temporary files behind after saves', async () => {
      const v1 = await store().writeLocal(scope, { folder: 'docs', name: 'a.md', content: 'v1' });
      await store().writeLocal(scope, { folder: 'docs', name: 'a.md', content: 'v2', baseVersion: v1.version });
      await store().writeLocal(scope, { folder: 'docs', name: 'a.md', content: 'v3', baseVersion: v1.version }).catch(() => undefined);
      expect(tree(ctxDir)).toEqual(['repo1/docs/a.md']);
    });
  });

  describe('folders and deletion (AC-69, AC-86)', () => {
    it('an empty folder is listed while empty and disappears from local_folders once it holds a document', async () => {
      await store().createLocalFolder(scope, 'docs/new');
      expect((await store().list(scope)).local_folders).toEqual(['docs/new']);

      await store().writeLocal(scope, { folder: 'docs/new', name: 'a.md', content: 'x' });
      const after = await store().list(scope);
      expect(after.local_folders).toEqual([]);
      expect(after.docs.map((d) => d.path)).toEqual(['docs/new/a.md']);
    });

    it('deletes a local document; the file is gone and unreadable', async () => {
      await store().writeLocal(scope, { folder: 'docs', name: 'a.md', content: 'x' });
      await store().deleteLocal(scope, 'docs/a.md');
      expect(tree(ctxDir)).toEqual([]);
      await expect(store().read(scope, 'docs/a.md')).rejects.toBeInstanceOf(ContextDocError);
      await expect(store().deleteLocal(scope, 'docs/a.md')).rejects.toMatchObject({ code: 'not_found' });
    });

    it('does not delete a repository document through the local API', async () => {
      putRepo('docs/repo.md', 'repo');
      await expect(store().deleteLocal(scope, 'docs/repo.md')).rejects.toBeInstanceOf(ContextDocError);
      expect(readFileSync(join(clone, 'docs/repo.md'), 'utf8')).toBe('repo');
    });

    it('deletes an empty folder but refuses a folder that still holds documents', async () => {
      await store().createLocalFolder(scope, 'docs/empty');
      await store().writeLocal(scope, { folder: 'docs/full', name: 'a.md', content: 'x' });

      await expect(store().deleteLocalFolder(scope, 'docs/full')).rejects.toMatchObject({ code: 'not_empty' });
      expect(tree(ctxDir)).toEqual(['repo1/docs/full/a.md']);

      await store().deleteLocalFolder(scope, 'docs/empty');
      expect(existsSync(join(ctxDir, 'repo1/docs/empty'))).toBe(false);
      await expect(store().deleteLocalFolder(scope, 'docs/empty')).rejects.toMatchObject({ code: 'not_found' });
    });

    it('rejects an unsafe delete path and leaves everything in place', async () => {
      await store().writeLocal(scope, { folder: 'docs', name: 'a.md', content: 'x' });
      for (const p of ['../outside/victim.md', '/etc/hosts.md', 'docs/../../outside/victim.md']) {
        await expect(store().deleteLocal(scope, p)).rejects.toBeInstanceOf(ContextDocError);
      }
      await expect(store().deleteLocalFolder(scope, '../outside')).rejects.toBeInstanceOf(ContextDocError);
      expect(readFileSync(join(outside, 'victim.md'), 'utf8')).toBe('ORIGINAL');
      expect(statSync(join(ctxDir, 'repo1/docs/a.md')).isFile()).toBe(true);
    });
  });

  describe('counting and repository removal (AC-87)', () => {
    it('counts only the repository\'s own local documents', async () => {
      expect(await store().countLocal('repo1')).toBe(0);
      await store().writeLocal(scope, { folder: 'docs', name: 'a.md', content: 'x' });
      await store().writeLocal(scope, { folder: 'specs/deep', name: 'b.md', content: 'x' });
      putRepo('docs/repo.md', 'repo');
      expect(await store().countLocal('repo1')).toBe(2);
      expect(await store().countLocal('other')).toBe(0);
    });

    it('removeRepoLocal deletes that repository\'s local documents only', async () => {
      const other: ContextDocScope = { repoId: 'repo2', repo: { owner: 'acme', name: 'web' } };
      putRepo('docs/repo.md', 'repo');
      await store().writeLocal(scope, { folder: 'docs', name: 'a.md', content: 'x' });
      await store().writeLocal(other, { folder: 'docs', name: 'a.md', content: 'y' });

      await store().removeRepoLocal('repo1');

      expect(tree(ctxDir)).toEqual(['repo2/docs/a.md']);
      expect(tree(clone)).toEqual(['docs/repo.md']);
      expect(await store().countLocal('repo1')).toBe(0);
      // removing again is harmless
      await expect(store().removeRepoLocal('repo1')).resolves.toBeUndefined();
    });

    it('removing a repository whose local root is a symlink never follows it', async () => {
      symlinkSync(outside, join(ctxDir, 'repo1'));
      await store().removeRepoLocal('repo1');
      expect(readFileSync(join(outside, 'victim.md'), 'utf8')).toBe('ORIGINAL');
    });
  });
});
