/** Tool names, the run-review blocking cap, and shared limits. */

export const TOOL_NAMES = {
  listAgents: 'devdigest_list_agents',
  runReview: 'devdigest_run_review',
  getFindings: 'devdigest_get_findings',
  getConventions: 'devdigest_get_conventions',
  getBlastRadius: 'devdigest_get_blast_radius',
} as const;

/** `devdigest_run_review` is blocking with a 120 s cap (task decision). */
export const RUN_WAIT_CAP_MS = 120_000;
export const POLL_INTERVAL_MS = 2_000;
/** Tolerate this many transient transport errors in a row while polling. */
export const MAX_TRANSIENT_ERRORS = 3;

/** Soft budget on rendered text + structured JSON for one tool result. */
export const OUTPUT_BUDGET_CHARS = 24_000;

export const DEFAULT_FINDINGS_LIMIT = 20;
export const MAX_FINDINGS_LIMIT = 50;

/** Total order for findings: CRITICAL > WARNING > SUGGESTION. */
export const SEVERITY_ORDER = ['CRITICAL', 'WARNING', 'SUGGESTION'] as const;
export type Severity = (typeof SEVERITY_ORDER)[number];

/** Terminal run statuses — polling stops once every run reaches one of these. */
export const TERMINAL_RUN_STATUSES = ['done', 'failed', 'cancelled'] as const;
export type RunStatus = 'running' | (typeof TERMINAL_RUN_STATUSES)[number];
