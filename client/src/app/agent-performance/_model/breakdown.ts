/* Cost-breakdown rules (AC-38, AC-51, AC-39, Q-3): slices → donut segments + legend rows. */
import { TOP_SLICES } from "./constants";

export interface SliceInput {
  /** Stable id (agent id / model name); null for the deleted-agent / unknown-model slice. */
  id: string | null;
  name: string;
  amount: number;
}

export interface LegendRow extends SliceInput {
  /** Whole percentage of Total cost; 0 when Total cost is 0. */
  percent: number;
}

export interface Breakdown {
  /** Donut segments: the largest `TOP_SLICES` plus one "Other" when there are more. */
  segments: LegendRow[];
  /** Every slice, in order. */
  legend: LegendRow[];
  /** Total cost is 0 → render one neutral ring instead of coloured segments (Q-3). */
  neutral: boolean;
}

function compareText(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Order: amount descending, then name, then id. */
export function orderSlices<T extends SliceInput>(slices: readonly T[]): T[] {
  return [...slices].sort(
    (a, b) => b.amount - a.amount || compareText(a.name, b.name) || compareText(a.id ?? "", b.id ?? ""),
  );
}

export function buildBreakdown(
  slices: readonly SliceInput[],
  totalCost: number,
  otherLabel: string,
): Breakdown {
  const pct = (amount: number) => (totalCost > 0 ? Math.round((amount / totalCost) * 100) : 0);
  const legend = orderSlices(slices).map((s) => ({ ...s, percent: pct(s.amount) }));
  let segments = legend;
  if (legend.length > TOP_SLICES) {
    const rest = legend.slice(TOP_SLICES).reduce((sum, s) => sum + s.amount, 0);
    segments = [
      ...legend.slice(0, TOP_SLICES),
      { id: null, name: otherLabel, amount: rest, percent: pct(rest) },
    ];
  }
  return { segments, legend, neutral: !(totalCost > 0) };
}

/** AC-39: no counted run has a cost, so the charts give way to a message. */
export function hasNoPricedRuns(runs: number, notPricedRuns: number): boolean {
  return runs > 0 && notPricedRuns >= runs;
}

/**
 * Legend money: always 3 decimals so amounts in one list line up
 * ($0.030, $0.005, $0.003). A non-zero value below the precision reads "<$0.001",
 * never "$0.000"; a genuine zero reads "$0.000". Same rule as the PR brief cost.
 */
export function formatLegendUsd(usd: number): string {
  if (usd > 0 && usd < 0.0005) return "<$0.001";
  return `$${usd.toFixed(3)}`;
}
