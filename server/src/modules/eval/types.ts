import type {
  AgentVersionConfig,
  EvalExpectation,
  LLMProvider,
  Provider,
  ReviewStrategy,
  UnifiedDiff,
} from '@devdigest/shared';
import type { EvalRepository } from './repository.js';

/**
 * Types shared by the pure eval functions (scoring, compare, helpers) and the
 * ports the eval service reaches outside its module through. The module does not
 * import another module's folder, so the ports are declared here.
 */

// ------------------------------------------------------------------ scoring

/** The part of a finding the scorer reads. Notes (title, severity, ...) are never looked at (AC-69). */
export interface ScorableFinding {
  file: string;
  start_line: number;
  end_line: number;
}

export interface ScoreCaseInput {
  expectations: EvalExpectation[];
  /** Findings that passed the grounding gate. */
  kept: ScorableFinding[];
  /** Findings dropped by the grounding gate. */
  dropped: ScorableFinding[];
}

export interface ExpectationMatchResult {
  expectation_index: number;
  matched: boolean;
  /** Indexes into `kept`. */
  finding_indexes: number[];
}

export interface CaseScore {
  /** AC-25. */
  passed: boolean;
  /** `kept.length + dropped.length`. */
  findings_returned: number;
  findings_kept: number;
  must_find_total: number;
  must_find_matched: number;
  /** Kept findings that match at least one `must_not_flag` expectation (each counted once). */
  must_not_flag_hits: number;
  /** Per kept finding: matched any expectation. */
  finding_matched: boolean[];
  expectation_matches: ExpectationMatchResult[];
}

/** What the run scorer needs from one case result. */
export interface CaseCounters {
  status: 'ok' | 'error';
  passed: boolean | null;
  findings_returned: number;
  findings_kept: number;
  must_find_total: number;
  must_find_matched: number;
  must_not_flag_hits: number;
  cost_usd: number | null;
}

export interface RunScore {
  /** Non-error cases. */
  cases_scored: number;
  cases_errored: number;
  cases_passed: number;
  /** Fractions 0..1; `null` = denominator 0 (AC-63). */
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  /** Sum of the cost of scored cases; `null` if any scored case has an unknown cost, or none was scored (AC-76). */
  cost_usd: number | null;
}

// ------------------------------------------------------------------ compare

/** A case result row of a run, as the compare needs it. */
export interface CompareCaseRow extends CaseCounters {
  case_id: string | null;
  case_name: string;
  expectation_types: Array<'must_find' | 'must_not_flag'>;
}

/** The agent config the diff is computed on (subset of the version snapshot). */
export type ConfigSnapshot = Pick<
  AgentVersionConfig,
  'provider' | 'model' | 'system_prompt' | 'skills'
>;

// --------------------------------------------------------------- service ports

/** Diff + PR text for a finding's PR (real diff of base...head, else `pr_files`). */
export interface EvalPrDiff {
  diffRaw: string;
  title: string;
  body: string | null;
}

/** The agent fields an eval run reads (no drizzle row crosses the module boundary). */
export interface EvalAgent {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
  enabled: boolean;
  version: number;
}

/** Agents port, wired to `AgentsRepository` in `platform/container.ts`. */
export interface EvalAgentsPort {
  getById(workspaceId: string, agentId: string): Promise<EvalAgent | undefined>;
  listEnabled(workspaceId: string): Promise<EvalAgent[]>;
  /** Make sure the agent's CURRENT version has a snapshot row (seeded agents have none until edited). */
  ensureVersionSnapshot(workspaceId: string, agentId: string): Promise<void>;
  /** The stored config of one version, or undefined. */
  versionConfig(agentId: string, version: number): Promise<ConfigSnapshot | undefined>;
  /** Enabled linked skills in link order. */
  enabledSkills(agentId: string): Promise<Array<{ name: string; body: string }>>;
  /** Display name of a skill, undefined when it no longer exists. */
  skillName(workspaceId: string, skillId: string): Promise<string | undefined>;
}

/** The decision a user can take on a finding; "cleared" is deliberately not part of it. */
export type FindingDecision = 'accepted' | 'dismissed';

/** What the service needs to know about a finding (AC-1, AC-2, AC-7). */
export interface EvalFindingFacts {
  workspaceId: string;
  prId: string;
  /** The agent that produced the finding's review; null when unknown. */
  agentId: string | null;
  title: string;
  /** Untrusted text: used only as literal search terms by the suggestion (NFR-3). */
  rationale: string;
  /** `finding`, `secret_leak`, `lethal_trifecta`, `phantom`, `hook`, ... */
  kind: string;
  file: string;
  startLine: number;
  endLine: number;
  severity: string;
  category: string;
  accepted: boolean;
  dismissed: boolean;
}

export interface EvalFindingsPort {
  facts(findingId: string): Promise<EvalFindingFacts | undefined>;
}

export interface EvalPrDiffPort {
  /** Diff + PR text of a PR (real `git diff base...head`, else `pr_files`); undefined when the PR is gone. */
  forPull(workspaceId: string, prId: string): Promise<EvalPrDiff | undefined>;
}

/** Function and block ranges of a source fragment; lines are 1-based relative to the fragment. */
export interface EvalStructure {
  functions: Array<{ name: string | null; start: number; end: number }>;
  blocks: Array<{ start: number; end: number }>;
}

export interface EvalStructurePort {
  /** `null` = file type unsupported or the source cannot be parsed (SPEC-07 AC-13). */
  analyze(file: string, source: string): EvalStructure | null;
}

/** Ports the service is wired with in `platform/container.ts`. */
export interface EvalServiceDeps {
  repo: EvalRepository;
  agents: EvalAgentsPort;
  findings: EvalFindingsPort;
  prDiff: EvalPrDiffPort;
  structure: EvalStructurePort;
  parseDiff: (raw: string) => UnifiedDiff;
  /** Renders one skill as a prompt block (`### name\nbody`). */
  skillBlock: (skill: { name: string; body: string }) => string;
  llm: (id: Provider) => Promise<LLMProvider>;
  /** The name of the missing secret for this provider (e.g. `OPENAI_API_KEY`), or null when it is configured. */
  missingKey: (provider: Provider) => Promise<string | null>;
  now: () => Date;
}

/** The agent configuration frozen at run start (AC-14): nothing else reaches the model. */
export interface EvalRunConfig {
  agentId: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
  /** Rendered skill blocks, in link order. */
  skills: string[];
}
