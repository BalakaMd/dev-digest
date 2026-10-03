/* budget.ts — client mirror of the run executor's token-budget rule: documents
   are taken in order; one that would push the total over the limit is skipped
   whole and the next one is tried. Keep identical to the server (SPEC-01 S7). */

export interface BudgetDoc {
  path: string;
  tokens: number;
}

export function simulateBudget(
  orderedDocs: BudgetDoc[],
  limit: number,
): { total: number; skipped: string[] } {
  let total = 0;
  const skipped: string[] = [];
  for (const d of orderedDocs) {
    if (total + d.tokens > limit) skipped.push(d.path);
    else total += d.tokens;
  }
  return { total, skipped };
}
