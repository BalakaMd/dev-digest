import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  primaryKey,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    type: text('type', { enum: ['rubric', 'convention', 'security', 'custom'] }).notNull(),
    // 'imported' = uploaded through the import flow (.md / .zip), after preview.
    source: text('source', {
      enum: ['manual', 'imported', 'imported_url', 'extracted', 'community'],
    }).notNull(),
    body: text('body').notNull(),
    // Global kill-switch: a disabled skill reaches no agent's prompt.
    enabled: boolean('enabled').notNull().default(true),
    version: integer('version').notNull().default(1),
    evidenceFiles: jsonb('evidence_files').$type<string[]>(),
    createdAt: now(),
  },
  (t) => ({
    // Every read is workspace-scoped; Postgres does not index foreign keys itself.
    workspaceIdx: index('skills_workspace_idx').on(t.workspaceId),
    // `text({ enum })` narrows TypeScript only — mirror the contract enums in the DB.
    typeCk: check('skills_type_ck', sql`${t.type} in ('rubric', 'convention', 'security', 'custom')`),
    sourceCk: check(
      'skills_source_ck',
      sql`${t.source} in ('manual', 'imported', 'imported_url', 'extracted', 'community')`,
    ),
  }),
);

export const skillVersions = pgTable(
  'skill_versions',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.version] }) }),
);
