/* hooks/history.ts — React Query hook for the prior merged PRs that touched the
   same files as a PR (GET /pulls/:id/history). Read-only; the response carries
   its own degraded marker. The pattern follows hooks/blast.ts. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { PrHistoryResponse } from "@devdigest/shared";

const historyKey = (prId: string | null | undefined) => ["pr-history", prId] as const;

/** Prior merged PRs touching the same files (includes the degraded marker). */
export function usePrHistory(prId: string | null | undefined) {
  return useQuery({
    queryKey: historyKey(prId),
    queryFn: () => api.get<PrHistoryResponse>(`/pulls/${prId}/history`),
    enabled: !!prId,
  });
}
