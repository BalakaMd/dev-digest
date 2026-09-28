import type { IntentSource, IntentConfidence, PrIntentRecord } from '@devdigest/shared';

export interface PullContext {
  prId: string;
  number: number;
  title: string;
  body: string | null;
  headSha: string;
  repo: { owner: string; name: string };
  files: { path: string; patch: string | null }[];
}

/** Persisted intent fields — everything `PrIntentRecord` has except `stale`. */
export interface StoredIntentFields {
  pr_id: string;
  summary: string;
  in_scope: string[];
  out_of_scope: string[];
  confidence: IntentConfidence;
  sources: IntentSource[];
  head_sha: string | null;
  provider: string | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  derived_at: string;
}

export interface UpsertIntentValues {
  summary: string;
  inScope: string[];
  outOfScope: string[];
  confidence: string;
  sources: IntentSource[];
  headSha: string;
  provider: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  promptTokensEst: number | null;
}

/**
 * Minimal structured logger the intent service logs through. `RunLogger`
 * (`platform/run-logger.ts`) already has `info(msg, data?)` / `error(msg,
 * data?)` and satisfies this STRUCTURALLY — no import needed here, keeping
 * ring 3 free of a `platform/run-logger` dependency. The HTTP path adapts
 * `req.log` (pino) into this shape via `helpers.ts#fromPino`.
 */
export interface IntentLog {
  info(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

/**
 * The facade `run-executor.ts` reaches through `container.intent` — the ONLY
 * way another module may use this one (never `modules/intent/*` directly).
 */
export interface IntentFacade {
  /** Stored intent for a PR, with `stale` computed against the current head SHA. Null when never derived. */
  get(workspaceId: string, prId: string): Promise<PrIntentRecord | null>;
  /** Derive, persist and return a fresh intent. Throws on failure (route maps it to an AppError). */
  derive(workspaceId: string, prId: string, log?: IntentLog): Promise<PrIntentRecord>;
  /**
   * The stored intent, or a best-effort derive when none exists. NEVER
   * throws — a review must never fail because the intent couldn't be
   * derived; returns `undefined` and logs on any failure.
   */
  getForReview(workspaceId: string, prId: string, log?: IntentLog): Promise<PrIntentRecord | undefined>;
}

/**
 * The public surface of `IntentRepository` — `IntentService` depends on this
 * (not the concrete class) so a unit test can inject an in-memory fake without
 * a real `Db`. `IntentRepository` satisfies it structurally.
 */
export interface IntentRepositoryPort {
  getPullContext(workspaceId: string, prId: string): Promise<PullContext | undefined>;
  getPullHeadSha(workspaceId: string, prId: string): Promise<string | undefined>;
  getIntent(workspaceId: string, prId: string): Promise<StoredIntentFields | undefined>;
  /** Writes only when `prId` belongs to `workspaceId`; returns `undefined` otherwise (no write). */
  upsert(workspaceId: string, prId: string, values: UpsertIntentValues): Promise<StoredIntentFields | undefined>;
}

/** One source considered while assembling the classifier prompt (internal — the persisted/contract shape is `IntentSource`). */
export interface ResolvedSource {
  kind: 'title' | 'description' | 'files' | 'issue' | 'plan' | 'spec' | 'link';
  ref: string;
  status: 'used' | 'truncated' | 'unreachable' | 'unsupported' | 'skipped';
  bytes: number | null;
  detail: string | null;
}
