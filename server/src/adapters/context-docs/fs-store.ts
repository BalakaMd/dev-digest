import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readdir, readFile, rename, rm, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  CONTEXT_DOC_MAX_BYTES,
  type ContextDocContent,
  type ContextDocEntry,
  type ContextDocSource,
} from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import { compileGlobs, docTypeOf, searchRoots } from './glob.js';
import { ORIGINS_FILE, OriginStore } from './origin-store.js';
import { assertRegularFile, assertSafeFolder, assertSafeRelative, resolveInside } from './path-guard.js';
import {
  ContextDocError,
  type ContextDocListResult,
  type ContextDocScope,
  type ContextDocStore,
  type EffectiveContextDoc,
  type LocalDocWrite,
} from './types.js';

const MAX_DOCS = 1_000;
const READ_CONCURRENCY = 16;
const TOKEN_CACHE_MAX = 5_000;
const REPO_ID_RE = /^[A-Za-z0-9_-]+$/;

export interface FsContextDocStoreOptions {
  globs: string[];
  /** Local-document root; documents live in `<contextDir>/<repoId>/`. */
  contextDir: string;
  clonePathFor: (repo: { owner: string; name: string }) => string;
  /** Token counter (the server tokenizer). */
  countTokens: (text: string) => number;
}

interface Candidate {
  path: string;
  size: number;
}

const sha256 = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function decodeUtf8(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ContextDocError('not_utf8');
  }
}

/**
 * Run an fs call, turning any failure into a fixed, path-free ContextDocError
 * naming only the repo-relative `path` (raw fs messages carry absolute paths, AC-5).
 * EEXIST/ENOTDIR mean the path or an ancestor is occupied by a document: `conflict`.
 */
async function guardFs<T>(path: string | undefined, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ContextDocError) throw err;
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'EEXIST' || code === 'ENOTDIR') throw new ContextDocError('conflict', { path });
    if (code && IO_FAILURE_CODES.has(code)) throw new ContextDocError('io_error', { path });
    throw new ContextDocError('unsafe', { path });
  }
}

/** Genuine disk/permission failures (not path problems): reported as `io_error`, not `unsafe`. */
const IO_FAILURE_CODES = new Set(['EACCES', 'EPERM', 'ENOSPC', 'EIO', 'EROFS', 'EDQUOT', 'EMFILE', 'ENFILE']);

export class FsContextDocStore implements ContextDocStore {
  private readonly matches: (path: string) => boolean;
  private readonly roots: string[];
  private readonly tokenCache = new Map<string, number>();
  private readonly origins = new OriginStore((repoId) => this.localRoot(repoId));

  constructor(private readonly opts: FsContextDocStoreOptions) {
    this.matches = compileGlobs(opts.globs);
    this.roots = searchRoots(opts.globs);
  }

  matchesGlobs(path: string): boolean {
    return this.matches(path);
  }

  searchRoots(): string[] {
    return [...this.roots];
  }

  // ── roots ──────────────────────────────────────────────────────────────

  private localRoot(repoId: string): string {
    if (!REPO_ID_RE.test(repoId)) throw new ContextDocError('invalid_path');
    return join(this.opts.contextDir, repoId);
  }

  /** Working-copy root, or null when the repo is not cloned. */
  private async repoRoot(scope: ContextDocScope): Promise<string | null> {
    const root = this.opts.clonePathFor(scope.repo);
    try {
      return (await stat(root)).isDirectory() ? root : null;
    } catch {
      return null;
    }
  }

  // ── list ───────────────────────────────────────────────────────────────

