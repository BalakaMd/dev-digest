import type {
  CiInstallationStatus,
  CiPostAs,
  CiRunDetail,
  CiRunItem,
  CiTraceData,
  CiTrigger,
  CiFailOn,
  GitHubClient,
  Provider,
  ReviewStrategy,
} from '@devdigest/shared';
import type { RunnerBundle } from '../../adapters/runner-bundle/types.js';

/**
 * Ports and plain types of the ci module. The service reaches outside the module
 * only through these (never the Container); the composition root builds them from
 * other modules' repositories.
 */

/** Pino-compatible (obj-first) logger subset. */
export interface CiLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

/** The saved agent row the export is built from. */
export interface CiAgent {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
  /** Saved agent version number. */
  version: number;
  contextDocsCount: number;
}

/** A skill linked to the agent, in skill order. */
export interface CiSkill {
  name: string;
  body: string;
}

export interface CiAgentsPort {
  getById(workspaceId: string, id: string): Promise<CiAgent | undefined>;
  /** Linked skills in skill order. */
  linkedSkills(agentId: string): Promise<CiSkill[]>;
}

/** A persisted installation (mirrors `ci_installations`, dates as `Date`). */
export interface CiInstallationRecord {
  id: string;
  agentId: string;
  repo: string;
  targetType: 'gha' | 'circle' | 'jenkins' | 'cli';
  agentSlug: string;
  /** Manifest agent name at the last export; results are matched on it (Q-3). */
  agentName: string;
  workflowPath: string;
  status: CiInstallationStatus;
  statusChangedAt: Date;
  installedAt: Date;
  exportedAgentVersion: number;
  triggers: CiTrigger[];
  postAs: CiPostAs;
  prUrl: string | null;
  prNumber: number | null;
  lastCollectedAt: Date | null;
}

export interface UpsertInstallationInput {
  agentId: string;
  repo: string;
  agentSlug: string;
  agentName: string;
  workflowPath: string;
  status: CiInstallationStatus;
  exportedAgentVersion: number;
  triggers: CiTrigger[];
  postAs: CiPostAs;
  prUrl: string | null;
  prNumber: number | null;
  now: Date;
}

/** One CI run to store (`agent_runs` with `source='ci'`). */
export interface InsertCiRunInput {
  agentId: string;
  installationId: string;
  repo: string;
  prNumber: number | null;
  actionsRunId: string;
  actionsRunAttempt: number;
  actionsJobUrl: string | null;
  headSha: string | null;
  ranAt: Date;
  status: 'done' | 'failed';
  model: string | null;
  durationMs: number | null;
  costUsd: number | null;
  findingsCount: number | null;
  blockers: number | null;
  verdict: 'approve' | 'comment' | 'request_changes' | null;
  trace: CiTraceData | null;
}

export interface CiRunsKeyset {
  ranAt: Date;
  id: string;
}

export interface ListCiRunsQuery {
  limit: number;
  after?: CiRunsKeyset;
  installationId?: string;
  agentId?: string;
}

export interface CiRunsSlice {
  items: CiRunItem[];
  /** Keyset of the last item when more rows follow, else null. */
  next: CiRunsKeyset | null;
}

/**
 * Data-access port of the ci module. Every method is scoped to a workspace
 * (installations through their agent, runs by `workspace_id`).
 */
export interface CiRepositoryPort {
  isImportedRepo(workspaceId: string, fullName: string): Promise<boolean>;

  getInstallation(workspaceId: string, agentId: string, repo: string): Promise<CiInstallationRecord | undefined>;
  getInstallationById(workspaceId: string, id: string): Promise<CiInstallationRecord | undefined>;
  listInstallations(workspaceId: string): Promise<CiInstallationRecord[]>;
  listInstallationsForAgent(workspaceId: string, agentId: string): Promise<CiInstallationRecord[]>;
  listInstallationsForRepo(workspaceId: string, repo: string): Promise<CiInstallationRecord[]>;
  upsertInstallation(workspaceId: string, input: UpsertInstallationInput): Promise<CiInstallationRecord>;
  updateStatus(workspaceId: string, id: string, status: CiInstallationStatus, now: Date): Promise<void>;
  touchCollected(workspaceId: string, id: string, at: Date): Promise<void>;

  /** Insert one CI run; false when a row for (repo, run, attempt) already exists. */
  insertCiRun(workspaceId: string, input: InsertCiRunInput): Promise<boolean>;
  ciRunExists(workspaceId: string, repo: string, actionsRunId: string, attempt: number): Promise<boolean>;
  listCiRuns(workspaceId: string, query: ListCiRunsQuery): Promise<CiRunsSlice>;
  getCiRun(workspaceId: string, id: string): Promise<CiRunDetail | undefined>;
  /** Latest CI run per installation id (installations without a run are absent). */
  latestRunByInstallation(workspaceId: string, installationIds: string[]): Promise<Map<string, CiRunItem>>;
}

export interface CiSecretsPort {
  /** True when a secret of that name is configured in the studio (value never read out). */
  has(name: string): Promise<boolean>;
}

export interface CiServiceDeps {
  repo: CiRepositoryPort;
  agents: CiAgentsPort;
  secrets: CiSecretsPort;
  github: () => Promise<GitHubClient>;
  bundle: RunnerBundle;
  now: () => Date;
}
