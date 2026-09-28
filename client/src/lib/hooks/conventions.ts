/* hooks/conventions.ts — React Query hooks for the Conventions page: run a scan,
   list candidates, accept / reject / edit them, and turn the accepted ones into
   skills through editable drafts. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionSkillDraft,
  ConventionSkillSplit,
  ConventionsState,
  CreateConventionSkillsInput,
  Skill,
  UpdateConventionInput,
} from "@devdigest/shared";

const stateKey = (repoId: string) => ["conventions", repoId] as const;

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionsState>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** Run Scan / ReScan — the server answers with the fresh state. */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionsState>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (state) => {
      qc.setQueryData(stateKey(repoId), state);
      qc.invalidateQueries({ queryKey: ["convention-drafts", repoId] });
    },
  });
}

export interface UpdateConventionVars {
  id: string;
  patch: UpdateConventionInput;
}

/**
 * Accept / reject / restore / edit. Optimistic: the card changes at once — a
 * reject moves it to the rejected list, a restore moves it back — and rolls
 * back if the server refuses.
 */
export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  const key = stateKey(repoId);
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionVars) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ConventionsState>(key);
      if (previous) {
        const all = [...previous.candidates, ...(previous.rejected ?? [])].map((c) =>
          c.id === id ? { ...c, ...patch } : c,
        );
        qc.setQueryData<ConventionsState>(key, {
          ...previous,
          candidates: all.filter((c) => c.status !== "rejected"),
          rejected: all.filter((c) => c.status === "rejected"),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["convention-drafts", repoId] });
    },
  });
}

export function useConventionSkillDrafts(
  repoId: string,
  split: ConventionSkillSplit,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["convention-drafts", repoId, split],
    queryFn: () =>
      api.get<ConventionSkillDraft[]>(`/repos/${repoId}/conventions/skill-drafts?split=${split}`),
    enabled,
    // A draft is a starting point the user edits — never refetch it underneath them.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useCreateConventionSkills(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConventionSkillsInput) =>
      api.post<Skill[]>(`/repos/${repoId}/conventions/skills`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}
