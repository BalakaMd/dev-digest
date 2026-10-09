/** Period filter of the agent dashboard view (SPEC-06 AC-55). */
export const PERIODS = ["7", "30", "90", "all"] as const;
export type Period = (typeof PERIODS)[number];

/** Selected when the view opens. */
export const DEFAULT_PERIOD: Period = "30";

/** `days` query param of the run list; "all" = no limit. */
export function periodDays(p: Period): number | undefined {
  return p === "all" ? undefined : Number(p);
}
