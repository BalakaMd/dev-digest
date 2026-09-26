import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  doublePrecision,
  integer,
  vector,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/**
 * One scan of a repo by the conventions extractor. The newest row per repo backs
 * the "Detected from N sample files · last scan X ago" line and decides whether
 * the page offers "Run Scan" (no row yet) or "ReScan".
 */
export const conventionScans = pgTable(
  'convention_scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    sampleFiles: jsonb('sample_files').$type<string[]>().notNull(),
    proposed: integer('proposed').notNull(),
    kept: integer('kept').notNull(),
    droppedUnverified: integer('dropped_unverified').notNull(),
    mergedDuplicates: integer('merged_duplicates').notNull(),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    costUsd: doublePrecision('cost_usd'),
    createdAt: now(),
  },
  (t) => ({ repoIdx: index('convention_scans_repo_idx').on(t.repoId, t.createdAt) }),
);

/** Evidence a candidate was verified against: a real line range in a sampled file. */
export interface ConventionEvidenceRow {
  path: string;
  line_start: number;
  line_end: number;
  snippet: string;
}

export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scanId: uuid('scan_id').references(() => conventionScans.id, { onDelete: 'set null' }),
    category: text('category').notNull(),
    rule: text('rule').notNull(),
    // Primary evidence, denormalised for export (PluginConvention) and list views.
    evidencePath: text('evidence_path'),
    evidenceSnippet: text('evidence_snippet'),
    lineStart: integer('line_start'),
    lineEnd: integer('line_end'),
    // Every verified evidence, primary first.
    evidence: jsonb('evidence').$type<ConventionEvidenceRow[]>().notNull(),
    // `confidence` is after code verification; `model_confidence` is what the model said.
    confidence: doublePrecision('confidence'),
    modelConfidence: doublePrecision('model_confidence'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    repoStatusIdx: index('conventions_repo_status_idx').on(t.repoId, t.status),
    wsIdx: index('conventions_ws_idx').on(t.workspaceId),
    statusCk: check('conventions_status_ck', sql`${t.status} in ('pending', 'accepted', 'rejected')`),
  }),
);
