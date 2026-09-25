/* hooks/intent.ts — React Query hooks for a PR's derived Intent: read the
   stored record (or null) and trigger an on-demand (re-)derivation. The
   pattern follows hooks/conventions.ts. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentRecord, PrIntentResponse } from "@devdigest/shared";

const intentKey = (prId: string | null | undefined) => ["pr-intent", prId] as const;

/** The stored intent for a PR, or `null` when none was ever derived. */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: intentKey(prId),
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/** Derive (or re-derive) the intent — synchronous; the fresh record replaces the cache. */
export function useDeriveIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentRecord>(`/pulls/${prId}/intent`),
    onSuccess: (record) => {
      qc.setQueryData<PrIntentResponse>(intentKey(prId), { intent: record });
    },
  });
}
