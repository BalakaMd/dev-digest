import { z } from 'zod';
import type { PrBrief, Risk } from '@devdigest/shared';
import { RiskSeverity } from '@devdigest/shared';
import { MAX_ERROR_CHARS, MAX_HUNK_HEADER_CHARS, MAX_REVIEW_FOCUS, MAX_RISKS } from './constants.js';
import type { Hunk } from './types.js';

/**
 * Pure helpers for the PR Brief: hunk headers, grounding of the model's
 * answer, staleness, error text. No I/O. Model output is untrusted: paths in
 * it are only ever compared against a Set, never opened.
 */

/**
 * The model's answer (AC-39). No `.min/.max` — strict structured output
 * rejects them (see `intent/service.ts`); limits are applied by `groundAnswer`.
 */
export const BriefAnswer = z.object({
  summary: z.string(),
  risks: z.array(
    z.object({
      kind: z.string(),
      title: z.string(),
      explanation: z.string(),
      severity: RiskSeverity,
      file_refs: z.array(z.string()),
    }),
  ),
  review_focus: z.array(
    z.object({
      file: z.string(),
      line: z.number().int(),
      reason: z.string(),
    }),
  ),
});
export type BriefAnswer = z.infer<typeof BriefAnswer>;

// ------------------------------------------------------------ hunk headers (AC-23, AC-24)

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

/**
 * Hunk ranges and full header lines of a patch. Only lines that START with
 * `@@` are read: every body line starts with ` `, `+`, `-` or `\`, so no body
 * line (added, removed, context) can ever be returned. `null` patch → `[]`.
 */
export function extractHunks(patch: string | null | undefined): Hunk[] {
  if (!patch) return [];
  const out: Hunk[] = [];
  for (const raw of patch.split('\n')) {
    if (!raw.startsWith('@@')) continue;
    const line = raw.replace(/\r$/, '');
    const m = HUNK_HEADER.exec(line);
    if (!m) continue;
    const header = line.trimEnd();
    out.push({
      oldStart: Number(m[1]),
      oldLines: m[2] === undefined ? 1 : Number(m[2]),
      newStart: Number(m[3]),
      newLines: m[4] === undefined ? 1 : Number(m[4]),
      header: header.length > MAX_HUNK_HEADER_CHARS ? header.slice(0, MAX_HUNK_HEADER_CHARS) : header,
    });
  }
  return out;
}

// ------------------------------------------------------------ grounding (AC-20, AC-21, AC-44)

/**
 * Repo-relative path normalisation for model-written paths: trim, drop ONE
 * leading `./`, reject empty, absolute-looking and `..` paths. No case folding.
 */
export function normalizePath(raw: string): string | null {
  let p = raw.trim();
  if (p.startsWith('./')) p = p.slice(2);
  if (p === '' || p.startsWith('/')) return null;
  if (p.split('/').some((seg) => seg === '..')) return null;
  return p;
}

export interface GroundingCounts {
  risks_returned: number;
  risk_refs_returned: number;
  focus_returned: number;
  risks_dropped_by_grounding: number;
  risk_refs_dropped_by_grounding: number;
  focus_dropped_by_grounding: number;
  risks_dropped_by_cap: number;
  focus_dropped_by_cap: number;
}

export interface GroundedAnswer {
  risks: Risk[];
  review_focus: PrBrief['review_focus'];
  counts: GroundingCounts;
}

/**
 * Drops unknown file references (a risk with none left is dropped, AC-20) and
 * focus items with an unknown file or a line below 1 (AC-21), then keeps the
 * first MAX_RISKS / MAX_REVIEW_FOCUS in the model's order (AC-44). `allowed`
 * holds the repo-relative changed files plus the Blast radius map files.
 */
export function groundAnswer(answer: BriefAnswer, allowed: ReadonlySet<string>): GroundedAnswer {
  const counts: GroundingCounts = {
    risks_returned: answer.risks.length,
    risk_refs_returned: answer.risks.reduce((n, r) => n + r.file_refs.length, 0),
    focus_returned: answer.review_focus.length,
    risks_dropped_by_grounding: 0,
    risk_refs_dropped_by_grounding: 0,
    focus_dropped_by_grounding: 0,
    risks_dropped_by_cap: 0,
    focus_dropped_by_cap: 0,
  };

  const risks: Risk[] = [];
  for (const risk of answer.risks) {
    const refs: string[] = [];
    for (const ref of risk.file_refs) {
      const p = normalizePath(ref);
      if (p !== null && allowed.has(p)) {
        if (!refs.includes(p)) refs.push(p);
      } else {
        counts.risk_refs_dropped_by_grounding += 1;
      }
    }
    if (refs.length === 0) {
      counts.risks_dropped_by_grounding += 1;
      continue;
    }
    risks.push({ ...risk, file_refs: refs });
  }

  const focus: PrBrief['review_focus'] = [];
  for (const item of answer.review_focus) {
    const p = normalizePath(item.file);
    if (p === null || !allowed.has(p) || !Number.isInteger(item.line) || item.line < 1) {
      counts.focus_dropped_by_grounding += 1;
      continue;
    }
    focus.push({ file: p, line: item.line, reason: item.reason });
  }

  counts.risks_dropped_by_cap = Math.max(0, risks.length - MAX_RISKS);
  counts.focus_dropped_by_cap = Math.max(0, focus.length - MAX_REVIEW_FOCUS);
  return {
    risks: risks.slice(0, MAX_RISKS),
    review_focus: focus.slice(0, MAX_REVIEW_FOCUS),
    counts,
  };
}

// ------------------------------------------------------------ staleness, errors, text

/** AC-30: the brief is stale when the stored SHA differs from the PR's current head. */
export function isStale(storedHeadSha: string, currentHeadSha: string): boolean {
  return storedHeadSha !== currentHeadSha;
}

/** Bounded, single-line failure text safe to show in the UI (no stack, keys redacted). */
export function sanitizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const line = raw.replace(/\s+/g, ' ').trim() || 'Generation failed';
  const redacted = line.replace(/\b(sk|or|key)[-_][A-Za-z0-9_-]{8,}/gi, '[redacted]');
  return redacted.length > MAX_ERROR_CHARS ? `${redacted.slice(0, MAX_ERROR_CHARS)}…` : redacted;
}

/** Cut `text` to at most `maxBytes` of UTF-8 without splitting a code point. */
export function truncateUtf8(
  text: string,
  maxBytes: number,
): { text: string; truncated: boolean; bytes: number } {
  const full = new TextEncoder().encode(text);
  if (full.byteLength <= maxBytes) return { text, truncated: false, bytes: full.byteLength };
  let end = Math.max(0, maxBytes);
  while (end > 0 && (full[end]! & 0b1100_0000) === 0b1000_0000) end--;
  const slice = full.slice(0, end);
  return { text: new TextDecoder('utf-8').decode(slice), truncated: true, bytes: slice.byteLength };
}
