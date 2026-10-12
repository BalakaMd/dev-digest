import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  unique,
} from 'drizzle-orm/pg-core';
import { agents } from './agents';

export const ciInstallations = pgTable(
  'ci_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repo: text('repo').notNull(),
    targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
    /** Repo-unique slug used in file names; stable across agent renames. */
    agentSlug: text('agent_slug').notNull(),
    /** Manifest agent name at last export (matches results to this installation). */
    agentName: text('agent_name').notNull(),
    workflowPath: text('workflow_path').notNull(),
    status: text('status', {
      enum: ['pr_open', 'pr_closed', 'awaiting_manual', 'installed'],
    }).notNull(),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }).defaultNow().notNull(),
    exportedAgentVersion: integer('exported_agent_version').notNull(),
    triggers: jsonb('triggers').$type<string[]>().notNull(),
    postAs: text('post_as', { enum: ['github_review', 'pr_comment', 'none'] }).notNull(),
    prUrl: text('pr_url'),
    prNumber: integer('pr_number'),
    /** Collection watermark: next refresh reads runs created after it (minus a margin). */
    lastCollectedAt: timestamp('last_collected_at', { withTimezone: true }),
  },
  (t) => [unique('ci_installations_agent_repo_uniq').on(t.agentId, t.repo)],
);

export const ciRuns = pgTable('ci_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
    onDelete: 'set null',
  }),
  prNumber: integer('pr_number'),
  ranAt: timestamp('ran_at', { withTimezone: true }),
  status: text('status'),
  findingsCount: integer('findings_count'),
  costUsd: doublePrecision('cost_usd'),
  githubUrl: text('github_url'),
  source: text('source'),
});
