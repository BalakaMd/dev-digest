import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import { EvalRun, EvalOwnerKind, Conformance, Provider, CiFailOn } from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — case input + persisted run record + dashboard
// ===========================================================================

/** Create/update payload for an eval case (id + owner resolved by the route). */
export const EvalCaseInput = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string().min(1),
  input_diff: z.string().default(''),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

/** A persisted eval run row (one execution of a case), returned by the API. */
export const EvalRunRecord = z.object({
  id: z.string(),
  case_id: z.string(),
  case_name: z.string().nullish(),
  ran_at: z.string(),
  actual_output: z.unknown(),
  pass: z.boolean().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

/** Result of running a single case: the metrics (EvalRun) + the persisted row id. */
export const EvalRunResult = z.object({
  run_id: z.string(),
  case_id: z.string(),
  result: EvalRun,
});
export type EvalRunResult = z.infer<typeof EvalRunResult>;

/** One point on the dashboard trend (per run, chronological). */
export const EvalTrendPoint = z.object({
  ran_at: z.string(),
  recall: z.number(),
  precision: z.number(),
  citation_accuracy: z.number(),
  pass_rate: z.number(),
  cost_usd: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** Aggregate dashboard for an owner (agent/skill) or the whole workspace. */
export const EvalDashboard = z.object({
  owner_kind: EvalOwnerKind.nullable(),
  owner_id: z.string().nullable(),
  cases_total: z.number().int(),
  current: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
    traces_passed: z.number().int(),
    traces_total: z.number().int(),
    cost_usd: z.number().nullable(),
  }),
  delta: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
  }),
  trend: z.array(EvalTrendPoint),
  recent_runs: z.array(EvalRunRecord),
  alert: z.string().nullable(),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** Branch every export commits to (one branch, many agents' files). */
export const CI_BRANCH = 'devdigest/ci';
/** File the runner writes and the workflow uploads as the Actions artifact. */
export const CI_RESULT_FILE_NAME = 'devdigest-result.json';
/** Hard cap on a result artifact, enforced by the runner and by the ingest. */
export const CI_ARTIFACT_MAX_BYTES = 1_048_576;
/** Env var names shared by the generated workflow and the agent-runner. */
export const CI_RUNNER_ENV = {
  AGENT_SLUG: 'DEVDIGEST_AGENT_SLUG',
  POST_AS: 'DEVDIGEST_POST_AS',
  RESULT_PATH: 'DEVDIGEST_RESULT_PATH',
} as const;
/** Directory (repo-relative) holding the bundled runner. */
export const CI_RUNNER_DIR = '.devdigest/runner/';
/**
 * Actions artifact name for one agent's result. The run attempt is part of the
 * name so a re-run of the same workflow run does not collide with the first.
 */
export const ciArtifactName = (slug: string, attempt: number | string): string =>
  `devdigest-result-${slug}-${attempt}`;

export const CiPostAs = z.enum(['github_review', 'pr_comment', 'none']);
export type CiPostAs = z.infer<typeof CiPostAs>;

export const CiTrigger = z.enum(['opened', 'synchronize', 'reopened']);
export type CiTrigger = z.infer<typeof CiTrigger>;

export const CiInstallationStatus = z.enum([
  'pr_open',
  'pr_closed',
  'awaiting_manual',
  'installed',
]);
export type CiInstallationStatus = z.infer<typeof CiInstallationStatus>;

/**
 * AgentManifest — the agent contract shared by the studio and the CI runner.
 *
 * The studio WRITES this shape to `.devdigest/agents/<slug>.yaml`; the
 * agent-runner READS it. Keeping one Zod schema for both ends guarantees the
 * formats never drift. `skills` are slugs resolved to `.devdigest/skills/<slug>.md`.
 */
export const AgentManifest = z.object({
  name: z.string().min(1),
  /** Saved agent version at export time. */
  version: z.number().int().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  // Tolerate both a missing key and an explicit `null` (YAML `skills:` with no
  // value parses to null, which `.default([])` does NOT catch) — normalize both
  // to an empty array so manifests without skills validate cleanly.
  skills: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  // CI gate policy (see CiFailOn) — when the posted review should BLOCK
  // (REQUEST_CHANGES + fail the check) vs just comment. Default: block on critical.
  ci_fail_on: CiFailOn.default('critical'),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** Reproducibility data the runner stamps into every result artifact. */
export const CiTraceData = z.object({
  manifest: z.object({ agent_version: z.number().int(), sha256: z.string() }),
  model: z.string(),
  runner_version: z.string(),
  reviewer_core_revision: z.string(),
  node_version: z.string(),
  skill_hashes: z.array(z.object({ slug: z.string(), sha256: z.string() })),
  head_sha: z.string(),
});
export type CiTraceData = z.infer<typeof CiTraceData>;

/**
 * The artifact shape uploaded by the CI action (`devdigest-result.json`).
 * Ingested back on refresh. Fields added after the first release are
 * `.nullish()` so results from older runner bundles still parse.
 */
export const CiResultArtifact = z.object({
  findings_count: z.number().int(),
  critical: z.number().int().nullish(),
  warning: z.number().int().nullish(),
  suggestion: z.number().int().nullish(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullish(),
  agent: z.string(),
  version: z.string().nullish(),
  pr_number: z.number().int().nullish(),
  verdict: Verdict.nullish(),
  blockers: z.number().int().nullish(),
  trace: CiTraceData.nullish(),
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

/** Input shared by preview / check / install: where and how to export. */
export const CiPreviewInput = z.object({
  repo: z.string().min(1), // "owner/name"
  triggers: z.array(CiTrigger).min(1),
  post_as: CiPostAs,
});
export type CiPreviewInput = z.infer<typeof CiPreviewInput>;

export const CiPreviewFile = z.object({
  path: z.string(),
  editable: z.boolean(),
  kind: z.enum(['text', 'bundle']),
  /** Null for `bundle` files (the runner is listed, never sent to the client). */
  contents: z.string().nullable(),
  size_bytes: z.number().int(),
});
export type CiPreviewFile = z.infer<typeof CiPreviewFile>;

export const CiSecretLeak = z.object({
  path: z.string(),
  line: z.number().int(),
  /** The matched text with the secret masked. */
  masked: z.string(),
});
export type CiSecretLeak = z.infer<typeof CiSecretLeak>;

export const CiPreview = z.object({
  agent_slug: z.string(),
  workflow_path: z.string(),
  files: z.array(CiPreviewFile),
  context_docs_count: z.number().int(),
  github_token_configured: z.boolean(),
  leaks: z.array(CiSecretLeak),
});
export type CiPreview = z.infer<typeof CiPreview>;

/** Re-check the (possibly hand-edited) workflow text. */
export const CiCheckInput = CiPreviewInput.extend({
  workflow: z.string(),
});
export type CiCheckInput = z.infer<typeof CiCheckInput>;

export const CiRisk = z.object({
  kind: z.enum(['trigger', 'permission', 'fork_skip']),
  detail: z.string(),
  risk: z.boolean(),
});
export type CiRisk = z.infer<typeof CiRisk>;

export const CiCheckResult = z.object({
  yaml_error: z.object({ message: z.string(), line: z.number().int() }).nullable(),
  risks: z.array(CiRisk),
  leaks: z.array(CiSecretLeak),
});
export type CiCheckResult = z.infer<typeof CiCheckResult>;

export const CiSecretsStatus = z.object({
  github_token_configured: z.boolean(),
  openrouter_key: z.enum(['set', 'not_set', 'unknown']),
});
export type CiSecretsStatus = z.infer<typeof CiSecretsStatus>;

/** A run summary embedded in an installation (the latest collected one). */
export const CiRunItem = z.object({
  id: z.string(),
  repo: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  pr_url: z.string().nullable(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  installation_id: z.string().nullable(),
  verdict: z.enum(['approve', 'comment', 'request_changes', 'failed']),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  job_url: z.string().nullable(),
  ran_at: z.string(),
});
export type CiRunItem = z.infer<typeof CiRunItem>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  agent_slug: z.string(),
  workflow_path: z.string(),
  status: CiInstallationStatus,
  status_changed_at: z.string(),
  exported_agent_version: z.number().int(),
  triggers: z.array(CiTrigger),
  post_as: CiPostAs,
  pr_url: z.string().nullable(),
  latest_run: CiRunItem.nullable(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Request body for `POST /agents/:id/ci/install`. */
export const CiInstallInput = CiCheckInput.extend({
  action: z.enum(['open_pr', 'zip']),
  /** Must be true to install a workflow that `check` flagged as risky. */
  acknowledge_risk: z.boolean().default(false),
});
export type CiInstallInput = z.infer<typeof CiInstallInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiInstallInputBody = z.input<typeof CiInstallInput>;

export const CiInstallResult = z.object({
  installation: CiInstallation,
  pr_url: z.string().nullable(),
  files_count: z.number().int(),
  /** Base64 zip when `action='zip'`, else null. */
  zip_base64: z.string().nullable(),
});
export type CiInstallResult = z.infer<typeof CiInstallResult>;

/** One CI run with its reproducibility trace. */
export const CiRunDetail = CiRunItem.extend({
  model: z.string().nullable(),
  trace: CiTraceData.nullable(),
  head_sha: z.string().nullable(),
});
export type CiRunDetail = z.infer<typeof CiRunDetail>;

export const CiRunsPage = z.object({
  items: z.array(CiRunItem),
  next_cursor: z.string().nullable(),
});
export type CiRunsPage = z.infer<typeof CiRunsPage>;

export const CiRefreshResult = z.object({
  /** True when GitHub could not be fully read (rate limit, missing permission). */
  degraded: z.boolean(),
  message: z.string().nullable(),
});
export type CiRefreshResult = z.infer<typeof CiRefreshResult>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
