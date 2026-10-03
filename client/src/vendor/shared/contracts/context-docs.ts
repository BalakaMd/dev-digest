import { z } from 'zod';

/**
 * Project context documents — manually attached markdown files (`specs`, `docs`,
 * `insights` folders) read from a repository's working copy or from DevDigest's
 * local-document overlay. Only repo-relative paths cross the API; never an
 * absolute filesystem path.
 */

export const CONTEXT_DOC_MAX_BYTES = 65_536;
export const CONTEXT_DOC_MAX_ATTACHMENTS = 20;
export const CONTEXT_DOC_TOKEN_BUDGET = 8_000;

export const ContextDocSource = z.enum(['repo', 'local']);
export type ContextDocSource = z.infer<typeof ContextDocSource>;

export const ContextDocType = z.enum(['specs', 'docs', 'insights']);
export type ContextDocType = z.infer<typeof ContextDocType>;

/** True when `p` is a safe repo-relative `*.md` path (no absolute, `..`, NUL, backslash). */
export function isSafeContextDocPath(p: string): boolean {
  if (p.length === 0 || p.length > 512) return false;
  if (p.includes('\0') || p.includes('\\')) return false;
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return false;
  if (!p.endsWith('.md')) return false;
  return !p.split('/').some((seg) => seg === '..' || seg === '');
}

export const ContextDocPath = z
  .string()
  .max(512, 'path is longer than 512 characters')
  .refine((p) => p.length > 0, 'path is empty')
  .refine((p) => !p.includes('\0'), 'path contains a NUL byte')
  .refine((p) => !p.includes('\\'), 'path contains a backslash')
  .refine((p) => !p.startsWith('/') && !/^[A-Za-z]:/.test(p), 'path must be repo-relative, not absolute')
  .refine((p) => !p.split('/').includes('..'), 'path contains a ".." segment')
  .refine((p) => p.endsWith('.md'), 'path must end in .md')
  .refine((p) => !p.split('/').includes(''), 'path contains an empty segment');
export type ContextDocPath = z.infer<typeof ContextDocPath>;

export const ContextDocPaths = z
  .array(ContextDocPath)
  .max(CONTEXT_DOC_MAX_ATTACHMENTS, `at most ${CONTEXT_DOC_MAX_ATTACHMENTS} documents can be attached`)
  .refine((a) => new Set(a).size === a.length, 'duplicate document path');
export type ContextDocPaths = z.infer<typeof ContextDocPaths>;

export const ContextDocEntry = z.object({
  path: z.string(),
  source: ContextDocSource,
  /** Nearest `specs|docs|insights` folder name; null when the globs match elsewhere. */
  type: ContextDocType.nullable(),
  folder: z.string(),
  size_bytes: z.number().int(),
  /** Tokens of the wrapped untrusted block; null when the document is too large. */
  tokens: z.number().int().nullable(),
  too_large: z.boolean(),
  /** A local document whose path is also held by a repository document. */
  shadowed: z.boolean(),
});
export type ContextDocEntry = z.infer<typeof ContextDocEntry>;

export const ContextDocLimits = z.object({
  max_doc_bytes: z.number().int(),
  max_attachments: z.number().int(),
  token_budget: z.number().int(),
});
export type ContextDocLimits = z.infer<typeof ContextDocLimits>;

export const ContextDocList = z.object({
  state: z.enum(['ok', 'not_cloned']),
  docs: z.array(ContextDocEntry),
  local_folders: z.array(z.string()),
  truncated: z.boolean(),
  search_globs: z.array(z.string()),
  limits: ContextDocLimits,
  scanned_at: z.string(),
});
export type ContextDocList = z.infer<typeof ContextDocList>;

export const ContextDocContent = z.object({
  path: z.string(),
  source: ContextDocSource,
  content: z.string(),
  /** sha256 hex of the stored bytes; used as `base_version` for local saves. */
  version: z.string(),
  size_bytes: z.number().int(),
});
export type ContextDocContent = z.infer<typeof ContextDocContent>;

export const ContextDocRef = z.object({ id: z.string(), name: z.string() });
export type ContextDocRef = z.infer<typeof ContextDocRef>;

export const ContextDocUsage = z.object({
  attached_by_agents: z.array(ContextDocRef),
  attached_by_skills: z.array(ContextDocRef),
  used_by_agents: z.number().int(),
  enabled_agents: z.number().int(),
  coverage_pct: z.number().int().nullable(),
});
export type ContextDocUsage = z.infer<typeof ContextDocUsage>;

/** Query string for reading one document. */
export const ContextDocPathQuery = z.object({
  path: ContextDocPath,
  source: ContextDocSource.optional(),
});
export type ContextDocPathQuery = z.infer<typeof ContextDocPathQuery>;

/** Create or update one local document. Omit `base_version` to create. */
export const LocalDocWriteBody = z.object({
  folder: z.string().max(512),
  name: z.string().min(1).max(255),
  content: z.string(),
  base_version: z.string().optional(),
});
export type LocalDocWriteBody = z.infer<typeof LocalDocWriteBody>;

export const LocalDocUploadBody = z.object({
  folder: z.string().max(512),
  files: z.array(z.object({ name: z.string().min(1).max(255), content_b64: z.string() })).min(1).max(50),
});
export type LocalDocUploadBody = z.infer<typeof LocalDocUploadBody>;

export const LocalDocUploadResult = z.object({
  stored: z.array(z.string()),
  rejected: z.array(z.object({ name: z.string(), reason: z.string() })),
});
export type LocalDocUploadResult = z.infer<typeof LocalDocUploadResult>;

export const LocalFolderBody = z.object({ path: z.string().min(1).max(512) });
export type LocalFolderBody = z.infer<typeof LocalFolderBody>;

/** Response of the synchronous working-copy sync. */
export const ContextDocSyncResult = z.object({ head: z.string() });
export type ContextDocSyncResult = z.infer<typeof ContextDocSyncResult>;

export const LocalDocCount = z.object({ count: z.number().int() });
export type LocalDocCount = z.infer<typeof LocalDocCount>;
