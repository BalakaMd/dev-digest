import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readdirSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsContextDocStore, ContextDocError } from '../src/adapters/context-docs/index.js';
import type { ContextDocScope } from '../src/adapters/context-docs/index.js';
import { DEFAULT_CONTEXT_GLOBS } from '../src/adapters/context-docs/glob.js';

/**
 * Context-document reader on a real temp-dir working copy (SPEC-01: AC-1, 3, 5,
 * 6, 7, 8, 42, 79; EC-4, EC-18, EC-25; NFR-1). Hermetic: no DB, no network, and
 * nothing outside the temp dirs is touched.
 */
describe('FsContextDocStore — reader', () => {
  let base: string;
  let clone: string;
  let ctxDir: string;
  let outside: string;
  const scope: ContextDocScope = { repoId: 'repo1', repo: { owner: 'acme', name: 'api' } };

  const put = (root: string, rel: string, content: string | Buffer = '# doc\n') => {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  };

  function makeStore(opts: { globs?: string[]; cloned?: boolean } = {}) {
    return new FsContextDocStore({
      globs: opts.globs ?? DEFAULT_CONTEXT_GLOBS,
      contextDir: ctxDir,
      clonePathFor: () => (opts.cloned === false ? join(base, 'does-not-exist') : clone),
      countTokens: (text) => text.length,
    });
  }

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'devdigest-ctx-reader-'));
    clone = join(base, 'clone');
    ctxDir = join(base, 'ctx');
    outside = join(base, 'outside');
    mkdirSync(clone, { recursive: true });
    mkdirSync(ctxDir, { recursive: true });
    mkdirSync(outside, { recursive: true });
  });
  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('listing (AC-1, AC-79)', () => {
    it('lists regular .md files in specs/docs/insights at any depth, including under hidden folders', async () => {
      put(clone, '.devdigest/specs/a.md', '# a');
      put(clone, 'docs/b.md', '# b');
      put(clone, 'packages/x/insights/c.md', '# c');
      // not matched: wrong folder, wrong extension, top level
      put(clone, 'README.md');
      put(clone, 'src/notes.md');
      put(clone, 'docs/image.txt');
      put(clone, 'specsx/d.md');

      const res = await makeStore().list(scope);

      expect(res.state).toBe('ok');
      expect(res.docs.map((d) => d.path)).toEqual([
        '.devdigest/specs/a.md',
        'docs/b.md',
        'packages/x/insights/c.md',
      ]);
      expect(res.truncated).toBe(false);
    });

    it('returns path, source, type, folder, size and a token count for each file', async () => {
      put(clone, 'docs/arch/rules.md', 'x'.repeat(100));
      const [doc] = (await makeStore().list(scope)).docs;
      expect(doc).toMatchObject({
        path: 'docs/arch/rules.md',
        source: 'repo',
        type: 'docs',
        folder: 'docs/arch',
        size_bytes: 100,
        too_large: false,
        shadowed: false,
      });
      expect(Number.isInteger(doc!.tokens)).toBe(true);
      // counted by the injected tokenizer, over at least the document text
      expect(doc!.tokens!).toBeGreaterThanOrEqual(100);
    });

    it('a larger document costs more tokens than a smaller one', async () => {
      put(clone, 'docs/small.md', 'a');
      put(clone, 'docs/big.md', 'a'.repeat(2000));
      const docs = (await makeStore().list(scope)).docs;
      const tok = Object.fromEntries(docs.map((d) => [d.path, d.tokens!]));
      expect(tok['docs/big.md']).toBeGreaterThan(tok['docs/small.md']!);
    });

    it('type is the nearest matching folder: docs/specs/x.md is "specs" (EC-25)', async () => {
      put(clone, 'docs/specs/x.md');
      put(clone, 'specs/docs/y.md');
      put(clone, 'insights/z.md');
      const byPath = Object.fromEntries((await makeStore().list(scope)).docs.map((d) => [d.path, d.type]));
      expect(byPath).toEqual({
        'docs/specs/x.md': 'specs',
        'specs/docs/y.md': 'docs',
        'insights/z.md': 'insights',
      });
    });

    it('sorts by path in code-unit order and is deterministic', async () => {
      for (const p of ['docs/b.md', 'docs/B.md', 'docs/a.md', 'insights/a.md', 'docs/a/z.md']) put(clone, p);
      const paths = (await makeStore().list(scope)).docs.map((d) => d.path);
      expect(paths).toEqual([...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
      expect(paths).toEqual((await makeStore().list(scope)).docs.map((d) => d.path));
    });
  });

  describe('missing documents (AC-33, AC-45)', () => {
    it('a document that exists nowhere is not_found, also when the repository has no local documents yet', async () => {
      put(clone, 'docs/present.md', 'x');
      // No `<contextDir>/<repoId>` folder exists: nothing was ever created locally.
      const store = makeStore();
      for (const source of [undefined, 'repo', 'local'] as const) {
        await expect(store.read(scope, 'docs/missing.md', source), `source=${source}`).rejects.toMatchObject({
          code: 'not_found',
        });
      }
      // a missing folder is just a missing document, not an unsafe path
      await expect(store.read(scope, 'specs/none/at-all.md')).rejects.toMatchObject({ code: 'not_found' });
    });

    it('a missing document is not_found when the local folder exists but holds other documents', async () => {
      const store = makeStore();
      await store.writeLocal(scope, { folder: 'docs', name: 'other.md', content: 'x' });
      await expect(store.read(scope, 'docs/missing.md')).rejects.toMatchObject({ code: 'not_found' });
    });
  });

  describe('not cloned (AC-7)', () => {
    it('reports not_cloned, distinct from a cloned repository with no documents', async () => {
      const notCloned = await makeStore({ cloned: false }).list(scope);
      expect(notCloned.state).toBe('not_cloned');
      expect(notCloned.docs).toEqual([]);

      const empty = await makeStore().list(scope);
      expect(empty.state).toBe('ok');
      expect(empty.docs).toEqual([]);
    });

    it('reading a repository document of a repo with no working copy fails as not_cloned', async () => {
      await expect(makeStore({ cloned: false }).read(scope, 'docs/a.md', 'repo')).rejects.toMatchObject({
        code: 'not_cloned',
      });
    });
  });

  describe('symbolic links and escapes (AC-3, EC-4, NFR-1)', () => {
    it('leaves out a symlink to a file outside the working copy and refuses to read it', async () => {
      writeFileSync(join(outside, 'secret.md'), 'TOP SECRET');
      mkdirSync(join(clone, 'docs'), { recursive: true });
      symlinkSync(join(outside, 'secret.md'), join(clone, 'docs', 'link.md'));
      put(clone, 'docs/ok.md', 'fine');

      const store = makeStore();
      const res = await store.list(scope);
      expect(res.docs.map((d) => d.path)).toEqual(['docs/ok.md']);

      await expect(store.read(scope, 'docs/link.md')).rejects.toBeInstanceOf(ContextDocError);
      await expect(store.read(scope, 'docs/link.md', 'repo')).rejects.toBeInstanceOf(ContextDocError);
    });

    it('also leaves out a symlink that points INSIDE the working copy (any symlink is refused)', async () => {
      put(clone, 'docs/real.md', 'real');
      symlinkSync(join(clone, 'docs', 'real.md'), join(clone, 'docs', 'alias.md'));

      const store = makeStore();
      expect((await store.list(scope)).docs.map((d) => d.path)).toEqual(['docs/real.md']);
      await expect(store.read(scope, 'docs/alias.md')).rejects.toBeInstanceOf(ContextDocError);
    });

    it('does not descend into a symlinked directory and refuses to read through it', async () => {
      writeFileSync(join(outside, 'leak.md'), 'LEAKED');
      mkdirSync(join(clone, 'docs'), { recursive: true });
      symlinkSync(outside, join(clone, 'docs', 'linked'));

      const store = makeStore();
      expect((await store.list(scope)).docs).toEqual([]);
      await expect(store.read(scope, 'docs/linked/leak.md')).rejects.toBeInstanceOf(ContextDocError);
    });

    it('a matching top-level folder that is itself a symlink to elsewhere yields nothing', async () => {
      mkdirSync(join(outside, 'inner'), { recursive: true });
      writeFileSync(join(outside, 'inner', 'a.md'), 'LEAKED');
      symlinkSync(outside, join(clone, 'specs'));

      const store = makeStore();
      expect((await store.list(scope)).docs).toEqual([]);
      await expect(store.read(scope, 'specs/inner/a.md')).rejects.toBeInstanceOf(ContextDocError);
    });

    it('never returns the content of a document reached through a symlink', async () => {
      writeFileSync(join(outside, 'secret.md'), 'TOP SECRET');
      mkdirSync(join(clone, 'docs'), { recursive: true });
      symlinkSync(join(outside, 'secret.md'), join(clone, 'docs', 'link.md'));
      const result = await makeStore()
        .read(scope, 'docs/link.md')
        .then((r) => JSON.stringify(r))
        .catch((e: unknown) => String(e));
      expect(result).not.toContain('TOP SECRET');
    });
  });

  describe('size and encoding (AC-6)', () => {
    it('flags a document over 65,536 bytes as too_large, with no token count, and refuses to return its content', async () => {
      put(clone, 'docs/big.md', 'a'.repeat(65_537));
      put(clone, 'docs/edge.md', 'a'.repeat(65_536));
      const store = makeStore();

      const byPath = Object.fromEntries((await store.list(scope)).docs.map((d) => [d.path, d]));
      expect(byPath['docs/big.md']).toMatchObject({ too_large: true, tokens: null, size_bytes: 65_537 });
      expect(byPath['docs/edge.md']).toMatchObject({ too_large: false, size_bytes: 65_536 });

      await expect(store.read(scope, 'docs/big.md')).rejects.toMatchObject({ code: 'too_large' });
      const edge = await store.read(scope, 'docs/edge.md');
      expect(edge.content).toHaveLength(65_536);
    });

    it('measures the limit in bytes, not characters', async () => {
      // 40,000 two-byte characters = 80,000 bytes but only 40,000 characters.
      put(clone, 'docs/multibyte.md', 'é'.repeat(40_000));
      const store = makeStore();
      const [doc] = (await store.list(scope)).docs;
      expect(doc).toMatchObject({ too_large: true, size_bytes: 80_000 });
      await expect(store.read(scope, 'docs/multibyte.md')).rejects.toMatchObject({ code: 'too_large' });
    });

    it('refuses to read a file that is not valid UTF-8 despite its .md extension', async () => {
      put(clone, 'docs/binary.md', Buffer.from([0xff, 0xfe, 0x00, 0xc3, 0x28, 0x80]));
      const store = makeStore();
      await expect(store.read(scope, 'docs/binary.md')).rejects.toMatchObject({ code: 'not_utf8' });
      // listing must not blow up on it
      await expect(store.list(scope)).resolves.toMatchObject({ state: 'ok' });
    });

    it('reads a valid multi-byte UTF-8 document and returns its version and byte size', async () => {
      put(clone, 'docs/unicode.md', '# Привіт 👋\n');
      const doc = await makeStore().read(scope, 'docs/unicode.md');
      expect(doc.content).toBe('# Привіт 👋\n');
      expect(doc.source).toBe('repo');
      expect(doc.size_bytes).toBe(Buffer.byteLength('# Привіт 👋\n'));
      expect(doc.version).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('truncation (AC-42, EC-18)', () => {
    it('returns the first 1,000 documents sorted by path and flags truncation', async () => {
      mkdirSync(join(clone, 'docs'), { recursive: true });
      for (let i = 0; i < 1001; i++) {
        writeFileSync(join(clone, 'docs', `f${String(i).padStart(4, '0')}.md`), 'x');
      }
      const res = await makeStore().list(scope);
      expect(res.truncated).toBe(true);
      expect(res.docs).toHaveLength(1000);
      expect(res.docs[0]!.path).toBe('docs/f0000.md');
      expect(res.docs[999]!.path).toBe('docs/f0999.md');
      expect(res.docs.map((d) => d.path)).not.toContain('docs/f1000.md');
    });

    it('does not flag truncation at exactly 1,000 documents', async () => {
      mkdirSync(join(clone, 'docs'), { recursive: true });
      for (let i = 0; i < 1000; i++) {
        writeFileSync(join(clone, 'docs', `f${String(i).padStart(4, '0')}.md`), 'x');
      }
      const res = await makeStore().list(scope);
      expect(res.truncated).toBe(false);
      expect(res.docs).toHaveLength(1000);
    });
  });

  describe('content is data only (AC-8, NFR-1)', () => {
    it('returns links, includes and front-matter references verbatim without fetching or resolving them', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network is off'));
      put(clone, 'docs/other.md', 'OTHER DOCUMENT BODY');
      const text = [
        '---',
        'include: ./other.md',
        'extends: ../../outside/secret.md',
        '---',
        '![tracker](http://127.0.0.1:9/pixel.png)',
        '[link](https://example.com/x)',
        '!include other.md',
        '<script>alert(1)</script>',
      ].join('\n');
      put(clone, 'docs/main.md', text);

      const store = makeStore();
      const doc = await store.read(scope, 'docs/main.md');
      await store.list(scope);

      expect(doc.content).toBe(text);
      expect(doc.content).not.toContain('OTHER DOCUMENT BODY');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('the adapter sources import no network module and call no fetch', () => {
      const dir = join(__dirname, '..', 'src', 'adapters', 'context-docs');
      const offenders: string[] = [];
      for (const f of readdirSync(dir)) {
        const src = readFileSync(join(dir, f), 'utf8');
        if (/from\s+['"](?:node:)?(?:https?|net|tls|dgram|undici)['"]|\bfetch\s*\(|\bXMLHttpRequest\b|child_process/.test(src)) {
          offenders.push(f);
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  describe('no absolute filesystem path leaves the store (AC-5, EC-6)', () => {
    it('list output and every error carry only repo-relative paths', async () => {
      put(clone, 'docs/ok.md', 'ok');
      put(clone, 'docs/big.md', 'a'.repeat(70_000));
      put(clone, 'docs/binary.md', Buffer.from([0xff, 0xfe, 0xfd]));
      writeFileSync(join(outside, 'secret.md'), 'x');
      symlinkSync(join(outside, 'secret.md'), join(clone, 'docs', 'link.md'));

      const store = makeStore();
      const real = (p: string) => realpathSync(p);
      const forbidden = [base, clone, ctxDir, outside, real(base), real(clone), real(ctxDir)];

      const seen: string[] = [JSON.stringify(await store.list(scope))];
      for (const path of ['docs/big.md', 'docs/binary.md', 'docs/link.md', 'docs/missing.md']) {
        try {
          await store.read(scope, path);
          seen.push('<resolved>');
        } catch (err) {
          const e = err as ContextDocError;
          seen.push(JSON.stringify({ message: e.message, path: e.path, name: e.name }));
        }
      }
      // a not-cloned repository too
      try {
        await makeStore({ cloned: false }).read(scope, 'docs/a.md', 'repo');
      } catch (err) {
        seen.push(JSON.stringify({ message: (err as Error).message, path: (err as ContextDocError).path }));
      }

      const joined = seen.join('\n');
      for (const f of forbidden) expect(joined).not.toContain(f);
      expect(joined).not.toContain(tmpdir());
    });
  });
});
