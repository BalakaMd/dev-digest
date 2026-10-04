import type { TourLanguage } from "@devdigest/shared";
import { RTL_LANGUAGES, SHORT_SHA_LENGTH } from "./constants";

/** In-app link to a file (and optional line) in Files changed; the only href the block builds. */
export function briefDiffHref(repoId: string, number: number | string, file: string, line?: number | null): string {
  const base = `/repos/${encodeURIComponent(repoId)}/pulls/${encodeURIComponent(String(number))}`;
  const params = `tab=diff&file=${encodeURIComponent(file)}`;
  return line != null ? `${base}?${params}&line=${line}` : `${base}?${params}`;
}

export function isRtl(language: TourLanguage): boolean {
  return RTL_LANGUAGES.includes(language);
}

export function shortSha(sha: string): string {
  return sha.slice(0, SHORT_SHA_LENGTH);
}

type ReviewLike = { kind: string; verdict: string | null };

/** The most recent completed review (reviews come newest-first) — source of the verdict banner. */
export function latestVerdictReview<T extends ReviewLike>(reviews: readonly T[] | undefined): T | null {
  return reviews?.find((r) => r.kind === "review" && r.verdict != null) ?? null;
}
