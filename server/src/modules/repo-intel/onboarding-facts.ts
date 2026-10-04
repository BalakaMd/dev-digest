/**
 * Pure helpers behind `RepoIntel.getOnboardingFacts` — no I/O, deterministic:
 * the same rows in any order produce identical lists (rank DESC, path ASC).
 */
import type { OnboardingFacts, RankedFileRow } from './types.js';

export interface RankedPathInput {
  path: string;
  rank: number;
}

export interface EdgeInput {
  fromFile: string;
  toFile: string;
}

export interface OnboardingFactsInput {
  ranked: RankedPathInput[];
  edges: EdgeInput[];
  /** Dependency chains from `getCriticalPaths`. */
  chains: string[][];
  isJunk: (path: string) => boolean;
  readingPath: number;
  criticalPaths: number;
}

const byRankThenPath = (a: RankedPathInput, b: RankedPathInput): number =>
  b.rank - a.rank || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

export function emptyOnboardingFacts(): OnboardingFacts {
  return { indexedPaths: [], readingPath: [], criticalPaths: [] };
}

export function buildOnboardingFacts(input: OnboardingFactsInput): OnboardingFacts {
  const ranked = [...input.ranked].sort(byRankThenPath);
  const rankOf = new Map(ranked.map((r) => [r.path, r.rank]));

  const importedBy = new Map<string, number>();
  const imports = new Map<string, number>();
  for (const e of input.edges) {
    importedBy.set(e.toFile, (importedBy.get(e.toFile) ?? 0) + 1);
    imports.set(e.fromFile, (imports.get(e.fromFile) ?? 0) + 1);
  }

  const toRow = (path: string, rank: number): RankedFileRow => ({
    path,
    rank,
    importedBy: importedBy.get(path) ?? 0,
    imports: imports.get(path) ?? 0,
  });

  const readingPath = ranked
    .filter((r) => !input.isJunk(r.path))
    .slice(0, Math.max(0, input.readingPath))
    .map((r) => toRow(r.path, r.rank));

  const distinct = new Set<string>();
  for (const chain of input.chains) for (const p of chain) distinct.add(p);
  const criticalPaths = [...distinct]
    .map((path) => ({ path, rank: rankOf.get(path) ?? 0 }))
    .sort(byRankThenPath)
    .slice(0, Math.max(0, input.criticalPaths))
    .map((r) => toRow(r.path, r.rank));

  return { indexedPaths: ranked.map((r) => r.path), readingPath, criticalPaths };
}
