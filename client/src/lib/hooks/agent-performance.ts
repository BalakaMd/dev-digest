/* hooks/agent-performance.ts — React Query hooks for the Agent Performance page (SPEC-10).
   Types only from @devdigest/shared (value imports blank the page, see INSIGHTS).
   Reads are strictly read-only; no polling (NG-3). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentPerformanceDetail, AgentPerformanceOverview } from "@devdigest/shared";

/** The instants a read is sent with (`from` inclusive, `to` exclusive, ISO-8601). */
export interface PerformanceRange {
  from: string;
  to: string;
}

/** Fresh on every mount/refetch; never on focus, never on a timer. */
const FRESH_READ = {
  staleTime: 0,
  refetchOnWindowFocus: false,
  refetchOnMount: "always",
  retry: false,
} as const;

function readQuery(repoId: string, range: PerformanceRange): string {
  const q = new URLSearchParams({ repoId, from: range.from, to: range.to });
  return q.toString();
}

/**
 * All-agents aggregation of one repository. `resolveRange` runs inside the
 * query function, so "now" is the moment the read is sent (AC-5); the cache key
 * holds the range key (e.g. "30d"), never the instants.
 */
export function useAgentPerformance(
  repoId: string | null | undefined,
  rangeKey: string,
  resolveRange: () => PerformanceRange,
  enabled = true,
) {
  return useQuery({
    queryKey: ["agent-performance", repoId, rangeKey],
    queryFn: () =>
      api.get<AgentPerformanceOverview>(`/agent-performance?${readQuery(repoId!, resolveRange())}`),
    enabled: !!repoId && enabled,
    ...FRESH_READ,
  });
}

/** One agent over the range the overview applied (AC-35), read when its row is expanded. */
export function useAgentPerformanceDetail(
  agentId: string | null | undefined,
  repoId: string | null | undefined,
  applied: PerformanceRange | null | undefined,
) {
  return useQuery({
    queryKey: ["agent-performance-detail", agentId, repoId, applied?.from, applied?.to],
    queryFn: () =>
      api.get<AgentPerformanceDetail>(
        `/agents/${agentId}/performance?${readQuery(repoId!, applied!)}`,
      ),
    enabled: !!agentId && !!repoId && !!applied,
    ...FRESH_READ,
  });
}
