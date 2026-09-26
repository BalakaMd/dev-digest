/* smart-diff-model.ts — pure Smart Diff view model for the DiffTab. No React;
   consumed by DiffTab.tsx. Mirrors the server's role-grouping rules
   (server/src/modules/reviews/smart-diff/build.ts) so both sides agree on
   "latest review per agent" (D2) without a cross-package import. */
import { lineKey } from "@/components/diff-viewer";
import type {
  FindingRecord,
  PrFile,
  ReviewRecord,
  Severity,
  SmartDiffResponse,
  SmartDiffRole,
} from "@devdigest/shared";

/**
 * Keep the newest review per agent (D2). `reviews` must already be ordered
 * newest-first (as `usePrReviews` returns); a `null` agent_id counts as its
 * own key. Non-`review` rows (e.g. `summary`) are dropped — they carry no
 * findings.
 */
export function latestReviewPerAgent(reviews: ReviewRecord[]): ReviewRecord[] {
  const seenAgents = new Set<string>();
  const latest: ReviewRecord[] = [];
  for (const review of reviews) {
    if (review.kind !== "review") continue;
    const key = review.agent_id ?? "";
    if (seenAgents.has(key)) continue;
    seenAgents.add(key);
    latest.push(review);
  }
  return latest;
}

/** Flatten a set of reviews' findings into a map keyed by file path. */
export function findingsByFile(reviews: ReviewRecord[]): Map<string, FindingRecord[]> {
  const byFile = new Map<string, FindingRecord[]>();
  for (const review of reviews) {
    for (const finding of review.findings) {
      const list = byFile.get(finding.file) ?? [];
      list.push(finding);
      byFile.set(finding.file, list);
    }
  }
  return byFile;
}

/** The diff-viewer annotation key a finding anchors to (comments.ts:34-36). */
export function findingAnchorKey(f: FindingRecord): string | null {
  return lineKey("RIGHT", f.start_line);
}

/**
 * Group a file's findings by the diff-viewer anchor key they map to. A
 * finding with no valid anchor is skipped here — the caller still surfaces it
 * (e.g. in the "outside the diff" block) by other means.
 */
export function groupFindingsByAnchor(findings: FindingRecord[]): Map<string, FindingRecord[]> {
  const grouped = new Map<string, FindingRecord[]>();
  for (const f of findings) {
    const key = findingAnchorKey(f);
    if (!key) continue;
    const list = grouped.get(key) ?? [];
    list.push(f);
    grouped.set(key, list);
  }
  return grouped;
}

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

/**
 * The most severe finding in a (non-empty) list — decides a shared line
 * decoration's colour/label when several findings anchor to the same line.
 */
export function mostSevereFinding(findings: readonly FindingRecord[]): FindingRecord {
  return findings.reduce((top, f) =>
    SEVERITY_RANK[f.severity] > SEVERITY_RANK[top.severity] ? f : top,
  );
}

export interface SmartDiffRoleGroup {
  role: SmartDiffRole;
  files: PrFile[];
}

/**
 * Join `pr.files` (original order + patch text) against the server's role
 * groups (order + membership) by path. A `pr.files` entry the response
 * doesn't mention falls back to `core` — the same fallback the server applies
 * when it can't classify a path (D3). Empty groups are dropped, even though
 * the server always returns all five.
 */
export function buildRoleGroups(smart: SmartDiffResponse, files: PrFile[]): SmartDiffRoleGroup[] {
  const byPath = new Map(files.map((f) => [f.path, f] as const));
  const placed = new Set<string>();
  const groups: SmartDiffRoleGroup[] = [];

  for (const group of smart.groups) {
    const groupFiles: PrFile[] = [];
    for (const smartFile of group.files) {
      const file = byPath.get(smartFile.path);
      if (!file) continue;
      groupFiles.push(file);
      placed.add(smartFile.path);
    }
    if (groupFiles.length > 0) groups.push({ role: group.role, files: groupFiles });
  }

  const orphaned = files.filter((f) => !placed.has(f.path));
  if (orphaned.length > 0) {
    const core = groups.find((g) => g.role === "core");
    if (core) core.files = [...core.files, ...orphaned];
    // `core` is always first in SMART_DIFF_ROLE_ORDER, so prepending here
    // still respects the server's group order when core had no direct match.
    else groups.unshift({ role: "core", files: orphaned });
  }

  return groups;
}

/** Number of `files` (not findings) that have at least one finding. */
export function countFilesWithFindings(
  files: PrFile[],
  byFile: Map<string, FindingRecord[]>,
): number {
  return files.filter((f) => (byFile.get(f.path)?.length ?? 0) > 0).length;
}
