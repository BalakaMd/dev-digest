/* hooks/context-docs.ts — React Query hooks for project context documents
   (specs/docs/insights markdown attached to agents and skills). Only
   repo-relative paths cross the API. Query keys: ["context-docs", repoId, …]
   for the list/content of one repo, ["context-doc-usage", repoId, path] for usage. */
"use client";

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ContextDocContent,
  ContextDocList,
  ContextDocSource,
  ContextDocSyncResult,
  ContextDocUsage,
  LocalDocCount,
  LocalDocUploadBody,
  LocalDocUploadResult,
  LocalDocWriteBody,
} from "@devdigest/shared";

const base = (repoId: string) => `/repos/${repoId}/context-docs`;

export function useContextDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context-docs", repoId],
    queryFn: () => api.get<ContextDocList>(base(repoId as string)),
    enabled: !!repoId,
  });
}

export function useContextDocContent(
  repoId: string | null | undefined,
  path: string | null | undefined,
  source?: ContextDocSource,
) {
  return useQuery({
    queryKey: ["context-docs", repoId, "content", path, source ?? null],
    queryFn: () => {
      const qs = new URLSearchParams({ path: path as string });
      if (source) qs.set("source", source);
      return api.get<ContextDocContent>(`${base(repoId as string)}/content?${qs}`);
    },
    enabled: !!repoId && !!path,
  });
}

export function useContextDocUsage(
  repoId: string | null | undefined,
  path: string | null | undefined,
) {
  return useQuery({
    queryKey: ["context-doc-usage", repoId, path],
    queryFn: () =>
      api.get<ContextDocUsage>(
        `${base(repoId as string)}/usage?${new URLSearchParams({ path: path as string })}`,
      ),
    enabled: !!repoId && !!path,
  });
}

/** Number of local documents of a repo — for the repo-removal confirm dialog. */
export function fetchLocalDocCount(qc: QueryClient, repoId: string): Promise<LocalDocCount> {
  return qc.fetchQuery({
    queryKey: ["context-docs", repoId, "local-count"],
    queryFn: () => api.get<LocalDocCount>(`${base(repoId)}/local-count`),
    staleTime: 0,
  });
}

/** Every context-doc mutation changes the list and may change usage figures. */
function invalidateDocs(qc: QueryClient, repoId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["context-docs", repoId] }),
    qc.invalidateQueries({ queryKey: ["context-doc-usage"] }),
  ]);
}

/** Synchronous `git` sync of the repo working copy; the list is refetched on success. */
export function useSyncRepoDocs(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ContextDocSyncResult>(`${base(repoId)}/sync`),
    onSuccess: () => invalidateDocs(qc, repoId),
  });
}

/** Create (no `base_version`) or update one local document. A stale save rejects with 409. */
export function useSaveLocalDoc(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LocalDocWriteBody) =>
      api.put<ContextDocContent>(`${base(repoId)}/local`, body),
    onSuccess: () => invalidateDocs(qc, repoId),
  });
}

/** "Keep my copy": the server records the current repo text's version as the copy's origin. */
export function useKeepLocalCopy(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) =>
      api.post<{ ok: boolean }>(`${base(repoId)}/local/keep-copy`, { path }),
    onSuccess: () => invalidateDocs(qc, repoId),
  });
}

/** Fresh (never cached) read of one document — prefill of an "Edit a copy" draft. */
export function fetchContextDocContent(
  qc: QueryClient,
  repoId: string,
  path: string,
  source?: ContextDocSource,
): Promise<ContextDocContent> {
  return qc.fetchQuery({
    queryKey: ["context-docs", repoId, "content", path, source ?? null],
    queryFn: () => {
      const qs = new URLSearchParams({ path });
      if (source) qs.set("source", source);
      return api.get<ContextDocContent>(`${base(repoId)}/content?${qs}`);
    },
    staleTime: 0,
  });
}

export function useUploadLocalDocs(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LocalDocUploadBody) =>
      api.post<LocalDocUploadResult>(`${base(repoId)}/local/upload`, body),
    onSuccess: () => invalidateDocs(qc, repoId),
  });
}

export function useCreateLocalFolder(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) =>
      api.post<{ ok: boolean }>(`${base(repoId)}/local/folders`, { path }),
    onSuccess: () => invalidateDocs(qc, repoId),
  });
}

export function useDeleteLocalDoc(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) =>
      api.del<{ ok: boolean }>(`${base(repoId)}/local?${new URLSearchParams({ path })}`),
    onSuccess: () => invalidateDocs(qc, repoId),
  });
}

/** Empty folders only — the server rejects a non-empty one. */
export function useDeleteLocalFolder(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) =>
      api.del<{ ok: boolean }>(`${base(repoId)}/local/folders?${new URLSearchParams({ path })}`),
    onSuccess: () => invalidateDocs(qc, repoId),
  });
}
