import type { PathPullHistory, PrHistoryItem } from '@devdigest/shared';
import {
  HISTORY_SKIP_BASENAMES,
  HISTORY_SKIP_INFIX,
  HISTORY_SKIP_SEGMENTS,
  HISTORY_SKIP_SUFFIXES,
} from './constants.js';

/** Pure selection and mapping for the history module: no I/O, no clock. */

/** True for lockfiles, vendored, built, snapshot and generated files. */
export function isHistoryNoise(path: string): boolean {
  const parts = path.split('/');
  const base = parts[parts.length - 1] ?? path;
  if (HISTORY_SKIP_BASENAMES.includes(base)) return true;
  if (parts.slice(0, -1).some((seg) => HISTORY_SKIP_SEGMENTS.includes(seg))) return true;
  if (HISTORY_SKIP_SUFFIXES.some((s) => base.endsWith(s))) return true;
  return base.includes(HISTORY_SKIP_INFIX);
}

/** Drop noise, rank by churn (additions + deletions) desc then path asc, keep `max` paths. */
export function pickHistoryFiles(
  files: { path: string; additions: number; deletions: number }[],
  max: number,
): string[] {
  return files
    .filter((f) => !isHistoryNoise(f.path))
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions) || a.path.localeCompare(b.path))
    .slice(0, max)
    .map((f) => f.path);
}

export function buildHistoryNote(overlapCount: number, changedFiles: number): string {
  const same = overlapCount === 1 ? 'Touches 1 of the same files' : `Touches ${overlapCount} of the same files`;
  const total = changedFiles === 1 ? '1 file changed in total' : `${changedFiles} files changed in total`;
  return `${same} (${total})`;
}

export interface SelectPriorPrsOptions {
  currentPrNumber: number;
  maxPrs: number;
  maxChangedFiles: number;
}

/** Merged PRs that touched the same paths, most overlapping first. */
export function selectPriorPrs(history: PathPullHistory, opts: SelectPriorPrsOptions): PrHistoryItem[] {
  // The current PR, when already merged, is a cut-off: only what merged strictly before it counts.
  let cutoff: number | null = null;
  for (const entry of history.paths) {
    for (const pull of entry.pulls) {
      if (pull.number === opts.currentPrNumber && pull.mergedAt) {
        const ts = Date.parse(pull.mergedAt);
        if (!Number.isNaN(ts)) cutoff = ts;
      }
    }
  }

  interface Group {
    number: number;
    title: string;
    mergedAt: string;
    author: string;
    changedFiles: number;
    overlap: string[];
  }
  const groups = new Map<number, Group>();
  for (const entry of history.paths) {
    for (const pull of entry.pulls) {
      if (pull.mergedAt == null) continue;
      if (pull.number === opts.currentPrNumber) continue;
      if (pull.changedFiles > opts.maxChangedFiles) continue;
      if (cutoff !== null && !(Date.parse(pull.mergedAt) < cutoff)) continue;
      let g = groups.get(pull.number);
      if (!g) {
        g = {
          number: pull.number,
          title: pull.title,
          mergedAt: pull.mergedAt,
          author: pull.author,
          changedFiles: pull.changedFiles,
          overlap: [],
        };
        groups.set(pull.number, g);
      }
      if (!g.overlap.includes(entry.path)) g.overlap.push(entry.path);
    }
  }

  return [...groups.values()]
    .sort(
      (a, b) =>
        b.overlap.length - a.overlap.length ||
        Date.parse(b.mergedAt) - Date.parse(a.mergedAt) ||
        b.number - a.number,
    )
    .slice(0, opts.maxPrs)
    .map((g) => ({
      pr_number: g.number,
      title: g.title,
      merged_at: g.mergedAt,
      author: g.author,
      files_overlap: g.overlap,
      notes: buildHistoryNote(g.overlap.length, g.changedFiles),
    }));
}
