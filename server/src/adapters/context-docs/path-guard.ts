import { lstat, realpath } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { isSafeContextDocPath } from '@devdigest/shared';
import { ContextDocError } from './types.js';

/** Same rules as the shared `ContextDocPath`. Throws `invalid_path`. */
export function assertSafeRelative(path: string): void {
  if (!isSafeContextDocPath(path)) throw new ContextDocError('invalid_path');
}

/** A folder path: relative, no `..`, NUL, backslash or empty segment. */
export function assertSafeFolder(path: string): void {
  const bad =
    path.length === 0 ||
    path.length > 512 ||
    path.includes('\0') ||
    path.includes('\\') ||
    path.startsWith('/') ||
    /^[A-Za-z]:/.test(path) ||
    path.split('/').some((s) => s === '' || s === '..' || s === '.');
  if (bad) throw new ContextDocError('invalid_path');
}

async function realpathOfNearestAncestor(p: string): Promise<string> {
  let cur = p;
  for (;;) {
    try {
      const real = await realpath(cur);
      return join(real, resolve(p).slice(resolve(cur).length));
    } catch {
      const up = dirname(cur);
      if (up === cur) throw new ContextDocError('unsafe');
      cur = up;
    }
  }
}

/**
 * Join `rel` under `root` and prove the result stays inside the root's real
 * path, with no symlink anywhere along the way. Returns an internal absolute
 * path (never expose it). Throws `unsafe`.
 */
export async function resolveInside(root: string, rel: string): Promise<string> {
  const resolved = resolve(root, rel);
  const rootResolved = resolve(root);
  if (!resolved.startsWith(rootResolved + sep)) throw new ContextDocError('unsafe', { path: rel });
  let realRoot: string;
  try {
    realRoot = await realpath(rootResolved);
  } catch {
    // A root that does not exist holds nothing: not found, not unsafe.
    throw new ContextDocError('not_found', { path: rel });
  }
  const real = await realpathOfNearestAncestor(resolved);
  // Equality with the lexical join also rejects an in-root symlinked directory.
  if (real !== join(realRoot, resolved.slice(rootResolved.length))) {
    throw new ContextDocError('unsafe', { path: rel });
  }
  return resolved;
}

/** `lstat` and demand a regular file (symlinks and directories are refused). */
export async function assertRegularFile(abs: string, rel: string): Promise<number> {
  let st;
  try {
    st = await lstat(abs);
  } catch {
    throw new ContextDocError('not_found', { path: rel });
  }
  if (st.isSymbolicLink()) throw new ContextDocError('unsafe', { path: rel });
  if (!st.isFile()) throw new ContextDocError('not_found', { path: rel });
  return st.size;
}
