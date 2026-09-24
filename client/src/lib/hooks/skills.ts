/* hooks/skills.ts — React Query hooks for the Skills page, the skill editor and
   the agent editor's Skills tab. A skill is reusable review guidance shared
   across agents: text and config only, never code. */
"use client";

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentSkillDetail,
  AgentSkillLink,
  Skill,
  SkillImportPreview,
  SkillSummary,
  SkillType,
  SkillVersion,
} from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<SkillSummary[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/** Agents that link this skill — shown in the preview drawer. */
export function useSkillAgents(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-agents", id],
    queryFn: () => api.get<Array<{ id: string; name: string }>>(`/skills/${id}/agents`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: Skill["source"];
  enabled?: boolean;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

/** A saved skill changes what every linked agent sends to the model. */
function onSkillSaved(qc: QueryClient, skill: Skill) {
  qc.invalidateQueries({ queryKey: ["skills"] });
  qc.setQueryData(["skill", skill.id], skill);
  qc.invalidateQueries({ queryKey: ["skill-versions", skill.id] });
  qc.invalidateQueries({ queryKey: ["agent-skills"] });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">>;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (skill) => onSkillSaved(qc, skill),
  });
}

/** Write an old version's body forward as a new version (history stays append-only). */
export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`, {}),
    onSuccess: (skill) => onSkillSaved(qc, skill),
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

/**
 * Parse an uploaded `.md` / `.zip` into a preview. This does NOT create a skill —
 * the user confirms the preview, then `useCreateSkill` persists it.
 */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: ({ filename, contentB64 }: { filename: string; contentB64: string }) =>
      api.post<SkillImportPreview>("/skills/import", { filename, content_b64: contentB64 }),
  });
}

// ---- agent ⇄ skill links -------------------------------------------------

/** Skills linked to an agent, in prompt order. */
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillDetail[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/**
 * Replace the agent's whole ordered skill set. Link order IS prompt order, and
 * a link change bumps the agent's config version, so the agent is refetched too.
 */
export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skillIds }: { agentId: string; skillIds: string[] }) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    // Returned so the mutation stays pending until the fresh links are loaded —
    // the tab keeps its optimistic rows until then instead of flashing back.
    onSettled: (_d, _e, { agentId }) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["agent-skills", agentId] }),
        qc.invalidateQueries({ queryKey: ["agent", agentId] }),
        qc.invalidateQueries({ queryKey: ["agents"] }),
        qc.invalidateQueries({ queryKey: ["skills"] }),
      ]),
  });
}
