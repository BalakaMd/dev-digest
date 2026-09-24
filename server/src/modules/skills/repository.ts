import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import { INITIAL_SKILL_VERSION } from './constants.js';
import { isSkillConfigChange } from './helpers.js';

/**
 * Skills data-access. Owns `skills` and `skill_versions`. The `agent_skills`
 * link table is owned by the agents repository — this side only READS it, for
 * the agent count and the "which agents use this skill" lookup shown before a
 * delete. Workspace-scoped throughout.
 */

export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source?: SkillSource;
  body: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

/** A skill plus how many agents link it (the card's agent count). */
export interface SkillWithUsage {
  skill: SkillRow;
  agentCount: number;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  /**
   * All skills in a workspace, newest first, each with its link count. One
   * query with a LEFT JOIN + GROUP BY rather than a count per row.
   */
  async listWithUsage(workspaceId: string): Promise<SkillWithUsage[]> {
    const rows = await this.db
      .select({ skill: t.skills, agentCount: sql<number>`count(${t.agentSkills.agentId})::int` })
      .from(t.skills)
      .leftJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.skills.workspaceId, workspaceId))
      .groupBy(t.skills.id)
      .orderBy(desc(t.skills.createdAt));
    return rows.map((r) => ({ skill: r.skill, agentCount: r.agentCount }));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Ids that exist in this workspace, out of the given set (link validation). */
  async existingIds(workspaceId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, ids)));
    return new Set(rows.map((r) => r.id));
  }

  /** Insert a skill AND record version 1 (immutable body snapshot). */
  async insert(values: InsertSkill): Promise<SkillRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description,
          type: values.type,
          source: values.source ?? 'manual',
          body: values.body,
          enabled: values.enabled ?? true,
          version: INITIAL_SKILL_VERSION,
          evidenceFiles: values.evidenceFiles ?? null,
        })
        .returning();
      await tx
        .insert(t.skillVersions)
        .values({ skillId: row!.id, version: INITIAL_SKILL_VERSION, body: row!.body })
        .onConflictDoNothing();
      return row!;
    });
  }

  /**
   * Update a skill. A content change (anything but toggling `enabled`) bumps the
   * version and snapshots the new body into `skill_versions`, in one transaction
   * so a version number never exists without its snapshot.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
  ): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const contentChanged = isSkillConfigChange(existing, patch);
    const nextVersion = contentChanged ? existing.version + 1 : existing.version;

    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(contentChanged ? { version: nextVersion } : {}),
        })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();

      if (contentChanged && row) {
        await tx
          .insert(t.skillVersions)
          .values({ skillId: row.id, version: nextVersion, body: row.body })
          .onConflictDoNothing();
      }
      return row;
    });
  }

  /** Delete a skill; `agent_skills` and `skill_versions` cascade. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  // ---- skill_versions (immutable body snapshots) --------------------------

  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  // ---- read-only view of the link table (the agents module owns writes) ---

  /** Agents linking this skill, for the delete confirmation. */
  async linkedAgents(skillId: string): Promise<Array<{ id: string; name: string }>> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(eq(t.agentSkills.skillId, skillId))
      .orderBy(asc(t.agents.name));
  }
}
