import type { ReviewRecord } from '@devdigest/shared';
import {
  DEFAULT_FINDINGS_LIMIT,
  MAX_FINDINGS_LIMIT,
  OUTPUT_BUDGET_CHARS,
  SEVERITY_ORDER,
  type Severity,
} from '../constants.js';

export interface ProjectedFinding {
  severity: Severity;
  category: string;
  title: string;
  location: string;
  agent: string;
  id?: string;
  rationale?: string;
  suggestion?: string | null;
  confidence?: number;
  scope?: string | null;
  state?: 'open' | 'accepted';
}

export interface FindingsQuery {
  minSeverity?: Severity;
  limit?: number;
  offset?: number;
  detailed?: boolean;
}

export interface FindingsProjection {
  total: number;
  returned: number;
  offset: number;
  nextOffset: number | null;
  hiddenDismissed: number;
  findings: ProjectedFinding[];
}

const SEVERITY_RANK = new Map<Severity, number>(SEVERITY_ORDER.map((s, i) => [s, i]));

/** Reviews arrive newest-first (`created_at` desc); the first `review` kind
 * seen per agent is its latest. Same rule the PR list uses. */
export function selectLatestReviewPerAgent(reviews: ReviewRecord[]): ReviewRecord[] {
  const seenAgents = new Set<string>();
  const result: ReviewRecord[] = [];
  for (const review of reviews) {
    if (review.kind !== 'review') continue;
    const key = review.agent_id ?? review.run_id ?? review.id;
    if (seenAgents.has(key)) continue;
    seenAgents.add(key);
    result.push(review);
  }
  return result;
}

/** Truncate long free-text fields in `detailed` output (~1,200 chars). */
export function truncateLong(text: string, max = 1200): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Filter (severity, dismissed), sort by the total order CRITICAL > WARNING >
 * SUGGESTION → file → start_line → id, then paginate. `detailed` adds
 * id/rationale/suggestion/confidence/scope/state; concise omits them.
 */
export function projectFindings(reviews: ReviewRecord[], query: FindingsQuery = {}): FindingsProjection {
  const minSeverity = query.minSeverity ?? 'SUGGESTION';
  const minRank = SEVERITY_RANK.get(minSeverity) ?? SEVERITY_RANK.get('SUGGESTION')!;
  const limit = Math.max(1, Math.min(query.limit ?? DEFAULT_FINDINGS_LIMIT, MAX_FINDINGS_LIMIT));
  const offset = Math.max(0, query.offset ?? 0);

  let hiddenDismissed = 0;
  const flat: { review: ReviewRecord; finding: ReviewRecord['findings'][number] }[] = [];
  for (const review of reviews) {
    for (const finding of review.findings) {
      if (finding.dismissed_at) {
        hiddenDismissed += 1;
        continue;
      }
      flat.push({ review, finding });
    }
  }

  const filtered = flat.filter(({ finding }) => (SEVERITY_RANK.get(finding.severity) ?? 99) <= minRank);
  filtered.sort((a, b) => {
    const sa = SEVERITY_RANK.get(a.finding.severity) ?? 99;
    const sb = SEVERITY_RANK.get(b.finding.severity) ?? 99;
    if (sa !== sb) return sa - sb;
    if (a.finding.file !== b.finding.file) return a.finding.file < b.finding.file ? -1 : 1;
    if (a.finding.start_line !== b.finding.start_line) return a.finding.start_line - b.finding.start_line;
    return a.finding.id < b.finding.id ? -1 : a.finding.id > b.finding.id ? 1 : 0;
  });

  const total = filtered.length;
  let page = filtered.slice(offset, offset + limit);

  const findings: ProjectedFinding[] = page.map(({ review, finding }) => {
    const base: ProjectedFinding = {
      severity: finding.severity,
      category: finding.category,
      title: finding.title,
      location: `${finding.file}:${finding.start_line}-${finding.end_line}`,
      agent: review.agent_name ?? 'unknown',
    };
    if (!query.detailed) return base;
    return {
      ...base,
      id: finding.id,
      rationale: truncateLong(finding.rationale),
      suggestion: finding.suggestion ? truncateLong(finding.suggestion) : null,
      confidence: finding.confidence,
      scope: finding.scope ?? null,
      state: finding.accepted_at ? 'accepted' : 'open',
    };
  });

  // Output budget: shrink the page (never grow it) until the JSON + text
  // rendering roughly fits, adjusting nextOffset to match what was kept.
  let kept = findings;
  while (kept.length > 1 && estimateChars(kept) > OUTPUT_BUDGET_CHARS) {
    kept = kept.slice(0, kept.length - 1);
  }
  page = page.slice(0, kept.length);

  const nextOffset = offset + kept.length < total ? offset + kept.length : null;
  return { total, returned: kept.length, offset, nextOffset, hiddenDismissed, findings: kept };
}

function estimateChars(findings: ProjectedFinding[]): number {
  return JSON.stringify(findings).length;
}

/** `SEVERITY file:start-end — title (agent)` lines + a pagination hint. */
export function renderFindingsText(projection: FindingsProjection): string {
  if (projection.findings.length === 0) {
    return projection.total === 0
      ? 'No findings match the given filter.'
      : `0 of ${projection.total} findings shown at offset ${projection.offset} (try offset=0).`;
  }
  const lines = projection.findings.map(
    (f) => `${f.severity} ${f.location} — ${f.title} (${f.agent})`,
  );
  if (projection.nextOffset !== null) {
    lines.push(
      `${projection.total - projection.offset - projection.returned} more: call again with offset=${projection.nextOffset}`,
    );
  }
  if (projection.hiddenDismissed > 0) {
    lines.push(`(${projection.hiddenDismissed} dismissed finding(s) hidden)`);
  }
  return lines.join('\n');
}
