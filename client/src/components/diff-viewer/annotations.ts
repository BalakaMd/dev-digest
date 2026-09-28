/* Generic annotation slots the diff-viewer exposes to a caller (e.g. Smart
   Diff's inline findings) without knowing anything about findings itself.
   Keyed the same way as comment threads (`lineKey`, comments.ts:34-36) so a
   caller can anchor arbitrary nodes to a rendered diff line. */
import type { ReactNode } from "react";

/** What a `FileCard` renders in addition to (or instead of) comment threads. */
export interface FileAnnotations {
  /** Nodes keyed by `lineKey(side, line)`, rendered under the matching line. */
  byKey: ReadonlyMap<string, ReactNode>;
  /** Heading for the trailing block of keys that matched no rendered line. */
  unanchoredTitle?: ReactNode;
  /** Rendered next to the file path in the header. */
  marker?: ReactNode;
  /**
   * Colours the code line itself at `lineKey(side, line)` (e.g. a left bar)
   * and renders `label` at the line's right edge. This is a fact about the
   * line, not a comment thread, so a caller may keep it populated even while
   * `byKey` is emptied to honour a "hide comments" toggle.
   */
  lineDecor?: ReadonlyMap<string, { color: string; label: ReactNode }>;
}

/**
 * Split annotation entries into those that match a rendered line key and
 * ones that don't ("unanchored"), mirroring `partitionThreads` so nothing is
 * silently dropped.
 */
export function partitionAnnotations(
  byKey: ReadonlyMap<string, ReactNode>,
  renderedKeys: Set<string>,
): { anchored: Map<string, ReactNode>; unanchoredKeys: string[] } {
  const anchored = new Map<string, ReactNode>();
  const unanchoredKeys: string[] = [];
  for (const [key, node] of byKey) {
    if (renderedKeys.has(key)) anchored.set(key, node);
    else unanchoredKeys.push(key);
  }
  return { anchored, unanchoredKeys };
}
