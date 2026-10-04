/* hooks/brief.ts — React Query hooks for a PR's Brief (SPEC-04): read the stored
   brief, generate it on demand, and the settings the block depends on.
   Query key: ["pr-brief", prId]. Generation is synchronous (POST returns the
   fresh PrBriefResponse) and never starts on its own. */
"use client";

import { useQuery, useMutation, useQueryClient, useIsMutating } from "@tanstack/react-query";
import { api } from "../api";
import { FEATURE_MODELS } from "../feature-models";
import { useSettings, useSecretsStatus } from "./core";
import type { PrBriefResponse, TourLanguage } from "@devdigest/shared";

const briefKey = (prId: string | null | undefined) => ["pr-brief", prId] as const;
const generateKey = (prId: string | null | undefined) => ["pr-brief-generate", prId] as const;

const FEATURE_ID = "risk_brief";
const DEFAULT_LANGUAGE: TourLanguage = "English";
const SECRET_PROVIDERS = ["openai", "anthropic", "openrouter"] as const;
type SecretProvider = (typeof SECRET_PROVIDERS)[number];

function isSecretProvider(p: string): p is SecretProvider {
  return (SECRET_PROVIDERS as readonly string[]).includes(p);
}

/** The stored brief of a PR (`brief: null` when none) and its `stale` flag. */
export function useBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: briefKey(prId),
    queryFn: () => api.get<PrBriefResponse>(`/pulls/${prId}/brief`),
    enabled: !!prId,
  });
}

/** Generate or regenerate; the returned response replaces the cache entry. */
export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: generateKey(prId),
    mutationFn: () => api.post<PrBriefResponse>(`/pulls/${prId}/brief`, {}),
    onSuccess: (res) => qc.setQueryData<PrBriefResponse>(briefKey(prId), res),
  });
}

/** True while a generation runs for the PR — survives tab switches (mutation cache). */
export function useBriefGenerating(prId: string | null | undefined): boolean {
  return useIsMutating({ mutationKey: generateKey(prId) }) > 0;
}

/** Provider of the "Risk Brief" model, whether its key is missing, and the Tour language. */
export function useBriefSettings(): {
  provider: string;
  missingKey: boolean;
  tourLanguage: TourLanguage;
} {
  const settings = useSettings();
  const secrets = useSecretsStatus();
  const def = FEATURE_MODELS.find((f) => f.id === FEATURE_ID);
  const provider = settings.data?.feature_models?.[FEATURE_ID]?.provider ?? def?.defaultProvider ?? "openai";
  // Not missing while loading, or for a provider that has no key slot.
  const missingKey = secrets.data && isSecretProvider(provider) ? !secrets.data[provider] : false;
  return { provider, missingKey, tourLanguage: settings.data?.tour_language ?? DEFAULT_LANGUAGE };
}
