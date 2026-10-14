import type { CiRunItem } from "@devdigest/shared";
import { EMPTY, formatCostOrDash } from "../../lib/format";
import { githubPrUrl } from "../../lib/github-urls";
import { isGithubUrl } from "../../lib/ci-links";

export type CiVerdict = CiRunItem["verdict"];

/** Verdict values repeated locally (types-only imports from shared, see client INSIGHTS). */
export const CI_VERDICTS: readonly CiVerdict[] = ["approve", "comment", "request_changes", "failed"];

/** Duration as seconds under a minute, minutes (one decimal, trimmed) from there; never raw ms. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms) || ms < 0) return EMPTY;
  if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))} s`;
  const minutes = Math.round(ms / 6000) / 10;
  return `${minutes} min`;
}

/** Findings count, "—" when the run did not report one. */
export function formatFindings(n: number | null | undefined): string {
  return n == null ? EMPTY : String(n);
}

export const formatCost = formatCostOrDash;

/** The PR link: only github.com URLs; falls back to one built from repo + number. */
export function prHref(run: Pick<CiRunItem, "pr_url" | "repo" | "pr_number">): string | null {
  if (isGithubUrl(run.pr_url)) return run.pr_url;
  if (run.repo && run.pr_number != null) return githubPrUrl(run.repo, run.pr_number);
  return null;
}

/** The Actions job link, only when it points at github.com. */
export function jobHref(run: Pick<CiRunItem, "job_url">): string | null {
  return isGithubUrl(run.job_url) ? run.job_url : null;
}
