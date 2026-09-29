import type { ConventionsState, ConventionCandidate } from '@devdigest/shared';

export type ConventionsStatusFilter = 'accepted' | 'pending' | 'all';

export interface ConventionsProjection {
  hasScan: boolean;
  acceptedCount: number;
  pendingCount: number;
  rules: {
    category: string;
    rule: string;
    location: string;
    confidence?: number;
    evidence?: { location: string; snippet: string }[];
  }[];
  hint?: string;
}

function byStatus(candidates: ConventionCandidate[], status: ConventionsStatusFilter): ConventionCandidate[] {
  if (status === 'all') return candidates;
  return candidates.filter((c) => c.status === status);
}

export function projectConventions(
  state: ConventionsState,
  status: ConventionsStatusFilter,
  detailed: boolean,
): ConventionsProjection {
  const hasScan = state.scan !== null;
  const acceptedCount = state.candidates.filter((c) => c.status === 'accepted').length;
  const pendingCount = state.candidates.filter((c) => c.status === 'pending').length;
  const shown = byStatus(state.candidates, status);

  const rules = shown.map((c) => ({
    category: c.category,
    rule: c.rule,
    location: `${c.evidence_path}:${c.line_start}-${c.line_end}`,
    ...(detailed
      ? {
          confidence: c.confidence,
          evidence: c.evidence.map((e) => ({
            location: `${e.path}:${e.line_start}-${e.line_end}`,
            snippet: e.snippet.length > 200 ? `${e.snippet.slice(0, 200)}…` : e.snippet,
          })),
        }
      : {}),
  }));

  let hint: string | undefined;
  if (!hasScan) {
    hint = 'No scan yet — run a scan in the studio (repo → Conventions).';
  } else if (status === 'accepted' && acceptedCount === 0 && pendingCount > 0) {
    hint = `0 accepted; ${pendingCount} pending candidate(s) — pass status='pending' to see them.`;
  }

  return { hasScan, acceptedCount, pendingCount, rules, hint };
}

export function renderConventionsText(projection: ConventionsProjection): string {
  if (projection.hint && projection.rules.length === 0) return projection.hint;
  const grouped = new Map<string, string[]>();
  for (const r of projection.rules) {
    const list = grouped.get(r.category) ?? [];
    list.push(`${r.rule} (${r.location})`);
    grouped.set(r.category, list);
  }
  const lines: string[] = [];
  for (const [category, rules] of grouped) {
    lines.push(`## ${category}`);
    lines.push(...rules);
  }
  if (projection.hint) lines.push(projection.hint);
  return lines.join('\n');
}
