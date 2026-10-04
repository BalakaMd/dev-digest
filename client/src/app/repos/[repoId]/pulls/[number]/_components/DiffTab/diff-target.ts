/* diff-target.ts — parses the `?tab=diff&file=&line=` deep link (built by the
   PR Brief block, read by the page) against the PR's changed files. */
import type { PrFile } from "@devdigest/shared";

/** A deep-link request into Files changed: a changed file and, optionally, a line. */
export interface DiffTargetRequest {
  file: string;
  line: number | null;
}

export type ParsedDiffTarget =
  | { kind: "none" }
  | { kind: "target"; file: string; line: number | null }
  | { kind: "missing" };

/** `line` counts only as a whole number >= 1; anything else means "no line". */
function parseLine(line: string | null | undefined): number | null {
  if (!line || !/^\d+$/.test(line)) return null;
  const n = Number(line);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/** No `file` → none; an exact path match among `files` → target; else missing. */
export function parseDiffTarget(
  file: string | null | undefined,
  line: string | null | undefined,
  files: ReadonlyArray<Pick<PrFile, "path">>,
): ParsedDiffTarget {
  if (!file) return { kind: "none" };
  if (!files.some((f) => f.path === file)) return { kind: "missing" };
  return { kind: "target", file, line: parseLine(line) };
}
