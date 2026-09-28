/* hooks/smart-diff.ts — the Smart Diff role grouping for a PR's "Files
   changed" tab. Roles depend only on `pr_files` (never on which findings
   exist), so this query is never invalidated by a review run (D1 in the
   Smart Diff plan) — the pattern follows hooks/intent.ts. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiffResponse } from "@devdigest/shared";

/** Role groups (fixed server order) for a PR's files. Never calls an LLM. */
export function usePrSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-smart-diff", prId],
    queryFn: () => api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
