/** Constants for the eval module (SPEC-06). */

/** Max length of a case name (matches `EvalCaseCreateInput.name`). */
export const EVAL_NAME_MAX = 120;
/** Longest slug before a `-N` suffix; leaves room under `EVAL_NAME_MAX`. */
export const EVAL_SLUG_MAX = 100;
/** Fallback name when a finding title yields an empty slug. */
export const EVAL_DEFAULT_SLUG = 'eval-case';
/** Number of points in an agent's recall sparkline (AC-35). */
export const EVAL_SPARK_POINTS = 10;
/** Cases of one suite run executed in parallel. */
export const EVAL_CONCURRENCY = 3;
/** Fixed task line sent with every eval case (no intent classifier, no repo-intel). */
export const EVAL_TASK_LINE = 'Review this pull request.';
/** Size of the dashboard's recent-runs list. */
export const EVAL_RECENT_RUNS = 10;
