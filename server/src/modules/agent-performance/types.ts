/** Plain internal types of the agent-performance module (the HTTP contract lives in @devdigest/shared). */

export type RunSource = 'local' | 'ci';
export type StoredCostSource = 'provider' | 'estimate' | 'mixed';

/** The slim facts of one stored agent run that the aggregation needs. */
export interface RunFact {
  id: string;
  /** Null once the agent was deleted. */
  agentId: string | null;
  ranAt: Date;
  status: string | null;
  source: RunSource;
  costUsd: number | null;
  /** Null on runs that predate the column and on every CI run (read as 'unknown'). */
  costSource: StoredCostSource | null;
  durationMs: number | null;
  model: string | null;
}

/** Decisions on the findings of the review produced by one run. */
export interface DecisionCount {
  runId: string;
  accepted: number;
  dismissed: number;
  undecided: number;
}

export interface LastRun {
  agentId: string;
  at: Date;
}

export interface AgentRef {
  id: string;
  name: string;
  enabled: boolean;
}

export interface RepoRef {
  id: string;
  fullName: string;
}

/** Half-open range: `from` inclusive, `to` exclusive. */
export interface TimeRange {
  from: Date;
  to: Date;
}

/** Persistence port: every method is scoped to the workspace and has a total ORDER BY. */
export interface PerformanceRepo {
  getRepo(workspaceId: string, repoId: string): Promise<RepoRef | undefined>;
  getAgent(workspaceId: string, agentId: string): Promise<AgentRef | undefined>;
  listAgents(workspaceId: string): Promise<AgentRef[]>;
  listRunFacts(workspaceId: string, repo: RepoRef, range: TimeRange, agentId?: string): Promise<RunFact[]>;
  decisionCounts(workspaceId: string, repo: RepoRef, range: TimeRange, agentId?: string): Promise<DecisionCount[]>;
  lastRuns(workspaceId: string, repo: RepoRef, statuses: readonly string[], agentId?: string): Promise<LastRun[]>;
}

export interface AgentPerformanceDeps {
  repo: PerformanceRepo;
}
