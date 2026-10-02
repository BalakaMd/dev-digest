/* hooks/blast.ts — React Query hook for a PR's blast radius: the symbols
   declared in the changed files, their callers, and the endpoints / crons that
   depend on them. Read-only (GET /pulls/:id/blast); the pattern follows
   hooks/intent.ts. `pollMs` lets the caller re-read the map while a resync is
   rebuilding the index; the caller owns when to stop. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { PrBlastRadiusResponse } from "@devdigest/shared";

const blastKey = (prId: string | null | undefined) => ["pr-blast", prId] as const;

/** The blast-radius map for a PR (includes the degraded marker when the index is not usable). */
export function usePrBlastRadius(
  prId: string | null | undefined,
  opts?: { pollMs?: number | false },
) {
  return useQuery({
    queryKey: blastKey(prId),
    queryFn: () => api.get<PrBlastRadiusResponse>(`/pulls/${prId}/blast`),
    enabled: !!prId,
    refetchInterval: opts?.pollMs ?? false,
  });
}
