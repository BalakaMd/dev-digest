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

/** Compact count: 950 → "950", 8200 → "8.2K", 1_250_000 → "1.3M". */
export function formatCompactCount(n: number): string {
  const trim = (v: number) => String(Math.round(v * 10) / 10);
  if (n >= 999_950) return `${trim(n / 1_000_000)}M`;
  if (n >= 1000) return `${trim(n / 1000)}K`;
  return String(n);
}

/** USD cost: 0.0142 → "$0.014", 2.5 → "$2.50", below a tenth of a cent → "<$0.001". */
export function formatCostUsd(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd > 0 && usd < 0.0005) return "<$0.001";
  return `$${usd.toFixed(3)}`;
}
