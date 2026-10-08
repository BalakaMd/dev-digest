import { z } from 'zod';
import { Agent } from './knowledge.js';

/**
 * SPEC-06 — eval pipeline (regression harness for review agents).
 *
 * New names only: the older `EvalCaseInput` / `EvalRunRecord` / `EvalDashboard`
 * in `eval-ci.ts` and `EvalRun` / `EvalCase` in `knowledge.ts` are untouched.
 * Metrics are fractions 0..1 or `null` ("no value" — the denominator was 0).
 */

// ===========================================================================
// Expectations + case payloads
// ===========================================================================

export const EvalExpectationType = z.enum(['must_find', 'must_not_flag']);
export type EvalExpectationType = z.infer<typeof EvalExpectationType>;

/** One expectation of a case. `title`, `severity`, `category` are notes only (scorer ignores them). */
export const EvalExpectation = z.object({
  type: EvalExpectationType,
  file: z.string().min(1),
  start_line: z.number().int(),
  end_line: z.number().int(),
  title: z.string().nullish(),
  severity: z.string().nullish(),
  category: z.string().nullish(),
});
export type EvalExpectation = z.infer<typeof EvalExpectation>;

export const EvalExpectedOutput = z.array(EvalExpectation).min(1);
export type EvalExpectedOutput = z.infer<typeof EvalExpectedOutput>;

/** Snapshot of the PR text taken when the case was created. */
export const EvalCaseMeta = z.object({
  title: z.string(),
  body: z.string(),
});
export type EvalCaseMeta = z.infer<typeof EvalCaseMeta>;

/** Manual create (`POST /agents/:id/eval-cases`). */
export const EvalCaseCreateInput = z.object({
  name: z.string().min(1).max(120),
  input_diff: z.string().min(1),
  input_meta: EvalCaseMeta,
  expected_output: EvalExpectedOutput,
});
export type EvalCaseCreateInput = z.infer<typeof EvalCaseCreateInput>;

/** Edit (`PUT /eval-cases/:id`): the stored input is immutable (AC-72) — unknown keys are rejected. */
export const EvalCaseUpdateInput = z
  .object({
    name: z.string().min(1).max(120).optional(),
    expected_output: EvalExpectedOutput.optional(),
  })
  .strict();
export type EvalCaseUpdateInput = z.infer<typeof EvalCaseUpdateInput>;

// ===========================================================================
// Case responses
// ===========================================================================

export const EvalCaseLastResult = z.object({
  passed: z.boolean(),
  expected_count: z.number().int(),
  returned_count: z.number().int(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  ran_at: z.string(),
});
export type EvalCaseLastResult = z.infer<typeof EvalCaseLastResult>;

export const EvalCaseSummary = z.object({
  id: z.string(),
  agent_id: z.string(),
  name: z.string(),
  expected_output: EvalExpectedOutput,
  source_finding_id: z.string().nullable(),
  created_at: z.string(),
  /** Latest scored single or suite execution; null = "never run". */
  last_result: EvalCaseLastResult.nullable(),
});
export type EvalCaseSummary = z.infer<typeof EvalCaseSummary>;

export const EvalCaseDetail = EvalCaseSummary.extend({
  input_diff: z.string(),
  input_meta: EvalCaseMeta,
  /** Paths of the files contained in `input_diff` (read-only Files tab). */
  input_files: z.array(z.string()),
});
export type EvalCaseDetail = z.infer<typeof EvalCaseDetail>;

export const EvalCaseFromFindingResponse = z.object({
  case: EvalCaseDetail,
  /** false = the finding already had a case; the existing one is returned (AC-9). */
  created: z.boolean(),
});
export type EvalCaseFromFindingResponse = z.infer<typeof EvalCaseFromFindingResponse>;

// ===========================================================================
// Runs
// ===========================================================================

export const EvalSuiteRunStatus = z.enum(['running', 'done', 'failed']);
export type EvalSuiteRunStatus = z.infer<typeof EvalSuiteRunStatus>;

export const EvalSuiteRun = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_name: z.string().optional(),
  agent_version: z.number().int(),
  status: EvalSuiteRunStatus,
  error: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  cases_total: z.number().int(),
  cases_done: z.number().int(),
  cases_errored: z.number().int(),
  /** Passed cases out of the scored (non-error) ones. */
  cases_passed: z.number().int(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  /** null = unknown (some scored case had no cost) — AC-76. */
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
});
export type EvalSuiteRun = z.infer<typeof EvalSuiteRun>;

/** One case's result row inside a run. */
export const EvalCaseRun = z.object({
  id: z.string(),
  /** null when the case was deleted after the run (history is kept). */
  case_id: z.string().nullable(),
  case_name: z.string(),
  expectation_types: z.array(EvalExpectationType),
  status: z.enum(['ok', 'error']),
  error: z.string().nullable(),
  passed: z.boolean().nullable(),
  expected_count: z.number().int(),
  returned_count: z.number().int(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalCaseRun = z.infer<typeof EvalCaseRun>;

export const EvalRunFinding = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  title: z.string(),
  severity: z.string().nullish(),
  category: z.string().nullish(),
  rationale: z.string().nullish(),
  /** Whether the finding matched any expectation of its case. */
  matched: z.boolean(),
});
export type EvalRunFinding = z.infer<typeof EvalRunFinding>;

export const EvalRunDroppedFinding = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  title: z.string(),
  reason: z.string(),
});
export type EvalRunDroppedFinding = z.infer<typeof EvalRunDroppedFinding>;

