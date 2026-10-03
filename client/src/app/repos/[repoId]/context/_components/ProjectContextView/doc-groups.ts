/* Pure model of the document tree: grouping by folder and URL selection. */
import type { ContextDocEntry, ContextDocSource } from "@devdigest/shared";

export interface DocGroup {
  /** Repo-relative folder; "" is the repository root. */
  folder: string;
  docs: ContextDocEntry[];
}

/** Groups docs by folder (docs keep their order; empty local folders get an empty group). */
export function groupDocs(docs: ContextDocEntry[], localFolders: string[]): DocGroup[] {
  const byFolder = new Map<string, ContextDocEntry[]>();
  for (const d of docs) {
    const list = byFolder.get(d.folder);
    if (list) list.push(d);
    else byFolder.set(d.folder, [d]);
  }
  for (const f of localFolders) if (!byFolder.has(f)) byFolder.set(f, []);
  return [...byFolder.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([folder, list]) => ({ folder, docs: list }));
}

export interface DocSelection {
  path: string;
  source: ContextDocSource;
}

export const sameDoc = (d: ContextDocEntry, sel: DocSelection | null) =>
  !!sel && d.path === sel.path && d.source === sel.source;

/** Resolves `?doc=` (+ optional source) to a listed document; falls back to the first one. */
export function resolveSelection(
  docs: ContextDocEntry[],
  path: string | null,
  source: string | null,
): ContextDocEntry | null {
  if (docs.length === 0) return null;
  if (path) {
    const wanted: ContextDocSource = source === "local" ? "local" : "repo";
    const exact = docs.find((d) => d.path === path && d.source === wanted);
    // Without `source`, the effective (repo) document wins over a shadowed local one.
    const any = docs.find((d) => d.path === path);
    if (exact ?? any) return (exact ?? any) as ContextDocEntry;
  }
  return docs[0] as ContextDocEntry;
}

export const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
