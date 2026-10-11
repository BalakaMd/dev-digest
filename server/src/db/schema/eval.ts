import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { findings } from './reviews';
import { agents } from './agents';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    name: text('name').notNull(),
    inputDiff: text('input_diff'),
    inputFiles: jsonb('input_files'),
    inputMeta: jsonb('input_meta'),
    expectedOutput: jsonb('expected_output'),
    notes: text('notes'),
    createdAt: now(),
    // The finding a case was made from; at most one case per finding (AC-9).
    sourceFindingId: uuid('source_finding_id').references(() => findings.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('eval_cases_owner_created_idx').on(t.ownerId, t.createdAt, t.id),
    uniqueIndex('eval_cases_source_finding_uidx')
      .on(t.sourceFindingId)
      .where(sql`${t.sourceFindingId} is not null`),
  ],
);

/** One scored execution of an agent over all its cases (run-level record). */
export const evalSuiteRuns = pgTable(
  'eval_suite_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    agentVersion: integer('agent_version').notNull(),
    status: text('status', { enum: ['running', 'done', 'failed'] }).notNull(),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    casesTotal: integer('cases_total').notNull().default(0),
    casesDone: integer('cases_done').notNull().default(0),
    casesErrored: integer('cases_errored').notNull().default(0),
    casesPassed: integer('cases_passed').notNull().default(0),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    costUsd: doublePrecision('cost_usd'),
    durationMs: integer('duration_ms'),
  },
  (t) => [
    index('eval_suite_runs_agent_started_idx').on(t.agentId, t.startedAt.desc()),
    // At most one run in progress per agent (AC-19, atomic).
    uniqueIndex('eval_suite_runs_one_running_uidx')
      .on(t.agentId)
      .where(sql`${t.status} = 'running'`),
  ],
);

/** One case's result. `suite_run_id` NULL = a single-case run (AC-51), not part of any history. */
export const evalRuns = pgTable('eval_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Nullable + SET NULL: a deleted case keeps its run history (EC-9).
  caseId: uuid('case_id').references(() => evalCases.id, { onDelete: 'set null' }),
  suiteRunId: uuid('suite_run_id').references(() => evalSuiteRuns.id, { onDelete: 'cascade' }),
  caseName: text('case_name'),
  status: text('status', { enum: ['ok', 'error'] }).notNull().default('ok'),
  error: text('error'),
  expectedSnapshot: jsonb('expected_snapshot'),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
  actualOutput: jsonb('actual_output'),
  pass: boolean('pass'),
  recall: doublePrecision('recall'),
  precision: doublePrecision('precision'),
  citationAccuracy: doublePrecision('citation_accuracy'),
  durationMs: integer('duration_ms'),
  costUsd: doublePrecision('cost_usd'),
  findingsReturned: integer('findings_returned').notNull().default(0),
  findingsKept: integer('findings_kept').notNull().default(0),
  mustFindTotal: integer('must_find_total').notNull().default(0),
  mustFindMatched: integer('must_find_matched').notNull().default(0),
  mustNotFlagHits: integer('must_not_flag_hits').notNull().default(0),
});

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
