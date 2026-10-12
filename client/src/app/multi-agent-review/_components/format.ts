import { formatCostUsd } from "@/lib/format";

const EMPTY = "—";

/** `12345` → "12.3 s"; null/invalid → "—". */
export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return EMPTY;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** Cost via the shared formatter; null → "—". */
export function formatRunCost(usd: number | null | undefined): string {
  return usd == null ? EMPTY : formatCostUsd(usd);
}
