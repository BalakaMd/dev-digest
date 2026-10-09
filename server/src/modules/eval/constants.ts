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

// ---- SPEC-07 line-range suggestion --------------------------------------

/** A suggested range may span at most this many lines before AC-12 narrows it to a block. */
export const EVAL_SUGGEST_MAX_LINES = 80;
/** A cited range may run at most this many lines past a function's edge and still snap to that function. */
export const EVAL_SUGGEST_MAX_SPILL = 2;
/** Search terms shorter than this (text inside the delimiters) are dropped (AC-6). */
export const EVAL_TERM_MIN_LENGTH = 3;
/** Longer terms are dropped. */
export const EVAL_TERM_MAX_LENGTH = 200;
/** At most this many distinct terms are used (NFR-3). */
export const EVAL_TERMS_MAX = 100;
/** Title / rationale are truncated to this many characters before term extraction (NFR-3). */
export const EVAL_TITLE_MAX_CHARS = 500;
export const EVAL_RATIONALE_MAX_CHARS = 8000;
/** Finding kinds whose cited range is suggested as is (AC-44, SPEC-06 AC-66). */
export const EVAL_FULL_FILE_KINDS: readonly string[] = ['secret_leak', 'lethal_trifecta', 'phantom', 'hook'];
