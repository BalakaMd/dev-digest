import type { SmartDiff, SmartDiffFile, SmartDiffRole } from '@devdigest/shared';
import { SMART_DIFF_ROLE_ORDER } from './constants.js';
import { classifyFile } from './classify.js';

/**
 * Keep the newest review per agent (D2). `newestFirst` must already be
 * ordered newest-first (as `reviewsForPull` returns); `null` agent_id counts
 * as its own key. Non-`review` rows (e.g. `summary`) are dropped — they carry
 * no findings.
 */
export function selectLatestReviews<R extends { kind: string; agent_id: string | null }>(
  newestFirst: R[],
): R[] {
  const seenAgents = new Set<string>();
  const latest: R[] = [];
  for (const row of newestFirst) {
    if (row.kind !== 'review') continue;
    const key = row.agent_id ?? '';
    if (seenAgents.has(key)) continue;
    seenAgents.add(key);
    latest.push(row);
  }
  return latest;
}

interface SmartDiffFileInput {
  path: string;
  additions: number;
  deletions: number;
}

interface SmartDiffFindingInput {
  file: string;
  start_line: number;
}

/**
 * Group PR files into the five fixed-order roles (D3) and attach each file's
 * finding line numbers (unique, ascending). `total_lines` sums additions +
 * deletions across ALL files (not per group). PR-split suggestions are out of
 * scope for this pass: `too_big` is always `false`, `proposed_splits` is
 * always empty.
 */
export function buildSmartDiff(
  files: SmartDiffFileInput[],
  findings: SmartDiffFindingInput[],
): SmartDiff {
  const linesByPath = new Map<string, number[]>();
  for (const finding of findings) {
    const lines = linesByPath.get(finding.file) ?? [];
    lines.push(finding.start_line);
    linesByPath.set(finding.file, lines);
  }

  const filesByRole = new Map<SmartDiffRole, SmartDiffFile[]>(
    SMART_DIFF_ROLE_ORDER.map((role) => [role, []]),
  );

  for (const file of files) {
    const role = classifyFile(file.path);
    const rawLines = linesByPath.get(file.path) ?? [];
    const finding_lines = Array.from(new Set(rawLines)).sort((a, b) => a - b);
    filesByRole.get(role)!.push({
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines,
    });
  }

  const groups = SMART_DIFF_ROLE_ORDER.map((role) => ({
    role,
    files: [...filesByRole.get(role)!].sort((a, b) => a.path.localeCompare(b.path)),
  }));

  const total_lines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);

  return {
    groups,
    split_suggestion: { too_big: false, total_lines, proposed_splits: [] },
  };
}
