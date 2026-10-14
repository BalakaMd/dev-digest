/* hooks/trace.ts — A5 Run Trace. GET /runs/:id/trace returns the ENTIRE
   trace of one run as a single document (config + stats + prompt_assembly +
   tool_calls[] + raw_output + memory_pulled[] + full log). Registered by A2;
   A5 enriches the document it returns. Live events stream via useRunEvents
   (hooks/reviews.ts) — the drawer combines both. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { RunTrace } from "@devdigest/shared";

const MISSING_RETRIES = 5;
const MISSING_RETRY_DELAY_MS = 1000;

/** `retryMissing`: the trace may be saved a moment after the run reports done,
   so a 404 is retried (5 x 1 s) instead of failing at once. Default: no retry. */
export function useRunTrace(
  runId: string | null | undefined,
  enabled = true,
  opts: { retryMissing?: boolean } = {},
) {
  const retryMissing = !!opts.retryMissing;
  return useQuery({
    queryKey: ["run-trace", runId],
    queryFn: () => api.get<RunTrace>(`/runs/${runId}/trace`),
    enabled: !!runId && enabled,
    retry: retryMissing
      ? (count, err) => err instanceof ApiError && err.status === 404 && count < MISSING_RETRIES
      : false,
    retryDelay: MISSING_RETRY_DELAY_MS,
  });
}
