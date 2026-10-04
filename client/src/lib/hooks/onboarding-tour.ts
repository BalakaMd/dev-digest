/* hooks/onboarding-tour.ts — React Query hooks for the Onboarding Tour page.
   Query key: ["onboarding-tour", repoId]. GET /repos/:id/onboarding returns the
   whole page state; POST …/generate returns 202 with the (running) state. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { OnboardingTourState } from "@devdigest/shared";

const POLL_MS = 2000;
const key = (repoId: string | null | undefined) => ["onboarding-tour", repoId] as const;
const path = (repoId: string) => `/repos/${repoId}/onboarding`;

/** Tour state; polls every 2s while a generation is running, otherwise not at all. */
export function useOnboardingTour(repoId: string | null | undefined) {
  return useQuery({
    queryKey: key(repoId),
    queryFn: () => api.get<OnboardingTourState>(path(repoId as string)),
    enabled: !!repoId,
    refetchInterval: (query) => (query.state.data?.generation.status === "running" ? POLL_MS : false),
  });
}

/** Start (or attach to) a generation; the returned state is written into the cache. */
export function useGenerateOnboardingTour(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<OnboardingTourState>(`${path(repoId as string)}/generate`, {}),
    onSuccess: (state) => qc.setQueryData(key(repoId), state),
  });
}
