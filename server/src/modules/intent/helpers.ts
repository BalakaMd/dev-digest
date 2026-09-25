import type { IntentConfidence } from '@devdigest/shared';
import { wrapUntrusted } from '../../platform/prompt.js';
import type { IntentLog, ResolvedSource } from './types.js';
import {
  DOC_EXTENSIONS,
  MAX_DOCS,
  MAX_HUNK_HEADERS_PER_FILE,
  MAX_ISSUES,
  MAX_ITEM_CHARS,
  MAX_ITEMS,
  MIN_DESCRIPTION_CHARS,
  PLAN_SPEC_DIRS,
  PLAN_SPEC_NAME_KEYWORDS,
  TICKET_HOSTS,
} from './constants.js';

/**
 * Pure helpers for the intent classifier: link parsing, path safety, prompt
 * assembly and result clamping. No I/O — everything here is unit-tested
 * directly (`test/intent-helpers.test.ts`).
 */

// ------------------------------------------------------------ D3: hunk headers

/**
 * Hunk header lines of a patch (`^@@ -a,b +c,d @@ <context>`), the context
 * text after the second `@@` only — never a `+`/`-`/space diff body line, and
 * never the raw line numbers unless the header carries no context. `null`
 * patch (binary / too large) → `[]`.
 */
export function extractHunkHeaders(patch: string | null | undefined): string[] {
  if (!patch) return [];
  const headers: string[] = [];
  for (const line of patch.split('\n')) {
    const m = line.match(/^@@ .*? @@(.*)$/);
    if (!m) continue;
    const context = m[1]!.trim();
    headers.push(context.length > 0 ? context : line.trim());
  }
  return headers.slice(0, MAX_HUNK_HEADERS_PER_FILE);
}

// ------------------------------------------------------------ path safety

/**
 * Canonical repo-relative form of a path an untrusted source (PR body, another
 * file) named, or `null` when it is unsafe to read: absolute, `..`-escaping,
 * backslash-separated, containing NUL, or not a doc-like extension.
 */
export function normalizeRepoPath(path: string): string | null {
  if (!path) return null;
  let p = path.trim();
  if (p.includes('\0')) return null;
  if (p.startsWith('./')) p = p.slice(2);
  if (p.length === 0) return null;
  if (p.startsWith('/') || p.startsWith('\\')) return null;
  if (/^[a-zA-Z]:/.test(p)) return null; // Windows drive letter
  if (p.includes('\\')) return null;
  if (p.split('/').includes('..')) return null;
  const lower = p.toLowerCase();
  if (!DOC_EXTENSIONS.some((ext) => lower.endsWith(ext))) return null;
  return p;
}

/** D6: changed-file paths that are themselves a plan/spec doc. */
export function planSpecFromChangedFiles(paths: string[]): string[] {
  const dirRe = new RegExp(`(^|/)(${PLAN_SPEC_DIRS.join('|')})/`, 'i');
  const nameRe = new RegExp(`(^|/)[^/]*(${PLAN_SPEC_NAME_KEYWORDS.join('|')})[^/]*\\.md$`, 'i');
  return paths.filter((p) => p.toLowerCase().endsWith('.md') && (dirRe.test(p) || nameRe.test(p)));
}

/** `plan` for a plans/ADR-style path, `spec` otherwise — a light heuristic. */
export function docLabel(path: string): 'plan' | 'spec' {
  return /spec/i.test(path) ? 'spec' : 'plan';
}