/** Per expectation: which grounded findings (by index) matched it. */
export const EvalExpectationMatch = z.object({
  expectation_index: z.number().int(),
  matched: z.boolean(),
  finding_indexes: z.array(z.number().int()),
});
export type EvalExpectationMatch = z.infer<typeof EvalExpectationMatch>;

export const EvalCaseRunDetail = EvalCaseRun.extend({
  expectations: z.array(EvalExpectation),
  findings: z.array(EvalRunFinding),
  dropped: z.array(EvalRunDroppedFinding),
  expectation_matches: z.array(EvalExpectationMatch),
});
export type EvalCaseRunDetail = z.infer<typeof EvalCaseRunDetail>;

export const EvalRunDetail = z.object({
  run: EvalSuiteRun,
  cases: z.array(EvalCaseRun),
});
export type EvalRunDetail = z.infer<typeof EvalRunDetail>;

export const EvalStartRunResponse = z.object({ run_id: z.string() });
export type EvalStartRunResponse = z.infer<typeof EvalStartRunResponse>;

export const EvalRunAllResponse = z.object({
  started: z.array(z.object({ agent_id: z.string(), run_id: z.string() })),
});
export type EvalRunAllResponse = z.infer<typeof EvalRunAllResponse>;

// ===========================================================================
// Dashboard
// ===========================================================================

export const EvalDashboardAgent = z.object({
  agent_id: z.string(),
  name: z.string(),
  provider: z.string(),
  model: z.string(),
  enabled: z.boolean(),
  cases_total: z.number().int(),
  /** Latest completed run; null = "never run". */
  latest: EvalSuiteRun.nullable(),
  /** Run in progress, if any. */
  running: EvalSuiteRun.nullable(),
  /** Recall of the last completed runs, oldest first; null = no value. */
  recall_spark: z.array(z.number().nullable()),
});
export type EvalDashboardAgent = z.infer<typeof EvalDashboardAgent>;

export const EvalDashboardOverview = z.object({
  agents: z.array(EvalDashboardAgent),
  /** The 10 most recent runs of all agents, newest first (any status). */
  recent_runs: z.array(EvalSuiteRun),
});
export type EvalDashboardOverview = z.infer<typeof EvalDashboardOverview>;

// ===========================================================================
// Compare
// ===========================================================================

export const DiffLine = z.object({
  kind: z.enum(['same', 'add', 'del']),
  text: z.string(),
});
export type DiffLine = z.infer<typeof DiffLine>;

/** older / newer values and the signed difference in percentage points (null when either side is null). */
export const EvalCompareMetric = z.object({
  older: z.number().nullable(),
  newer: z.number().nullable(),
  delta_pp: z.number().nullable(),
});
export type EvalCompareMetric = z.infer<typeof EvalCompareMetric>;

export const EvalCompareCost = z.object({
  older: z.number().nullable(),
  newer: z.number().nullable(),
  /** Signed difference in USD (newer − older); null when either side is unknown. */
  delta: z.number().nullable(),
});
export type EvalCompareCost = z.infer<typeof EvalCompareCost>;

export const EvalCompareCaseRef = z.object({
  case_id: z.string().nullable(),
  case_name: z.string(),
  expectation_types: z.array(EvalExpectationType),
});
export type EvalCompareCaseRef = z.infer<typeof EvalCompareCaseRef>;

export const EvalCompareFlipped = EvalCompareCaseRef.extend({
  from: z.enum(['passed', 'failed']),
  to: z.enum(['passed', 'failed']),
});
export type EvalCompareFlipped = z.infer<typeof EvalCompareFlipped>;

export const EvalCompareConfigDiff = z.object({
  system_prompt: z.array(DiffLine),
  provider: z.object({ older: z.string(), newer: z.string() }).nullable(),
  model: z.object({ older: z.string(), newer: z.string() }).nullable(),
  skills: z.object({
    added: z.array(z.string()),
    removed: z.array(z.string()),
    reordered: z.boolean(),
  }),
});
export type EvalCompareConfigDiff = z.infer<typeof EvalCompareConfigDiff>;

export const EvalCompare = z.object({
  older: EvalSuiteRun,
  newer: EvalSuiteRun,
  recall: EvalCompareMetric,
  precision: EvalCompareMetric,
  citation_accuracy: EvalCompareMetric,
  cost: EvalCompareCost,
  /** Cases scored (non-error) in both runs; metrics, deltas and flips are over these. */
  shared_case_count: z.number().int(),
  only_in_older: z.array(EvalCompareCaseRef),
  only_in_newer: z.array(EvalCompareCaseRef),
  flipped: z.array(EvalCompareFlipped),
  errored: z.object({ older: z.number().int(), newer: z.number().int() }),
  config_diff: EvalCompareConfigDiff,
});
export type EvalCompare = z.infer<typeof EvalCompare>;

// ===========================================================================
// Promote (restore a version)
// ===========================================================================

/** `POST /agents/:id/versions/:version/restore` — the agent at its new version + skills that no longer exist. */
export const AgentRestoreResponse = Agent.extend({
  skipped_skill_ids: z.array(z.string()),
});
export type AgentRestoreResponse = z.infer<typeof AgentRestoreResponse>;
