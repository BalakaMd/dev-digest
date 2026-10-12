/* hooks/ci.ts — React Query hooks for Export-to-CI and CI Runs (SPEC-09).
   Types only from @devdigest/shared (value imports blank the page, see INSIGHTS). */
"use client";

import { useEffect } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  CiCheckInput,
  CiCheckResult,
  CiInstallInputBody,
  CiInstallResult,
  CiInstallation,
  CiPreview,
  CiPreviewInput,
  CiRefreshResult,
  CiRunDetail,
  CiRunsPage,
  CiSecretsStatus,
} from "@devdigest/shared";

/** Page size the CI Runs list asks for. */
const RUNS_PAGE_SIZE = 50;

export interface CiRunsParams {
  agentId?: string | null;
  installationId?: string | null;
  limit?: number;
}

function runsQuery(params: CiRunsParams, cursor: string | null): string {
  const q = new URLSearchParams();
  if (params.agentId) q.set("agent_id", params.agentId);
  if (params.installationId) q.set("installation_id", params.installationId);
  q.set("limit", String(params.limit ?? RUNS_PAGE_SIZE));
  if (cursor) q.set("cursor", cursor);
  return q.toString();
}

/** CI installations of one agent (latest collected run embedded). */
export function useCiInstallations(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["ci-installations", agentId],
    queryFn: () => api.get<CiInstallation[]>(`/agents/${agentId}/ci/installations`),
    enabled: !!agentId,
  });
}

/** Generate the export files (nothing is written anywhere). */
export function useCiPreview(agentId: string | null | undefined) {
  return useMutation({
    mutationFn: (input: CiPreviewInput) => api.post<CiPreview>(`/agents/${agentId}/ci/preview`, input),
  });
}

/** Re-check a (possibly hand-edited) workflow: YAML errors, risks, secret leaks. */
export function useCiCheck(agentId: string | null | undefined) {
  return useMutation({
    mutationFn: (input: CiCheckInput) => api.post<CiCheckResult>(`/agents/${agentId}/ci/check`, input),
  });
}

/** Which secrets the target repository is known to have. */
export function useCiSecrets(agentId: string | null | undefined, repo: string | null | undefined) {
  return useQuery({
    queryKey: ["ci-secrets", agentId, repo],
    queryFn: () =>
      api.get<CiSecretsStatus>(`/agents/${agentId}/ci/secrets?repo=${encodeURIComponent(repo ?? "")}`),
    enabled: !!agentId && !!repo,
    staleTime: 0,
  });
}

/** Install (open a PR or build the zip). Refreshes installations and runs afterwards. */
export function useCiInstall(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CiInstallInputBody) => api.post<CiInstallResult>(`/agents/${agentId}/ci/install`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ci-installations"] });
      qc.invalidateQueries({ queryKey: ["ci-runs"] });
    },
  });
}

/** Collect finished workflow runs from GitHub (no body). Refreshes installations and runs afterwards. */
export function useCiRefresh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CiRefreshResult>("/ci/refresh"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ci-installations"] });
      qc.invalidateQueries({ queryKey: ["ci-runs"] });
    },
  });
}

/**
 * CI runs, newest first, cursor-paged. Runs one refresh when the consumer mounts
 * (AC-59); the result (`degraded`, `message`) is on `refresh`.
 */
export function useCiRuns(params: CiRunsParams = {}) {
  const refresh = useCiRefresh();
  const { mutate } = refresh;
  // No ref guard: under StrictMode the simulated remount detaches the observer from the first
  // mutate(), so a guarded second run would leave `isPending` stuck. The server coalesces
  // concurrent refreshes, so the dev-only duplicate POST is harmless.
  useEffect(() => {
    mutate();
  }, [mutate]);

  const query = useInfiniteQuery({
    queryKey: ["ci-runs", params.agentId ?? null, params.installationId ?? null, params.limit ?? RUNS_PAGE_SIZE],
    queryFn: ({ pageParam }) => api.get<CiRunsPage>(`/ci/runs?${runsQuery(params, pageParam)}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return { ...query, items, refresh };
}

/** One CI run with its reproducibility trace. */
export function useCiRun(id: string | null | undefined) {
  return useQuery({
    queryKey: ["ci-run", id],
    queryFn: () => api.get<CiRunDetail>(`/ci/runs/${id}`),
    enabled: !!id,
  });
}
