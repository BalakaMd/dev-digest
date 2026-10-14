import type { CiPostAs, CiPreview, CiTrigger } from "@devdigest/shared";
import { TRIGGER_VALUES } from "./constants";

/** The choices a workflow file was generated for. */
export interface GeneratedFor {
  repo: string;
  triggers: CiTrigger[];
  postAs: CiPostAs;
}

/** Triggers in canonical order, so equal sets compare equal. */
export function sortTriggers(triggers: readonly CiTrigger[]): CiTrigger[] {
  return TRIGGER_VALUES.filter((t) => triggers.includes(t));
}

export function sameChoices(a: GeneratedFor, b: GeneratedFor): boolean {
  const ta = sortTriggers(a.triggers);
  const tb = sortTriggers(b.triggers);
  return a.repo === b.repo && a.postAs === b.postAs && ta.length === tb.length && ta.every((t, i) => t === tb[i]);
}

/** The text of the one editable file of a preview (the workflow), or "" when absent. */
export function workflowOf(preview: CiPreview): string {
  return preview.files.find((f) => f.editable)?.contents ?? "";
}

/** "812 B" / "1.4 KB" / "2.3 MB" for the file list. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