function isTicketHost(host: string): boolean {
  return TICKET_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

// ------------------------------------------------------------ D4/D5/D7: link parsing

export interface IssueRef {
  owner: string;
  name: string;
  number: number;
}
export interface DocRef {
  path: string;
}
export interface UnsupportedRef {
  ref: string;
}
export interface ParsedLinks {
  issues: IssueRef[];
  docs: DocRef[];
  unsupported: UnsupportedRef[];
  /** Other URLs (library docs, badges, images) — never fetched, only counted. */
  ignoredCount: number;
}

const ISSUE_URL_RE = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)/i;
const BLOB_URL_RE = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/[^/]+\/(.+)$/i;
const GENERIC_URL_RE = /https?:\/\/[^\s)<>\]]+/gi;
const MD_LINK_RE = /(?<!!)\[[^\]]*\]\(([^)\s]+)\)/g;
const HASH_ISSUE_RE = /(?:([\w.-]+)\/([\w.-]+))?#(\d{1,10})\b/g;
const BARE_DOC_RE = /(?:^|[\s(])([\w.-]*[\w-]+(?:\/[\w.-]+)*\.(?:md|mdx|txt))\b/gi;

/**
 * D4 (issues) + D5 (linked docs) + D7 (unsupported references), parsed from
 * the PR description. `repo` is used to resolve bare `#N` / same-repo blob
 * URLs; cross-repo `owner/repo#N` and issue URLs are followed as given.
 */
export function parseIntentLinks(
  body: string | null | undefined,
  repo: { owner: string; name: string },
): ParsedLinks {
  const text = body ?? '';

  const issues: IssueRef[] = [];
  const seenIssues = new Set<string>();
  const addIssue = (owner: string, name: string, number: number) => {
    const key = `${owner}/${name}#${number}`.toLowerCase();
    if (seenIssues.has(key) || !Number.isFinite(number)) return;
    seenIssues.add(key);
    if (issues.length < MAX_ISSUES) issues.push({ owner, name, number });
  };

  const docs: DocRef[] = [];
  const seenDocs = new Set<string>();
  const addDoc = (rawPath: string) => {
    const norm = normalizeRepoPath(rawPath);
    if (!norm || seenDocs.has(norm)) return;
    seenDocs.add(norm);
    if (docs.length < MAX_DOCS) docs.push({ path: norm });
  };

  const unsupported: UnsupportedRef[] = [];
  const seenUnsupported = new Set<string>();
  const addUnsupported = (ref: string) => {
    if (seenUnsupported.has(ref)) return;
    seenUnsupported.add(ref);
    unsupported.push({ ref });
  };

  let ignoredCount = 0;

  // ---- URLs: issue / same-repo blob (doc) / other-repo blob (unsupported) /
  // tracker host (unsupported) / everything else (ignored, counted only).
  let textWithUrlsBlanked = text;
  for (const m of text.matchAll(GENERIC_URL_RE)) {
    const url = m[0].replace(/[).,;:'"]+$/, '');
    textWithUrlsBlanked = textWithUrlsBlanked.replace(m[0], ' ');

    const issueMatch = url.match(ISSUE_URL_RE);
    if (issueMatch) {
      addIssue(issueMatch[1]!, issueMatch[2]!, Number(issueMatch[3]));
      continue;
    }
    const blobMatch = url.match(BLOB_URL_RE);
    if (blobMatch) {
      const [, owner, name, path] = blobMatch;
      if (owner!.toLowerCase() === repo.owner.toLowerCase() && name!.toLowerCase() === repo.name.toLowerCase()) {
        addDoc(decodeURIComponent(path!));
      } else {
        addUnsupported(sanitizeRef(url));
      }
      continue;
    }
    let host: string | undefined;
    try {
      host = new URL(url).host.toLowerCase();
    } catch {
      ignoredCount++;
      continue;
    }
    if (isTicketHost(host)) {
      addUnsupported(sanitizeRef(url));
    } else {
      ignoredCount++;
    }
  }

  // ---- Markdown links to a relative doc path (image links `![...]` excluded).
  for (const m of text.matchAll(MD_LINK_RE)) {
    const target = m[1]!;
    if (/^https?:\/\//i.test(target)) continue; // handled above
    if (DOC_EXTENSIONS.some((ext) => target.toLowerCase().endsWith(ext))) addDoc(target);
  }

  // ---- Bare doc tokens + `#N` / `owner/repo#N`, scanned with URLs blanked
  // out so a URL's own path/fragment never false-matches here.
  for (const m of textWithUrlsBlanked.matchAll(BARE_DOC_RE)) addDoc(m[1]!);
  for (const m of textWithUrlsBlanked.matchAll(HASH_ISSUE_RE)) {
    addIssue(m[1] ?? repo.owner, m[2] ?? repo.name, Number(m[3]));
  }

  return { issues, docs, unsupported, ignoredCount };
}

/** Sanitized reference for logs/contract: host + path, query and fragment stripped. */
export function sanitizeRef(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`.replace(/\/+$/, '') || u.host;
  } catch {
    return url;
  }
}

// ------------------------------------------------------------ byte-safe truncation

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/** Cut `text` to at most `maxBytes` UTF-8 bytes without splitting a codepoint. */
export function truncateUtf8(
  text: string,
  maxBytes: number,
): { text: string; truncated: boolean; bytes: number } {
  const full = new TextEncoder().encode(text);
  if (full.byteLength <= maxBytes) return { text, truncated: false, bytes: full.byteLength };
  let end = Math.max(0, maxBytes);
  // Back off while `end` lands mid-codepoint (a UTF-8 continuation byte, 10xxxxxx).
  while (end > 0 && (full[end]! & 0b1100_0000) === 0b1000_0000) end--;
  const slice = full.slice(0, end);
  return { text: new TextDecoder('utf-8').decode(slice), truncated: true, bytes: slice.byteLength };
}

// ------------------------------------------------------------ confidence (section 1)

export function computeConfidence(input: {
  descriptionChars: number;
  sources: Pick<ResolvedSource, 'kind' | 'status'>[];
}): IntentConfidence {
  const nonTrivialDescription = input.descriptionChars >= MIN_DESCRIPTION_CHARS;
  const fetchedDocOrIssue = input.sources.filter(
    (s) =>
      (s.kind === 'issue' || s.kind === 'plan' || s.kind === 'spec') &&
      (s.status === 'used' || s.status === 'truncated'),
  ).length;
  const anyFailedReference = input.sources.some(
    (s) => s.status === 'unreachable' || s.status === 'unsupported',
  );

  if (anyFailedReference) return 'low';
  if (nonTrivialDescription && fetchedDocOrIssue >= 1) return 'high';
  if (nonTrivialDescription && fetchedDocOrIssue === 0) return 'medium';
  if (!nonTrivialDescription && fetchedDocOrIssue >= 1) return 'medium';
  return 'low';
}

// ------------------------------------------------------------ 5.1: classifier user message

export interface ClassifierMessageInput {
  repo: { owner: string; name: string };
  prNumber: number;
  title: string;
  description: string;
  files: { path: string; headers: string[] }[];
  issues: { ref: string; content: string }[];
  docs: { ref: string; label: 'plan' | 'spec'; content: string }[];
  unavailable: { ref: string; status: string }[];
}

/** Renders the block text of the "files" source (also used for its byte count). */
export function renderFilesBlock(files: { path: string; headers: string[] }[]): string {
  return files.map((f) => [f.path, ...f.headers.map((h) => `  ${h}`)].join('\n')).join('\n\n');
}

export function buildClassifierMessage(input: ClassifierMessageInput): string {
  const fetchedCount = input.issues.length + input.docs.length;
  const failedCount = input.unavailable.length;
  const lines: string[] = [
    `Repository: ${input.repo.owner}/${input.repo.name}`,
    `PR #${input.prNumber}`,
    `Confidence basis: ${fetchedCount} fetched source(s), ${failedCount} failed reference(s)`,
  ];
  if (input.title.trim().length > 0) {
    lines.push('', wrapUntrusted('pr-title', input.title));
  }
  if (input.description.trim().length > 0) {
    lines.push('', wrapUntrusted('pr-description', input.description));
  }
  for (const issue of input.issues) {
    lines.push('', wrapUntrusted(`issue:${issue.ref}`, issue.content));
  }
  for (const doc of input.docs) {
    lines.push('', wrapUntrusted(`${doc.label}:${doc.ref}`, doc.content));
  }
  if (input.files.length > 0) {
    lines.push('', wrapUntrusted('files', renderFilesBlock(input.files)));
  }
  if (input.unavailable.length > 0) {
    lines.push(
      '',
      `Unavailable context: ${input.unavailable.map((u) => `${u.ref} (${u.status})`).join(', ')}`,
    );
  }
  return lines.join('\n');
}

// ------------------------------------------------------------ result clamping

export interface RawIntentClassification {
  summary: string;
  in_scope: string[];
  out_of_scope: string[];
}
export interface ClampedIntent {
  summary: string;
  in_scope: string[];
  out_of_scope: string[];
}

/** Enforce `MAX_ITEMS` / `MAX_ITEM_CHARS` in code (a strict schema can't carry bounds). */
export function clampIntent(raw: RawIntentClassification): ClampedIntent {
  const clampItem = (s: string) => s.trim().slice(0, MAX_ITEM_CHARS);
  return {
    summary: raw.summary.trim(),
    in_scope: raw.in_scope.slice(0, MAX_ITEMS).map(clampItem).filter((s) => s.length > 0),
    out_of_scope: raw.out_of_scope.slice(0, MAX_ITEMS).map(clampItem).filter((s) => s.length > 0),
  };
}

// ------------------------------------------------------------ staleness / logging

/** `true` when the stored intent's head SHA is unknown or no longer the PR's head. */
export function isStale(intentHeadSha: string | null, currentHeadSha: string): boolean {
  return intentHeadSha == null || intentHeadSha !== currentHeadSha;
}

/** Pino-compatible logger (obj-first) → `IntentLog` (msg-first), for the HTTP path. */
export function fromPino(logger: {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}): IntentLog {
  return {
    info: (msg, data) => logger.info(data !== undefined ? { data } : {}, msg),
    error: (msg, data) => logger.error(data !== undefined ? { data } : {}, msg),
  };
}
