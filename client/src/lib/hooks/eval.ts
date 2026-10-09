/* hooks/eval.ts — React Query hooks for the eval pipeline (SPEC-06): eval cases,
   suite runs, dashboard, compare and "Promote" (restore a version).
   Types only from @devdigest/shared (value imports blank the page, see INSIGHTS). */
"use client";

import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { api } from "../api";
import type {
  EvalCaseCreateInput,
  EvalCaseUpdateInput,
  EvalCaseSummary,
  EvalCaseDetail,
  EvalCaseFromFindingInput,
  EvalCaseFromFindingResponse,
  EvalCaseSuggestion,
  EvalCaseRunDetail,
  EvalRunDetail,
  EvalSuiteRun,
  EvalStartRunResponse,
  EvalRunAllResponse,
  EvalDashboardOverview,
  EvalCompare,
} from "@devdigest/shared";

/** Poll interval of the run history while any run is still running. */
const RUNNING_POLL_MS = 2000;

/** Filters of `GET /agents/:id/eval-runs`. `days` omitted = all time. */
export interface EvalRunsParams {
  days?: number;
  status?: "running" | "done" | "failed";
  limit?: number;
}

function query(params: EvalRunsParams | undefined): string {
  const q = new URLSearchParams();
  if (params?.days != null) q.set("days", String(params.days));
  if (params?.status) q.set("status", params.status);
  if (params?.limit != null) q.set("limit", String(params.limit));
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export function useEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-cases", agentId],
    queryFn: () => api.get<EvalCaseSummary[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
    // `last_result` changes when a run finishes in the background; the global 30 s staleTime
    // would keep "never run" on a tab re-opened right after the run ended.
    staleTime: 0,
  });
}

/** Eval cases of several agents at once (same cache keys as `useEvalCases`), flattened. */
export function useEvalCasesForAgents(agentIds: readonly string[]): EvalCaseSummary[] {
  return useQueries({
    queries: agentIds.map((agentId) => ({
      queryKey: ["eval-cases", agentId],
      queryFn: () => api.get<EvalCaseSummary[]>(`/agents/${agentId}/eval-cases`),
    })),
    combine: (results) => results.flatMap((r) => r.data ?? []),
  });
}

/** One case with its stored input (case editor). */
export function useEvalCase(caseId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-case", caseId],
    queryFn: () => api.get<EvalCaseDetail>(`/eval-cases/${caseId}`),
    enabled: !!caseId,
  });
}

export function useCreateEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalCaseCreateInput) =>
      api.post<EvalCaseDetail>(`/agents/${agentId}/eval-cases`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-cases", agentId] }),
  });
}

export function useUpdateEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: EvalCaseUpdateInput }) =>
      api.put<EvalCaseDetail>(`/eval-cases/${id}`, patch),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-case", v.id] });
    },
  });
}

export function useDeleteEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/eval-cases/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

/** Run one case against the agent's current configuration (no suite row). */
export function useRunEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.post<EvalCaseRunDetail>(`/eval-cases/${caseId}/run`),
    onSuccess: (_d, caseId) => {
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-case", caseId] });
    },
  });
}

/**
 * Line-range suggestion for "Turn into eval case" — `GET /findings/:id/eval-case/suggestion`
 * (SPEC-07). A mutation, not a query: it is computed fresh on every click and never cached.
 */
export function useEvalCaseSuggestion(findingId: string) {
  return useMutation({
    mutationFn: () => api.get<EvalCaseSuggestion>(`/findings/${findingId}/eval-case/suggestion`),
  });
}

/**
 * "Turn into eval case" — `POST /findings/:id/eval-case` (201 created, 200 existing).
 * Without a range the request has no body (the cited range is stored); with one, the range the
 * user confirmed plus the fingerprint of the patch it was chosen on (SPEC-07 AC-14, AC-43).
 */
export function useCaseFromFinding(findingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (range?: EvalCaseFromFindingInput) =>
      api.post<EvalCaseFromFindingResponse>(`/findings/${findingId}/eval-case`, range),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["eval-cases", res.case.agent_id] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

/** Run history of an agent, newest first; polls every 2 s while any run is running. */
export function useEvalRuns(agentId: string | null | undefined, params?: EvalRunsParams) {
  return useQuery({
    queryKey: ["eval-runs", agentId, params ?? {}],
    queryFn: () => api.get<EvalSuiteRun[]>(`/agents/${agentId}/eval-runs${query(params)}`),
    enabled: !!agentId,
    refetchInterval: (q) =>
      q.state.data?.some((r) => r.status === "running") ? RUNNING_POLL_MS : false,
  });
}

/** One run with its case rows; polls while the run is running. */
export function useEvalRun(runId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-run", runId],
    queryFn: () => api.get<EvalRunDetail>(`/eval-runs/${runId}`),
    enabled: !!runId,
    refetchInterval: (q) => (q.state.data?.run.status === "running" ? RUNNING_POLL_MS : false),
  });
}

/** Drill-down of one case row of a run (findings, dropped + reasons, matches). */
export function useEvalCaseRun(runId: string | null | undefined, caseRunId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-case-run", runId, caseRunId],
    queryFn: () => api.get<EvalCaseRunDetail>(`/eval-runs/${runId}/cases/${caseRunId}`),
    enabled: !!runId && !!caseRunId,
  });
}

/**
 * Returns a stable callback to call once when a watched run is seen going running → done/failed.
 * The mutation-time invalidation fires before the run's results exist, and polling refreshes only
 * the run lists — so everything that derives from the results (case `last_result`, case detail,
 * dashboard, other cached period lists) must be refreshed at the observed end of the run.
 */
export function useInvalidateOnRunFinish(agentId: string) {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: ["eval-runs", agentId] });
    qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
    qc.invalidateQueries({ queryKey: ["eval-case"] });
    qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
  }, [qc, agentId]);
}

export function useStartEvalRun(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalStartRunResponse>(`/agents/${agentId}/eval-runs`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-runs", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

export function useRunAllAgents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalRunAllResponse>("/eval/run-all"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-runs"] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Dashboard / compare / promote
// ---------------------------------------------------------------------------

/** Agents list + 10 most recent runs; polls while any agent has a run in progress. */
export function useEvalDashboard() {
  return useQuery({
    queryKey: ["eval-dashboard"],
    queryFn: () => api.get<EvalDashboardOverview>("/eval/dashboard"),
    refetchInterval: (q) =>
      q.state.data?.agents.some((a) => a.running) ? RUNNING_POLL_MS : false,
  });
}

export function useEvalCompare(a: string | null | undefined, b: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-compare", a, b],
    queryFn: () => api.get<EvalCompare>(`/eval/compare?a=${a}&b=${b}`),
    enabled: !!a && !!b,
  });
}
