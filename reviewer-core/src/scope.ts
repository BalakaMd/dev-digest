import type { Finding } from '@devdigest/shared';

/**
 * Scope filter — applied AFTER citation grounding, and only when a PR intent
 * was available (see `review/run.ts`). Mechanical, pure, no bypass flag — same
 * shape as `groundFindings` in `grounding.ts`.
 *
 * `Finding.scope` is a LABEL set by the reviewer model from the `## PR intent`
 * prompt section (`prompt.ts`), never something this module infers from text.
 * We do not keyword-scan; we only branch on the label the model already
 * produced (and even that label can never delete a scanner finding).
 */

// Scanner producers report at file granularity and are never tied to "what the
// PR meant to do" — same set `grounding.ts` treats as full-file. A scanner
// finding is never dropped as out of scope.
const NEVER_OUT_OF_SCOPE_KINDS = new Set(['secret_leak', 'lethal_trifecta', 'phantom', 'hook']);

export interface ScopeFilterResult {
  /** In-scope, unlabeled, and never-out-of-scope-kind findings, plus the signal (if any). */
  kept: Finding[];
  /** Out-of-scope findings dropped, each with a reason (never silent). */
  dropped: { finding: Finding; reason: string }[];
  /** The single CRITICAL out-of-scope finding kept as a signal, or null. */
  signal: Finding | null;
}

/** True when `a` should win the signal slot over the current best `b`. */
function beatsCurrentSignal(a: Finding, b: Finding): boolean {
  const aSecurity = a.category === 'security';
  const bSecurity = b.category === 'security';
  if (aSecurity !== bSecurity) return aSecurity;
  if (a.confidence !== b.confidence) return a.confidence > b.confidence;
  // Tie → original order wins → `a` (later in the array) never beats `b`.
  return false;
}

/**
 * Drop `scope: 'out'` findings, except at most one CRITICAL signal.
 *
 * Rules (see `reviewer-core/specs/grounding.md` for the sibling gate):
 * - `scope` is `'in'`, `null`, or `undefined` → kept (untouched).
 * - Kinds `secret_leak | lethal_trifecta | phantom | hook` are always kept,
 *   regardless of `scope` — a scanner finding is never out of scope.
 * - `scope: 'out'` → dropped, except the single most severe CRITICAL one
 *   (ties: `category === 'security'` first, then higher `confidence`, then
 *   original order). That signal keeps `scope: 'out'` so callers can label it.
 * - Every dropped finding carries a reason. Nothing is dropped silently.
 */
export function filterOutOfScope(findings: Finding[]): ScopeFilterResult {
  const kept: Finding[] = [];
  const outOfScope: Finding[] = [];

  for (const finding of findings) {
    const neverOutOfScope = finding.kind ? NEVER_OUT_OF_SCOPE_KINDS.has(finding.kind) : false;
    if (finding.scope !== 'out' || neverOutOfScope) {
      kept.push(finding);
      continue;
    }
    outOfScope.push(finding);
  }

  let signal: Finding | null = null;
  for (const f of outOfScope) {
    if (f.severity !== 'CRITICAL') continue;
    if (signal === null || beatsCurrentSignal(f, signal)) signal = f;
  }

  const dropped: { finding: Finding; reason: string }[] = [];
  for (const f of outOfScope) {
    if (f === signal) {
      kept.push(f);
      continue;
    }
    dropped.push({
      finding: f,
      reason: signal ? 'out of PR scope — one signal already kept' : 'out of PR scope',
    });
  }

  return { kept, dropped, signal };
}
