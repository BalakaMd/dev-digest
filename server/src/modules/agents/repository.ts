import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { AgentVersionConfig } from '@devdigest/shared';
import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';
import { DEFAULT_AGENT_DESCRIPTION, INITIAL_AGENT_VERSION } from './constants.js';
import { isConfigChange } from './helpers.js';

/**
 * A2 — agents data-access. Owns `agents`, `agent_versions`, and the
 * `agent_skills` link table (shared with A1's skills repository, but A2 owns the
 * agent side: link/reorder/list for an agent). Workspace-scoped throughout.
 */

import type { AgentRow, AgentVersionRow } from '../../db/rows.js';
export type { AgentRow, AgentVersionRow };

export interface InsertAgent {
  workspaceId: string;
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
  createdBy?: string | null;
}

export interface UpdateAgent {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
}

/** Per-workspace attachment overview used for document usage/coverage. */
export interface ContextAttachmentSkill {
  id: string;
  name: string;
  enabled: boolean;
  docs: string[];
}
export interface ContextAttachments {
  agents: Array<{
    id: string;
    name: string;
    enabled: boolean;
    docs: string[];
    skills: ContextAttachmentSkill[];
  }>;
  skills: Array<{ id: string; name: string; docs: string[] }>;
}

/** A skill linked to an agent (with its order), joined from agent_skills. */
export interface LinkedSkillRow {
  skill: typeof t.skills.$inferSelect;
  order: number;
}

