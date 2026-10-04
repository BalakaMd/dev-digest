import { ApiError } from "@/lib/api";
import type { OnboardingBlocked } from "@devdigest/shared";

/** A generation request the API refused with 422 (AC-24 blocked / AC-34 missing key). */
export type Rejection =
  | { kind: "blocked"; blocked: OnboardingBlocked }
  | { kind: "missing_key"; provider: string }
  | { kind: "error"; message: string };

const BLOCKED_REASONS = ["not_indexed", "partial", "degraded", "no_clone", "no_source_files"];

/** Local structural guard: the client may import only types from `@devdigest/shared`. */
function isOnboardingBlocked(d: unknown): d is OnboardingBlocked {
  const o = d as Record<string, unknown> | undefined | null;
  return (
    !!o &&
    typeof o.reason === "string" &&
    BLOCKED_REASONS.includes(o.reason) &&
    typeof o.message === "string" &&
    typeof o.index_status === "string" &&
    typeof o.files_indexed === "number"
  );
}

/** 422 bodies carry the reason in `error.details` (validation_error envelope). */
export function rejectionFrom(err: unknown): Rejection {
  if (err instanceof ApiError && err.status === 422) {
    const d = err.details as Record<string, unknown> | undefined;
    if (d?.reason === "missing_key" && typeof d.provider === "string") {
      return { kind: "missing_key", provider: d.provider };
    }
    if (isOnboardingBlocked(d)) return { kind: "blocked", blocked: d };
  }
  return { kind: "error", message: err instanceof Error ? err.message : "" };
}

/** "owner/repo" → "repo". */
export function repoNameOf(fullName: string): string {
  const i = fullName.lastIndexOf("/");
  return i >= 0 ? fullName.slice(i + 1) : fullName;
}
