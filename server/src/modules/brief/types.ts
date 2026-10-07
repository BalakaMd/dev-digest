import type {
  GitHubClient,
  Intent,
  LLMProvider,
  PrBlastRadiusResponse,
  Provider,
  PrBrief,
  PrBriefResponse,
  SmartDiffRole,
  TourLanguage,
} from '@devdigest/shared';

/** One changed file of the PR as stored (`pr_files`). */
export interface PullFileFact {
  path: string;
  additions: number;
  deletions: number;
  /** Raw unified patch; `null` for binary / too-large files. Never sent to the model (only its hunk headers). */
  patch: string | null;
}

/** The PR as the brief service needs it. */
export interface PullFacts {
  prId: string;
  number: number;
  title: string;
  body: string | null;
  /** `pull_requests.head_sha` (Q-2). */
  headSha: string;
  repo: { id: string; owner: string; name: string };
  files: PullFileFact[];
}

/** One finding of the latest completed review of an agent (AC-23). */
export interface FindingFact {
  file: string;
  line: number | null;
  title: string;
  severity: string;
}

/** Persistence port — implemented by the brief repository, faked in tests. */
export interface BriefRepositoryPort {
  getPull(workspaceId: string, prId: string): Promise<PullFacts | undefined>;
  /** Lean existence check + current head SHA; `undefined` when the PR is not in the workspace. */
  getHeadSha(workspaceId: string, prId: string): Promise<string | undefined>;
  /** Stored brief of the PR; `undefined` when none, or the stored JSON no longer validates. */
  getStored(workspaceId: string, prId: string): Promise<PrBrief | undefined>;
  /** Upsert, replacing any earlier brief; returns false when the PR is not in the workspace. */
  save(workspaceId: string, prId: string, brief: PrBrief): Promise<boolean>;
  /** The workspace-wide "Tour language" setting, `undefined` when never set or invalid. */
  getTourLanguage(workspaceId: string): Promise<TourLanguage | undefined>;
}

/** Pino-compatible (obj-first) logger subset. */
export interface BriefLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

/** Reference to the first issue named in the PR description. */
export interface IssueRef {
  owner: string;
  name: string;
  number: number;
}

/** Everything the service reaches outside its module through — wired in `platform/container.ts`. */
export interface BriefServiceDeps {
  repo: BriefRepositoryPort;
  /** Stored Intent only; the service never derives one (AC-10). */
  intent: { get(workspaceId: string, prId: string): Promise<Intent | null> };
  blast: { getForPull(workspaceId: string, prId: string): Promise<PrBlastRadiusResponse> };
  /** Findings of the latest completed review of each agent. */
  findings: (workspaceId: string, prId: string) => Promise<FindingFact[]>;
  /** Repo-relative paths of the specification documents of every enabled agent and its enabled skills. */
  specPaths: (workspaceId: string) => Promise<string[]>;
  /** The effective document (local copy over repository); throws when unreadable. */
  readSpecDoc: (repo: PullFacts['repo'], path: string) => Promise<string>;
  /** First issue referenced in the PR description under the Intent layer's rules. */
  firstIssueRef: (body: string | null, repo: { owner: string; name: string }) => IssueRef | null;
  github: () => Promise<GitHubClient>;
  llm: (id: Provider) => Promise<LLMProvider>;
  resolveModel: (workspaceId: string) => Promise<{ provider: Provider; model: string }>;
  hasSecret: (provider: Provider) => Promise<boolean>;
  classify: (path: string) => SmartDiffRole;
  countTokens: (text: string) => number;
  now: () => Date;
}

/** Facade the routes reach through `container.brief`. */
export interface BriefFacade {
  get(workspaceId: string, prId: string): Promise<PrBriefResponse>;
  generate(workspaceId: string, prId: string, log?: BriefLogger): Promise<PrBriefResponse>;
}

// ---------------------------------------------------------------- prompt facts

/** `@@ -a,b +c,d @@ text` — ranges plus the full header line, never a body line. */
export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** The full header line, trimmed and capped. */
  header: string;
}

export interface PromptFile {
  path: string;
  additions: number;
  deletions: number;
  role: SmartDiffRole;
  hunks: Hunk[];
}

export interface PromptCaller {
  symbol: string;
  file: string;
  line: number;
}

/** Everything the user message is built from. Blast is `null` when degraded / unavailable. */
export interface PromptInput {
  language: TourLanguage;
  title: string;
  description: string | null;
  intent: Intent | null;
  blast: { summary: string; callers: PromptCaller[] } | null;
  totals: { files: number; additions: number; deletions: number };
  files: PromptFile[];
  findings: FindingFact[];
  issue: { title: string; body: string } | null;
  /** Effective documents; `fitToBudget` sorts them by path ascending. */
  specs: { path: string; content: string }[];
}

export type BudgetSource =
  | 'system'
  | 'title'
  | 'description'
  | 'intent'
  | 'blast'
  | 'totals'
  | 'files'
  | 'findings'
  | 'issue'
  | 'specs';

export type FitResult =
  | {
      ok: true;
      user: string;
      /** Measured `count(system) + count(user)`. */
      total: number;
      /** Tokens per input source, counted on each rendered section. */
      tokensBySource: Partial<Record<BudgetSource, number>>;
      shortened: PrBrief['shortened_inputs'];
    }
  | {
      ok: false;
      reason: 'over_budget';
      /** Tokens of the never-shortened inputs alone (system + title + Intent + totals + fixed parts). */
      fixedTokens: number;
    };