/** Outcome of `restoreVersion`; failures are values so the service picks the HTTP mapping. */
export type RestoreVersionResult =
  | { kind: 'agent_not_found' }
  | { kind: 'version_not_found' }
  | { kind: 'is_current' }
  | { kind: 'restored'; row: AgentRow; skippedSkillIds: string[] };

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export class AgentsRepository {
  constructor(private db: Db) {}

  /**
   * Oldest first, with a name/id tie-break for rows created in one seed. The
   * ORDER BY is load-bearing: without it Postgres returns heap order, and an
   * UPDATE writes a new row version at the end — so toggling or editing an
   * agent would move it to the bottom of every list.
   */
  private readonly listOrder = [asc(t.agents.createdAt), asc(t.agents.name), asc(t.agents.id)];

  async list(workspaceId: string): Promise<AgentRow[]> {
    return this.db
      .select()
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(...this.listOrder);
  }

  async listEnabled(workspaceId: string): Promise<AgentRow[]> {
    return this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)))
      .orderBy(...this.listOrder);
  }

  /** Linked-skill count per agent in a workspace (agents with none are absent). */
  async skillCounts(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ agentId: t.agentSkills.agentId, count: sql<number>`count(*)::int` })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(eq(t.agents.workspaceId, workspaceId))
      .groupBy(t.agentSkills.agentId);
    return new Map(rows.map((r) => [r.agentId, r.count]));
  }

  async getById(workspaceId: string, id: string): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
    return row;
  }

  /** Delete an agent (scoped to workspace). Versions/skill-links cascade;
   *  agent_runs keep their history with agent_id set null. Returns false if
   *  no such agent existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning({ id: t.agents.id });
    return rows.length > 0;
  }

  /** Insert an agent AND record version 1 in agent_versions (immutable snapshot). */
  async insert(values: InsertAgent): Promise<AgentRow> {
    const [row] = await this.db
      .insert(t.agents)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description ?? DEFAULT_AGENT_DESCRIPTION,
        provider: values.provider,
        model: values.model,
        systemPrompt: values.systemPrompt,
        outputSchema: (values.outputSchema as object | undefined) ?? null,
        ...(values.strategy !== undefined ? { strategy: values.strategy } : {}),
        ...(values.ciFailOn !== undefined ? { ciFailOn: values.ciFailOn } : {}),
        ...(values.repoIntel !== undefined ? { repoIntel: values.repoIntel } : {}),
        enabled: values.enabled ?? true,
        version: INITIAL_AGENT_VERSION,
        createdBy: values.createdBy ?? null,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_AGENT_VERSION);
    return row!;
  }

  /**
   * Update an agent. Any config change bumps the version and snapshots the new
   * config into agent_versions (reproducibility for eval).
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgent,
  ): Promise<AgentRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    // A config-affecting change (anything except just toggling enabled) bumps version.
    const configChanged = isConfigChange(existing, patch);
    const nextVersion = configChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.agents)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
        ...(patch.model !== undefined ? { model: patch.model } : {}),
        ...(patch.systemPrompt !== undefined ? { systemPrompt: patch.systemPrompt } : {}),
        ...(patch.outputSchema !== undefined
          ? { outputSchema: patch.outputSchema as object }
          : {}),
        ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
        ...(patch.ciFailOn !== undefined ? { ciFailOn: patch.ciFailOn } : {}),
        ...(patch.repoIntel !== undefined ? { repoIntel: patch.repoIntel } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(configChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning();

    if (configChanged && row) await this.snapshotVersion(row, nextVersion);
    return row;
  }

  /**
   * Bump the agent's version and snapshot it, because its skill links changed.
   * Linking, unlinking and reordering all change the assembled prompt, so they
   * are config changes in the same sense as editing the system prompt — without
   * this, two runs of "v3" could have used different skills.
   */
  private async bumpForSkillChange(agentId: string): Promise<void> {
    const [row] = await this.db
      .update(t.agents)
      .set({ version: sql`${t.agents.version} + 1` })
      .where(eq(t.agents.id, agentId))
      .returning();
    if (row) await this.snapshotVersion(row, row.version);
  }

  /**
   * Replace the agent's attached context documents. A changed list bumps the
   * version and snapshots it (the ordered paths ride in the snapshot); an equal
   * list is a no-op. Returns undefined when the agent is not in the workspace.
   */
  async setContextDocs(
    workspaceId: string,
    id: string,
    paths: string[],
  ): Promise<AgentRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;
    const current = existing.contextDocs ?? [];
    if (current.length === paths.length && current.every((p, i) => p === paths[i])) {
      return existing;
    }
    const [row] = await this.db
      .update(t.agents)
      .set({ contextDocs: paths, version: existing.version + 1 })
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning();
    if (row) await this.snapshotVersion(row, row.version);
    return row;
  }

  /**
   * Every agent and skill of the workspace with its attached documents and the
   * agent's linked skills (in link order). Total ORDER BY throughout.
   */
  async contextAttachments(workspaceId: string): Promise<ContextAttachments> {
    const [agentRows, skillRows, linkRows] = await Promise.all([
      this.db
        .select()
        .from(t.agents)
        .where(eq(t.agents.workspaceId, workspaceId))
        .orderBy(...this.listOrder),
      this.db
        .select()
        .from(t.skills)
        .where(eq(t.skills.workspaceId, workspaceId))
        .orderBy(asc(t.skills.name), asc(t.skills.id)),
      this.db
        .select({ agentId: t.agentSkills.agentId, skillId: t.agentSkills.skillId })
        .from(t.agentSkills)
        .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
        .where(eq(t.agents.workspaceId, workspaceId))
        .orderBy(asc(t.agentSkills.agentId), asc(t.agentSkills.order), asc(t.agentSkills.skillId)),
    ]);
    const skillById = new Map(skillRows.map((s) => [s.id, s]));
    const linksByAgent = new Map<string, ContextAttachmentSkill[]>();
    for (const l of linkRows) {
      const s = skillById.get(l.skillId);
      if (!s) continue;
      const list = linksByAgent.get(l.agentId) ?? [];
      list.push({ id: s.id, name: s.name, enabled: s.enabled, docs: s.contextDocs ?? [] });
      linksByAgent.set(l.agentId, list);
    }
    return {
      agents: agentRows.map((a) => ({
        id: a.id,
        name: a.name,
        enabled: a.enabled,
        docs: a.contextDocs ?? [],
        skills: linksByAgent.get(a.id) ?? [],
      })),
      skills: skillRows.map((s) => ({ id: s.id, name: s.name, docs: s.contextDocs ?? [] })),
    };
  }

  /**
   * Make sure the agent's CURRENT version has a snapshot row. Seeded agents have
   * none until their first edit (`db/seed.ts` inserts into `agents` only), and
   * eval runs / Promote reference a version by number. Idempotent.
   */
  async ensureVersionSnapshot(row: AgentRow): Promise<void> {
    await this.snapshotVersion(row, row.version);
  }

  private async snapshotVersion(
    row: AgentRow,
    version: number,
    ex: Db | Tx = this.db,
    skillIds?: string[],
  ): Promise<void> {
    const skills = skillIds ?? (await this.skillIdsForAgent(row.id));
    await ex
      .insert(t.agentVersions)
      .values({
        agentId: row.id,
        version,
        configJson: {
          provider: row.provider,
          model: row.model,
          system_prompt: row.systemPrompt,
          output_schema: row.outputSchema,
          strategy: row.strategy,
          ci_fail_on: row.ciFailOn,
          repo_intel: row.repoIntel,
          skills,
          context_docs: row.contextDocs ?? [],
        },
      })
      .onConflictDoNothing();
  }

  /**
   * Promote: make the config of snapshot `version` the agent's current config as
   * ONE new version. One transaction — config columns, ordered skill links (only
   * skills that still exist in the workspace; the rest are returned as skipped),
   * a single version bump and the new snapshot. Name, description and enabled are
   * not part of a snapshot and stay untouched. The agent row is locked
   * (`FOR UPDATE`) so concurrent restores serialise.
   */
  async restoreVersion(
    workspaceId: string,
    agentId: string,
    version: number,
  ): Promise<RestoreVersionResult> {
    return this.db.transaction(async (tx): Promise<RestoreVersionResult> => {
      const [agent] = await tx
        .select()
        .from(t.agents)
        .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)))
        .for('update');
      if (!agent) return { kind: 'agent_not_found' };
      if (agent.version === version) return { kind: 'is_current' };

      const [snap] = await tx
        .select()
        .from(t.agentVersions)
        .where(and(eq(t.agentVersions.agentId, agentId), eq(t.agentVersions.version, version)));
      if (!snap) return { kind: 'version_not_found' };
      const cfg = AgentVersionConfig.parse(snap.configJson);

      const existing = cfg.skills.length
        ? new Set(
            (
              await tx
                .select({ id: t.skills.id })
                .from(t.skills)
                .where(
                  and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, cfg.skills)),
                )
            ).map((r) => r.id),
          )
        : new Set<string>();
      const skillIds = cfg.skills.filter((id) => existing.has(id));
      const skippedSkillIds = cfg.skills.filter((id) => !existing.has(id));

      const [row] = await tx
        .update(t.agents)
        .set({
          provider: cfg.provider,
          model: cfg.model,
          systemPrompt: cfg.system_prompt,
          outputSchema: (cfg.output_schema as object | null | undefined) ?? null,
          strategy: cfg.strategy,
          ciFailOn: cfg.ci_fail_on,
          repoIntel: cfg.repo_intel,
          contextDocs: cfg.context_docs,
          version: agent.version + 1,
        })
        .where(eq(t.agents.id, agentId))
        .returning();

      const previousSkillIds = (
        await tx
          .select({ id: t.agentSkills.skillId })
          .from(t.agentSkills)
          .where(eq(t.agentSkills.agentId, agentId))
          .orderBy(asc(t.agentSkills.order))
      ).map((r) => r.id);
      await tx.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
      if (skillIds.length > 0) {
        await tx
          .insert(t.agentSkills)
          .values(skillIds.map((skillId, i) => ({ agentId, skillId, order: i })));
      }

      // Keep the current version's own snapshot too (seeded agents have none), so
      // the history the user promotes from stays complete.
      await this.snapshotVersion(agent, agent.version, tx, previousSkillIds);
      await this.snapshotVersion(row!, row!.version, tx, skillIds);
      return { kind: 'restored', row: row!, skippedSkillIds };
    });
  }

  // ---- agent_versions (immutable config snapshots) ------------------------

  /** All config snapshots for an agent, newest version first. */
  async listVersions(agentId: string): Promise<AgentVersionRow[]> {
    return this.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agentId))
      .orderBy(desc(t.agentVersions.version));
  }

  /** A single config snapshot, or undefined if that version was never recorded. */
  async getVersion(agentId: string, version: number): Promise<AgentVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, agentId), eq(t.agentVersions.version, version)));
    return row;
  }

  // ---- agent_skills link table (A2 owns the agent side) -------------------

  /** Skills linked to an agent, in `order` ascending. */
  async linkedSkills(agentId: string): Promise<LinkedSkillRow[]> {
    const rows = await this.db
      .select({ skill: t.skills, order: t.agentSkills.order })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => ({ skill: r.skill, order: r.order }));
  }

  async skillIdsForAgent(agentId: string): Promise<string[]> {
    const links = await this.linkedSkills(agentId);
    return links.map((l) => l.skill.id);
  }

  /**
   * The skills that shape this agent's prompt, in link order: linked AND the
   * skill's own global `enabled` is on. The only query the review pipeline uses.
   */
  async enabledSkillsForPrompt(agentId: string): Promise<LinkedSkillRow[]> {
    const rows = await this.db
      .select({ skill: t.skills, order: t.agentSkills.order })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.skills.enabled, true)))
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => ({ skill: r.skill, order: r.order }));
  }

  /** Of `skillIds`, the ones that exist in this workspace (link validation). */
  async workspaceSkillIds(workspaceId: string, skillIds: string[]): Promise<Set<string>> {
    if (skillIds.length === 0) return new Set();
    const rows = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, skillIds)));
    return new Set(rows.map((r) => r.id));
  }

  /** Link a skill to an agent at a given order (idempotent: upserts order). */
  async linkSkill(agentId: string, skillId: string, order: number): Promise<void> {
    await this.db
      .insert(t.agentSkills)
      .values({ agentId, skillId, order })
      .onConflictDoUpdate({
        target: [t.agentSkills.agentId, t.agentSkills.skillId],
        set: { order },
      });
    await this.bumpForSkillChange(agentId);
  }

  async unlinkSkill(agentId: string, skillId: string): Promise<void> {
    await this.db
      .delete(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agentSkills.skillId, skillId)));
    await this.bumpForSkillChange(agentId);
  }

  /**
   * Replace the full set of linked skills for an agent with `skillIds`, assigning
   * order = index. Used by the "Skills" editor tab (attach/reorder). Skills not in
   * the list are unlinked. Delete + insert run in one transaction, so a failure
   * never leaves the agent with its links wiped.
   */
  async setSkills(agentId: string, skillIds: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
      if (skillIds.length === 0) return;
      await tx
        .insert(t.agentSkills)
        .values(skillIds.map((skillId, i) => ({ agentId, skillId, order: i })));
    });
    await this.bumpForSkillChange(agentId);
  }
}
