import type { ContextDocEntry } from "@devdigest/shared";

/**
 * What the viewer shows for a document (SPEC-02): a plain repository document, a repository
 * document overridden by a local copy, the override copy itself, or a plain local document
 * (including an orphan whose repository original is gone, AC-24).
 */
export type DocKind = "repo" | "overridden" | "copy" | "local";

export function docKind(doc: ContextDocEntry): DocKind {
  if (doc.source === "repo") return doc.overridden ? "overridden" : "repo";
  return doc.overrides_repo ? "copy" : "local";
}
