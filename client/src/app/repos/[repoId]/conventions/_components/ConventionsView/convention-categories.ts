/* convention-categories.ts — the fixed convention taxonomy, in display order.
   Mirrors `ConventionCategory` in @devdigest/shared: the client may import only
   TYPES from the vendored package, so the values are repeated here. */
import type { ConventionCandidate, ConventionCategory } from "@devdigest/shared";

export const CONVENTION_CATEGORIES: readonly ConventionCategory[] = [
  "naming",
  "error-handling",
  "async",
  "imports",
  "module-structure",
  "typing",
  "testing",
  "formatting",
  "api",
  "data-access",
  "other",
];

/** Categories that actually occur in `candidates`, with counts, in taxonomy order. */
export function categoryCounts(
  candidates: readonly Pick<ConventionCandidate, "category">[],
): { category: ConventionCategory; count: number }[] {
  const counts = new Map<ConventionCategory, number>();
  for (const c of candidates) counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
  return CONVENTION_CATEGORIES.filter((c) => counts.has(c)).map((category) => ({
    category,
    count: counts.get(category)!,
  }));
}
