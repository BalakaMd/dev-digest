import { NO_ESTIMATE } from "./constants";

/** `12345` → "~12 s"; null/invalid → "—". */
export function formatEstimate(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return NO_ESTIMATE;
  return `~${Math.max(1, Math.round(ms / 1000))} s`;
}