  /** Regular, non-symlink files matching the globs, plus empty directories. */
  private async walk(root: string): Promise<{ files: Candidate[]; emptyDirs: string[] }> {
    const files: Candidate[] = [];
    const emptyDirs: string[] = [];
    const visit = async (rel: string): Promise<number> => {
      let entries;
      try {
        entries = await readdir(rel ? join(root, rel) : root, { withFileTypes: true });
      } catch {
        return 0;
      }
      let seen = 0;
      for (const e of entries) {
        if (e.isSymbolicLink()) continue;
        if (!rel && e.name === ORIGINS_FILE) continue; // origin sidecar is never a document
        const childRel = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) {
          if (e.name === '.git') continue;
          seen += 1;
          await visit(childRel);
        } else if (e.isFile()) {
          seen += 1;
          if (!this.matches(childRel)) continue;
          try {
            files.push({ path: childRel, size: (await lstat(join(root, childRel))).size });
          } catch {
            /* vanished between readdir and lstat */
          }
        }
      }
      if (seen === 0 && rel) emptyDirs.push(rel);
      return seen;
    };
    await visit('');
    return { files, emptyDirs };
  }

  private async tokensFor(root: string, c: Candidate): Promise<number | null> {
    if (c.size > CONTEXT_DOC_MAX_BYTES) return null;
    try {
      const bytes = await readFile(join(root, c.path));
      if (bytes.length > CONTEXT_DOC_MAX_BYTES) return null;
      const key = sha256(`${c.path}\0`) + sha256(bytes);
      const hit = this.tokenCache.get(key);
      if (hit !== undefined) return hit;
      const n = this.opts.countTokens(wrapUntrusted(c.path, decodeUtf8(bytes)));
      if (this.tokenCache.size >= TOKEN_CACHE_MAX) this.tokenCache.clear();
      this.tokenCache.set(key, n);
      return n;
    } catch {
      return null;
    }
  }

  /** sha256 of a file's bytes, streamed (any size); null when unreadable. */
  private async hashFile(abs: string): Promise<string | null> {
    return new Promise((resolve) => {
      const h = createHash('sha256');
      const stream = createReadStream(abs);
      stream.on('data', (chunk) => h.update(chunk));
      stream.on('error', () => resolve(null));
      stream.on('end', () => resolve(h.digest('hex')));
    });
  }

  /** Version of the repository text at `path` (= `ContextDocContent.version` of `source=repo`). */
  private async repoVersion(repoRoot: string, path: string): Promise<string | null> {
    try {
      const abs = await resolveInside(repoRoot, path);
      await assertRegularFile(abs, path);
      return await this.hashFile(abs);
    } catch {
      return null;
    }
  }

  /** Record the origin of an override that has none (best-effort, never throws). */
  private async ensureOrigin(repoId: string, repoRoot: string, path: string): Promise<void> {
    try {
      if ((await this.origins.get(repoId)).has(path)) return;
      const version = await this.repoVersion(repoRoot, path);
      if (!version) return;
      await this.origins.update(repoId, (m) => {
        if (m.has(path)) return false;
        m.set(path, version);
        return true;
      });
    } catch {
      /* best-effort */
    }
  }

  /**
   * Derive `repo_changed` for every override pair, record missing origins and
   * drop the origins of orphans. All origin I/O is best-effort: a failure
   * leaves the affected copy without a "Repository changed" mark.
   */
  private async deriveOverrideState(
    repoId: string,
    repoRoot: string,
    repoPaths: Set<string>,
    localPaths: string[],
  ): Promise<Set<string>> {
    const changed = new Set<string>();
    try {
      const origins = await this.origins.get(repoId);
      const pairs = localPaths.filter((p) => repoPaths.has(p));
      const fresh = new Map<string, string>();
      for (let i = 0; i < pairs.length; i += READ_CONCURRENCY) {
        await Promise.all(
          pairs.slice(i, i + READ_CONCURRENCY).map(async (path) => {
            const version = await this.repoVersion(repoRoot, path);
            if (!version) return;
            const origin = origins.get(path);
            if (origin === undefined) fresh.set(path, version);
            else if (origin !== version) changed.add(path);
          }),
        );
      }
      const orphans: string[] = [];
      for (const path of origins.keys()) {
        if (!repoPaths.has(path) && localPaths.includes(path) && !(await this.repoHas(repoRoot, path))) {
          orphans.push(path);
        }
      }
      if (fresh.size > 0 || orphans.length > 0) {
        await this.origins.update(repoId, (m) => {
          let dirty = false;
          for (const [path, version] of fresh) {
            if (!m.has(path)) {
              m.set(path, version);
              dirty = true;
            }
          }
          for (const path of orphans) dirty = m.delete(path) || dirty;
          return dirty;
        });
      }
    } catch {
      /* best-effort */
    }
    return changed;
  }

  async list(scope: ContextDocScope): Promise<ContextDocListResult> {
    const repoRoot = await this.repoRoot(scope);
    const localRoot = this.localRoot(scope.repoId);
    const repo = repoRoot ? (await this.walk(repoRoot)).files : [];
    const local = await this.walk(localRoot);

    // Marks come from the full (pre-truncation) path sets, on every call (AC-2).
    const repoPaths = new Set(repo.map((c) => c.path));
    const localPaths = new Set(local.files.map((c) => c.path));
    const changed = repoRoot
      ? await this.deriveOverrideState(scope.repoId, repoRoot, repoPaths, [...localPaths])
      : new Set<string>();

    const merged = [
      ...repo.map((c) => ({ ...c, source: 'repo' as const })),
      ...local.files.map((c) => ({ ...c, source: 'local' as const })),
    ].sort((a, b) => byCodeUnit(a.path, b.path) || (a.source === b.source ? 0 : a.source === 'repo' ? -1 : 1));

    const truncated = merged.length > MAX_DOCS;
    const kept = merged.slice(0, MAX_DOCS);

    const docs: ContextDocEntry[] = new Array(kept.length);
    for (let i = 0; i < kept.length; i += READ_CONCURRENCY) {
      await Promise.all(
        kept.slice(i, i + READ_CONCURRENCY).map(async (c, j) => {
          const tooLarge = c.size > CONTEXT_DOC_MAX_BYTES;
          const root = c.source === 'repo' ? repoRoot! : localRoot;
          const slash = c.path.lastIndexOf('/');
          const isRepo = c.source === 'repo';
          docs[i + j] = {
            path: c.path,
            source: c.source,
            type: docTypeOf(c.path),
            folder: slash === -1 ? '' : c.path.slice(0, slash),
            size_bytes: c.size,
            tokens: tooLarge ? null : await this.tokensFor(root, c),
            too_large: tooLarge,
            overrides_repo: !isRepo && repoPaths.has(c.path),
            overridden: isRepo && localPaths.has(c.path),
            repo_changed: !isRepo && changed.has(c.path),
          };
        }),
      );
    }

    return {
      state: repoRoot ? 'ok' : 'not_cloned',
      docs,
      local_folders: local.emptyDirs.filter((d) => this.matches(`${d}/x.md`)).sort(byCodeUnit),
      truncated,
    };
  }

  // ── read ───────────────────────────────────────────────────────────────

  private async readFrom(root: string, path: string, source: ContextDocSource): Promise<ContextDocContent> {
    const abs = await resolveInside(root, path);
    const size = await assertRegularFile(abs, path);
    if (size > CONTEXT_DOC_MAX_BYTES) throw new ContextDocError('too_large', { path });
    let bytes: Buffer;
    try {
      bytes = await readFile(abs);
    } catch {
      throw new ContextDocError('not_found', { path });
    }
    if (bytes.length > CONTEXT_DOC_MAX_BYTES) throw new ContextDocError('too_large', { path });
    const content = decodeUtf8(bytes);
    return { path, source, content, version: sha256(bytes), size_bytes: bytes.length };
  }

  async read(scope: ContextDocScope, path: string, source?: ContextDocSource): Promise<ContextDocContent> {
    if (source === undefined) {
      const { overrides_repo: _overrides, ...doc } = await this.readEffective(scope, path);
      return doc;
    }
    assertSafeRelative(path);
    if (!this.matches(path)) throw new ContextDocError('invalid_path');
    if (source === 'local') return this.readFrom(this.localRoot(scope.repoId), path, 'local');
    const repoRoot = await this.repoRoot(scope);
    if (!repoRoot) throw new ContextDocError('not_cloned');
    return this.readFrom(repoRoot, path, 'repo');
  }

  /**
   * Effective document: the local copy first; the repository only when the
   * local side is `not_found`. Any other local failure (too_large, not_utf8,
   * unsafe, io_error) propagates and never falls back to the repository (AC-18).
   */
  async readEffective(scope: ContextDocScope, path: string): Promise<EffectiveContextDoc> {
    assertSafeRelative(path);
    if (!this.matches(path)) throw new ContextDocError('invalid_path');
    const localRoot = this.localRoot(scope.repoId);
    const repoRoot = await this.repoRoot(scope);

    let local: ContextDocContent | null = null;
    try {
      local = await this.readFrom(localRoot, path, 'local');
    } catch (err) {
      if (!(err instanceof ContextDocError) || err.code !== 'not_found') throw err;
    }
    if (local) {
      const overrides = repoRoot !== null && (await this.repoHas(repoRoot, path));
      if (overrides) await this.ensureOrigin(scope.repoId, repoRoot!, path);
      return { ...local, overrides_repo: overrides };
    }
    if (!repoRoot) throw new ContextDocError('not_cloned');
    return { ...(await this.readFrom(repoRoot, path, 'repo')), overrides_repo: false };
  }

  async keepOrigin(scope: ContextDocScope, path: string): Promise<void> {
    assertSafeRelative(path);
    if (!this.matches(path)) throw new ContextDocError('invalid_path');
    const localRoot = this.localRoot(scope.repoId);
    await assertRegularFile(await resolveInside(localRoot, path), path); // not_found without a copy
    const repoRoot = await this.repoRoot(scope);
    if (!repoRoot) throw new ContextDocError('not_cloned');
    const version = await this.repoVersion(repoRoot, path);
    if (!version) throw new ContextDocError('not_found', { path });
    await this.origins.update(scope.repoId, (m) => {
      if (m.get(path) === version) return false;
      m.set(path, version);
      return true;
    });
  }

  // ── local writes ───────────────────────────────────────────────────────

  async writeLocal(scope: ContextDocScope, input: LocalDocWrite): Promise<ContextDocContent> {
    const { folder, name, content, baseVersion } = input;
    if (
      name.length === 0 ||
      /[\\/\0]/.test(name) ||
      name.includes('..') ||
      !name.endsWith('.md') ||
      (folder !== '' && (folder.startsWith('/') || folder.endsWith('/')))
    ) {
      throw new ContextDocError('invalid_path');
    }
    const path = folder ? `${folder}/${name}` : name;
    assertSafeRelative(path);
    if (!this.matches(path)) throw new ContextDocError('invalid_path', { path });
    const bytes = Buffer.from(content, 'utf8');
    // A lone surrogate does not survive the UTF-8 round trip.
    if (bytes.toString('utf8') !== content) throw new ContextDocError('not_utf8', { path });
    if (bytes.length > CONTEXT_DOC_MAX_BYTES) throw new ContextDocError('too_large', { path });

    const root = this.localRoot(scope.repoId);
    await guardFs(path, () => mkdir(root, { recursive: true }));
    const abs = await resolveInside(root, path);

    const existing = await this.readStored(root, path);
    let recordOrigin = false;
    if (baseVersion === undefined) {
      if (existing) throw new ContextDocError('conflict', { path });
      const repoRoot = await this.repoRoot(scope);
      if (repoRoot && (await this.repoHas(repoRoot, path))) {
        // Only an explicit override intent may take a repository path (AC-7).
        if (!input.override) throw new ContextDocError('conflict', { path });
        recordOrigin = true;
      }
      // Intent without a repository document (gone / no clone): a plain local doc, no origin.
    } else {
      if (!existing) throw new ContextDocError('not_found', { path });
      if (existing.version !== baseVersion) {
        throw new ContextDocError('stale', {
          path,
          currentContent: existing.content,
          currentVersion: existing.version,
        });
      }
    }

    await guardFs(path, () => mkdir(dirname(abs), { recursive: true }));
    await resolveInside(root, path); // re-check after creating directories
    let previousOrigin: string | undefined;
    if (recordOrigin) {
      const originVersion = input.override!.originVersion;
      await this.origins.update(scope.repoId, (m) => {
        previousOrigin = m.get(path);
        m.set(path, originVersion);
        return true;
      });
    }
    const tmp = join(dirname(abs), `.${name}.${process.pid}.${Date.now()}.tmp`);
    try {
      await writeFile(tmp, bytes, { flag: 'wx', mode: 0o600 });
      await rename(tmp, abs);
    } catch {
      await rm(tmp, { force: true }).catch(() => undefined);
      if (recordOrigin) {
        await this.origins
          .update(scope.repoId, (m) => {
            if (previousOrigin === undefined) return m.delete(path);
            m.set(path, previousOrigin);
            return true;
          })
          .catch(() => undefined);
      }
      throw new ContextDocError('unsafe', { path });
    }
    return { path, source: 'local', content, version: sha256(bytes), size_bytes: bytes.length };
  }

  /** Stored local doc (no size cap: a stale save must carry what is stored). */
  private async readStored(root: string, path: string): Promise<{ content: string; version: string } | null> {
    try {
      const abs = await resolveInside(root, path);
      await assertRegularFile(abs, path);
      const bytes = await guardFs(path, () => readFile(abs));
      return { content: decodeUtf8(bytes), version: sha256(bytes) };
    } catch (err) {
      if (err instanceof ContextDocError && err.code === 'not_found') return null;
      throw err;
    }
  }

  private async repoHas(repoRoot: string, path: string): Promise<boolean> {
    try {
      await assertRegularFile(await resolveInside(repoRoot, path), path);
      return true;
    } catch {
      return false;
    }
  }

  private async occupied(abs: string): Promise<boolean> {
    try {
      await lstat(abs);
      return true;
    } catch {
      return false;
    }
  }

  async createLocalFolder(scope: ContextDocScope, path: string): Promise<string> {
    assertSafeFolder(path);
    if (!this.matches(`${path}/x.md`)) throw new ContextDocError('invalid_path', { path });
    const root = this.localRoot(scope.repoId);
    await guardFs(path, () => mkdir(root, { recursive: true }));
    const abs = await resolveInside(root, path);
    // A taken path (document, folder, or anything in the repo clone) is a conflict.
    if (await this.occupied(abs)) throw new ContextDocError('conflict', { path });
    const repoRoot = await this.repoRoot(scope);
    if (repoRoot) {
      let repoAbs: string | null = null;
      try {
        repoAbs = await resolveInside(repoRoot, path);
      } catch {
        /* nothing resolvable there */
      }
      if (repoAbs && (await this.occupied(repoAbs))) throw new ContextDocError('conflict', { path });
    }
    await guardFs(path, () => mkdir(abs, { recursive: true }));
    await resolveInside(root, path);
    return path;
  }

  async deleteLocal(scope: ContextDocScope, path: string): Promise<void> {
    assertSafeRelative(path);
    const root = this.localRoot(scope.repoId);
    const abs = await resolveInside(root, path);
    await assertRegularFile(abs, path);
    try {
      await unlink(abs);
    } catch {
      throw new ContextDocError('not_found', { path });
    }
    // The copy is gone, so is its origin (best-effort; a leftover is dropped as an orphan).
    await this.origins.update(scope.repoId, (m) => m.delete(path)).catch(() => undefined);
  }

  async deleteLocalFolder(scope: ContextDocScope, path: string): Promise<void> {
    assertSafeFolder(path);
    const root = this.localRoot(scope.repoId);
    const abs = await resolveInside(root, path);
    let st;
    try {
      st = await lstat(abs);
    } catch {
      throw new ContextDocError('not_found', { path });
    }
    if (!st.isDirectory()) throw new ContextDocError('not_found', { path });
    if ((await guardFs(path, () => readdir(abs))).length > 0) throw new ContextDocError('not_empty', { path });
    await guardFs(path, () => rmdir(abs));
  }

  async countLocal(repoId: string): Promise<number> {
    return (await this.walk(this.localRoot(repoId))).files.length;
  }

  async removeRepoLocal(repoId: string): Promise<void> {
    const root = this.localRoot(repoId);
    try {
      // A symlinked root is unlinked, never followed.
      if ((await lstat(root)).isSymbolicLink()) await unlink(root);
      else await rm(root, { recursive: true, force: true });
    } catch {
      /* nothing to remove */
    }
  }
}
