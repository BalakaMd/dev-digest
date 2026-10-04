import type { ContextDocUsage } from '@devdigest/shared';
import { ContextDocError } from '../../adapters/context-docs/types.js';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../platform/errors.js';
import type { ContextAttachments } from '../agents/repository.js';
import { INVALID_BASE64_REASON } from './constants.js';

/**
 * Map a store error to the HTTP taxonomy. Messages are the store's fixed,
 * path-free strings plus the repo-relative path (AC-5); raw fs errors never
 * reach a response.
 */
export function toAppError(err: unknown): unknown {
  if (!(err instanceof ContextDocError)) return err;
  const named = err.path ? `${err.message}: ${err.path}` : err.message;
  switch (err.code) {
    case 'not_found':
      return new NotFoundError(err.message);
    case 'stale':
      return new ConflictError(err.message, {
        current_content: err.currentContent,
        current_version: err.currentVersion,
      });
    case 'not_cloned':
      return new ConflictError(err.message);
    case 'io_error':
      return new AppError('io_error', err.message, 500, { reason: err.code, path: err.path });
    default:
      // invalid_path · too_large · not_utf8 · conflict · unsafe · not_empty
      return new ValidationError(named, { reason: err.code, path: err.path });
  }
}

/** Run `fn`, translating store errors into AppErrors. */
export async function mapStoreErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toAppError(err);
  }
}

/** Reason string for a rejected upload file. */
export function rejectionReason(err: unknown): string {
  const mapped = toAppError(err);
  return mapped instanceof AppError ? mapped.message : 'could not be stored';
}

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

/** Decode an upload to UTF-8 text; throws when it is not base64 or not valid UTF-8. */
export function decodeUploadContent(b64: string): string {
  const compact = b64.replace(/\s+/g, '');
  if (compact.length % 4 !== 0 || !BASE64_RE.test(compact)) {
    throw new ValidationError(INVALID_BASE64_REASON);
  }
  const bytes = Buffer.from(compact, 'base64');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ContextDocError('not_utf8');
  }
}

/** Join a folder and a file name into a repo-relative path. */
export function joinDocPath(folder: string, name: string): string {
  const f = folder.replace(/^\/+|\/+$/g, '');
  return f ? `${f}/${name}` : name;
}

/**
 * Usage of one document across the workspace's agents and skills (AC-71/72):
 * an enabled agent "uses" it when it is attached directly or through a linked,
 * globally enabled skill. Pure — no LLM, no IO.
 */
export function computeUsage(att: ContextAttachments, path: string): ContextDocUsage {
  const enabled = att.agents.filter((a) => a.enabled);
  const used = enabled.filter(
    (a) => a.docs.includes(path) || a.skills.some((s) => s.enabled && s.docs.includes(path)),
  );
  return {
    attached_by_agents: att.agents
      .filter((a) => a.docs.includes(path))
      .map((a) => ({ id: a.id, name: a.name })),
    attached_by_skills: att.skills
      .filter((s) => s.docs.includes(path))
      .map((s) => ({ id: s.id, name: s.name })),
    used_by_agents: used.length,
    enabled_agents: enabled.length,
    coverage_pct: enabled.length === 0 ? null : Math.round((used.length / enabled.length) * 100),
  };
}
