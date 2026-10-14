import { strToU8, zipSync } from 'fflate';
import { isSafeRepoPath } from './helpers.js';

export interface ZipFile {
  path: string;
  contents: string | Uint8Array;
}

/** Fixed timestamp so the same files always produce the same zip. */
const ZIP_MTIME = new Date('2000-01-01T00:00:00Z');

/**
 * Build the "Copy files as a zip" archive: exactly the given files at their
 * repository paths (AC-37). Throws on an unsafe or duplicate path.
 */
export function buildInstallZip(files: readonly ZipFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) {
    if (!isSafeRepoPath(f.path)) throw new Error(`Unsafe path in install zip: ${f.path}`);
    if (f.path in entries) throw new Error(`Duplicate path in install zip: ${f.path}`);
    entries[f.path] = typeof f.contents === 'string' ? strToU8(f.contents) : f.contents;
  }
  return zipSync(entries, { mtime: ZIP_MTIME });
}
