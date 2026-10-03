/**
 * context-docs adapter — port for reading project context documents (markdown
 * under `specs`/`docs`/`insights` folders) from a repository's working copy and
 * from DevDigest's local-document overlay (`<contextDir>/<repoId>/`).
 *
 * Document content is DATA only: it is never executed, no link in it is
 * fetched, no include or front-matter reference is resolved (AC-8). Nothing
 * returned or thrown here contains an absolute filesystem path (AC-5).
 */
import type { ContextDocContent, ContextDocEntry, ContextDocSource } from '@devdigest/shared';

export interface ContextDocScope {
  repoId: string;
  repo: { owner: string; name: string };
}

export type ContextDocErrorCode =
  | 'invalid_path'
  | 'too_large'
  | 'not_utf8'
  | 'conflict'
  | 'stale'
  | 'not_found'
  | 'unsafe'
  | 'not_empty'
  | 'not_cloned'
  | 'io_error';

/** Fixed, path-free messages: raw fs errors never reach callers. */
const MESSAGES: Record<ContextDocErrorCode, string> = {
  invalid_path: 'invalid document path',
  too_large: 'document is too large',
  not_utf8: 'document is not valid UTF-8',
  conflict: 'a document already exists at this path',
  stale: 'document changed since it was loaded',
  not_found: 'document not found',
  unsafe: 'path is unsafe',
  not_empty: 'folder is not empty',
  not_cloned: 'repository has no working copy',
  io_error: 'document storage failed',
};

export class ContextDocError extends Error {
  readonly code: ContextDocErrorCode;
  /** Repo-relative path the error is about (never absolute). */
  readonly path?: string;
  /** For `stale`: the stored content and version. */
  readonly currentContent?: string;
  readonly currentVersion?: string;

  constructor(
    code: ContextDocErrorCode,
    extra: { path?: string; currentContent?: string; currentVersion?: string } = {},
  ) {
    super(MESSAGES[code]);
    this.name = 'ContextDocError';
    this.code = code;
    this.path = extra.path;
    this.currentContent = extra.currentContent;
    this.currentVersion = extra.currentVersion;
  }
}

/** Why a document could not be read for a run (trace `skipped` reasons). */
export type ContextDocReadFailure =
  | 'not_found'
  | 'no_working_copy'
  | 'not_utf8'
  | 'too_large'
  | 'unsafe_path';

export function readFailureReason(err: unknown): ContextDocReadFailure {
  if (!(err instanceof ContextDocError)) return 'not_found';
  switch (err.code) {
    case 'not_cloned':
      return 'no_working_copy';
    case 'invalid_path':
    case 'unsafe':
      return 'unsafe_path';
    case 'not_utf8':
      return 'not_utf8';
    case 'too_large':
      return 'too_large';
    default:
      return 'not_found';
  }
}

export interface ContextDocListResult {
  state: 'ok' | 'not_cloned';
  docs: ContextDocEntry[];
  /** Empty local folders (shown in the left panel while empty). */
  local_folders: string[];
  truncated: boolean;
}

export interface LocalDocWrite {
  folder: string;
  name: string;
  content: string;
  /** Omit to create; give the version being edited to update. */
  baseVersion?: string;
}

export interface ContextDocStore {
  list(scope: ContextDocScope): Promise<ContextDocListResult>;
  /** `source` omitted = the effective document (repo first, else local). */
  read(scope: ContextDocScope, path: string, source?: ContextDocSource): Promise<ContextDocContent>;
  writeLocal(scope: ContextDocScope, input: LocalDocWrite): Promise<ContextDocContent>;
  createLocalFolder(scope: ContextDocScope, path: string): Promise<string>;
  deleteLocal(scope: ContextDocScope, path: string): Promise<void>;
  /** Empty folders only (`not_empty` otherwise). */
  deleteLocalFolder(scope: ContextDocScope, path: string): Promise<void>;
  countLocal(repoId: string): Promise<number>;
  removeRepoLocal(repoId: string): Promise<void>;
  matchesGlobs(path: string): boolean;
  searchRoots(): string[];
}
