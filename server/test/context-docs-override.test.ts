import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
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

/**
 * Override copies on temp dirs (SPEC-02 AC-10, 14, 18, 21, 22; NFR-1; EC-10, 15).
 * Hermetic — nothing outside the temp dirs is touched.
 */
describe('FsContextDocStore — override copies', () => {
  let base: string;
  let clone: string;
  let ctxDir: string;
  let outside: string;
  const scope: ContextDocScope = { repoId: 'repo1', repo: { owner: 'acme', name: 'api' } };
  const sha = (t: string) => createHash('sha256').update(t).digest('hex');

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
    mkdirSync(join(clone, rel, '..'), { recursive: true });
    writeFileSync(join(clone, rel), content);
  };
  const putLocal = (rel: string, content: string | Buffer) => {
    const abs = join(ctxDir, scope.repoId, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  };
  const origins = () =>
    (JSON.parse(readFileSync(join(ctxDir, 'repo1/.origins.json'), 'utf8')) as { origins: Record<string, string> }).origins;
  const store = () =>
    new FsContextDocStore({
      globs: DEFAULT_CONTEXT_GLOBS,
      contextDir: ctxDir,
      clonePathFor: () => clone,
      countTokens: (t) => t.length,
    });
  const overrideOf = (s: FsContextDocStore, text: string) =>
    s.writeLocal(scope, { folder: 'docs', name: 'rules.md', content: 'MY COPY', override: { originVersion: sha(text) } });

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'devdigest-ctx-override-'));
    clone = join(base, 'clone');
    ctxDir = join(base, 'ctx');
    outside = join(base, 'outside');
    for (const d of [clone, ctxDir, outside]) mkdirSync(d, { recursive: true });
    writeFileSync(join(outside, 'victim.md'), 'ORIGINAL');
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it('flags a repository edit as repo_changed, keeps the copy effective, and "keep my copy" clears the flag (AC-10, 21, 22; NFR-1)', async () => {
    putRepo('docs/rules.md', 'REPO V1');
    const s = store();
    await overrideOf(s, 'REPO V1');
    const flags = async () =>
      (await s.list(scope)).docs.filter((d) => d.source === 'local').map((d) => [d.overrides_repo, d.repo_changed]);
    expect(await flags()).toEqual([[true, false]]);

    putRepo('docs/rules.md', 'REPO V2'); // a sync changed the repository text
    const cloneAfterSync = tree(clone);
    expect(await flags()).toEqual([[true, true]]);
    expect(await s.read(scope, 'docs/rules.md')).toMatchObject({ source: 'local', content: 'MY COPY' });

    await s.keepOrigin(scope, 'docs/rules.md');
    expect(await flags()).toEqual([[true, false]]);
    expect(origins()).toEqual({ 'docs/rules.md': sha('REPO V2') });
    expect(await s.read(scope, 'docs/rules.md')).toMatchObject({ source: 'local', content: 'MY COPY' });
    expect(tree(clone)).toEqual(cloneAfterSync);
    expect(readFileSync(join(clone, 'docs/rules.md'), 'utf8')).toBe('REPO V2');
  });

  it('keepOrigin without a copy or without a clone fails with a path-free error and writes nothing', async () => {
    putRepo('docs/rules.md', 'REPO');
    const s = store();
    const settle = (p: Promise<unknown>) => p.then(() => undefined, (e: unknown) => e as ContextDocError);

    const noCopy = await settle(s.keepOrigin(scope, 'docs/rules.md'));
    expect(noCopy).toMatchObject({ code: 'not_found' });

    putLocal('docs/rules.md', 'COPY');
    rmSync(clone, { recursive: true, force: true });
    const noClone = await settle(s.keepOrigin(scope, 'docs/rules.md'));
    expect(noClone).toMatchObject({ code: 'not_cloned' });

    for (const err of [noCopy, noClone]) {
      const text = JSON.stringify({ m: err?.message, p: err?.path });
      expect(text).not.toContain(base);
      expect(text).not.toMatch(/(^|[\s:'"{,[])\/[^\s"']/);
    }
    expect(tree(ctxDir)).toEqual(['repo1/docs/rules.md']); // no sidecar created
  });

  describe('effective read of an unreadable copy (AC-18; EC-10)', () => {
    it('a copy that is not UTF-8, too large or a symlink never falls back to the repository text', async () => {
      putRepo('docs/utf.md', 'REPO');
      putRepo('docs/big.md', 'REPO');
      putRepo('docs/link.md', 'REPO');
      putLocal('docs/utf.md', Buffer.from([0xff, 0xfe, 0xfd]));
      putLocal('docs/big.md', 'a'.repeat(65_537));
      symlinkSync(join(outside, 'victim.md'), join(ctxDir, 'repo1', 'docs', 'link.md'));
      const s = store();

      await expect(s.read(scope, 'docs/utf.md')).rejects.toMatchObject({ code: 'not_utf8' });
      await expect(s.readEffective(scope, 'docs/big.md')).rejects.toMatchObject({ code: 'too_large' });
      await expect(s.readEffective(scope, 'docs/link.md')).rejects.toBeInstanceOf(ContextDocError);
      await expect(s.readEffective(scope, 'docs/link.md')).rejects.not.toMatchObject({ code: 'not_found' });
    });

    it('a missing copy falls back to the repository document, which is no override', async () => {
      putRepo('docs/rules.md', 'REPO');
      expect(await store().readEffective(scope, 'docs/rules.md')).toMatchObject({
        source: 'repo',
        content: 'REPO',
        overrides_repo: false,
      });
    });
  });

  describe('origin sidecar housekeeping (AC-14; EC-15; NFR-1)', () => {
    it('.origins.json is never listed or counted, and deleting the copy drops its origin', async () => {
      putRepo('docs/rules.md', 'REPO');
      const s = store();
      await overrideOf(s, 'REPO');
      expect(existsSync(join(ctxDir, 'repo1/.origins.json'))).toBe(true);

      expect((await s.list(scope)).docs.map((d) => d.path)).toEqual(['docs/rules.md', 'docs/rules.md']);
      expect(await s.countLocal('repo1')).toBe(1);

      await s.deleteLocal(scope, 'docs/rules.md'); // revert
      expect(origins()).toEqual({});
      expect(await s.read(scope, 'docs/rules.md')).toMatchObject({ source: 'repo', content: 'REPO' });
      expect(await s.countLocal('repo1')).toBe(0);
      expect(readFileSync(join(clone, 'docs/rules.md'), 'utf8')).toBe('REPO');
    });
  });
});
