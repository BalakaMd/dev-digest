/* hooks/multi-agent-review.ts — React Query hooks for the multi-agent review:
   per-agent estimates, one multi-agent run (polled while any column runs) and
   the latest multi-agent run of a PR. */
"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { LatestMultiAgentRun, MultiAgentRun, ReviewEstimates } from "@devdigest/shared";

/** Result page poll period: well inside the 5 s status budget (NFR-1). */
export const MULTI_AGENT_POLL_MS = 3000;

/** 3000 ms while any column is `running`, otherwise `false` (stop polling). */
export function multiAgentRefetchInterval(data: MultiAgentRun | undefined): number | false {
  return data?.columns.some((c) => c.status === "running") ? MULTI_AGENT_POLL_MS : false;
}

export function useReviewEstimates() {
  return useQuery({
    queryKey: ["review-estimates"],
    queryFn: () => api.get<ReviewEstimates>("/review-estimates"),
  });
}

/** Stale-while-polling: a transient refetch error keeps the last good data. */
export function useMultiAgentRun(id: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent-run", id],
    queryFn: () => api.get<MultiAgentRun>(`/multi-agent-runs/${id}`),
    enabled: !!id,
    placeholderData: keepPreviousData,
    refetchInterval: (query) => multiAgentRefetchInterval(query.state.data),
  });
}

export function useLatestMultiAgentRun(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["latest-multi-agent-run", prId],
    queryFn: () => api.get<LatestMultiAgentRun>(`/pulls/${prId}/multi-agent-runs/latest`),
    enabled: !!prId,
  });
}
