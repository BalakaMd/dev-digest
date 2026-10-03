/* context-doc-rows.ts — the pure model behind the shared context-document
   picker. Every effective document of the repository is a row; a row is
   ATTACHED when its path is in the attached list, whose order is the order of
   the documents in the assembled prompt block.

   The list is laid out once — attached rows in order, then documents inherited
   from skills, then the rest by path — and then stays put: toggling flips a row
   in place, only a drag or ↑/↓ moves one. */
import type { ContextDocEntry, ContextDocType } from "@devdigest/shared";

export interface InheritedDoc {
  path: string;
  /** Name of the skill the document comes from. */
  via: string;
}

export interface DocRow {
  path: string;
  name: string;
  folder: string;
  type: ContextDocType | null;
  local: boolean;
  /** Wrapped-block tokens; null when unknown (too large or missing). */
  tokens: number | null;
  tooLarge: boolean;
  /** Attached, but no longer present in the repository. */
  missing: boolean;
  attached: boolean;
  /** First enabled skill that attaches this document, when the agent does not. */
  via: string | null;
}

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function folderOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i + 1);
}

/**
 * Attached rows in order → inherited rows → the rest by path. A shadowed local
 * document is not shown (the repository copy is the effective one). An attached
 * path with no document becomes a checked "Missing" row.
 */
export function buildRows(input: {
  docs: ContextDocEntry[];
  attached: string[];
  inherited?: InheritedDoc[];
}): DocRow[] {
  const known = new Map(input.docs.filter((d) => !d.shadowed).map((d) => [d.path, d]));
  const attached = new Set(input.attached);
  const via = new Map<string, string>();
  for (const i of input.inherited ?? []) if (!via.has(i.path)) via.set(i.path, i.via);

  const toRow = (path: string, isAttached: boolean): DocRow => {
    const d = known.get(path);
    return {
      path,
      name: nameOf(path),
      folder: d?.folder ?? folderOf(path),
      type: d?.type ?? null,
      local: d?.source === "local",
      tokens: d?.tokens ?? null,
      tooLarge: d?.too_large ?? false,
      missing: !d,
      attached: isAttached,
      via: isAttached ? null : (via.get(path) ?? null),
    };
  };

  const seen = new Set<string>();
  const out: DocRow[] = [];
  const push = (path: string, isAttached: boolean) => {
    if (seen.has(path)) return;
    seen.add(path);
    out.push(toRow(path, isAttached));
  };
  for (const p of input.attached) push(p, true);
  for (const p of via.keys()) if (known.has(p)) push(p, attached.has(p));
  for (const p of [...known.keys()].sort((a, b) => a.localeCompare(b))) push(p, attached.has(p));
  return out;
}

/** Attached paths, in display order. */
export function attachedPaths(rows: DocRow[]): string[] {
  return rows.filter((r) => r.attached).map((r) => r.path);
}

export function countAttached(rows: DocRow[]): number {
  return rows.filter((r) => r.attached).length;
}

/** Every row, missing ones included: the M of the "N of M attached" counter. */
export function countRows(rows: DocRow[]): number {
  return rows.length;
}

/** Rows that can be attached or already are (everything but missing ones). */
export function countAvailable(rows: DocRow[]): number {
  return rows.filter((r) => !r.missing).length;
}

/**
 * Lay `rows` out in the order the user last saw (`layout`, a list of paths).
 * Paths not in the layout go last. When the attached rows would come out in a
 * different order than the server's attached list, the layout is stale and the
 * unarranged rows win.
 */
export function arrangeRows(rows: DocRow[], layout: string[] | null): DocRow[] {
  if (!layout) return rows;
  const position = new Map(layout.map((p, i) => [p, i]));
  const arranged = [...rows].sort(
    (a, b) => (position.get(a.path) ?? Infinity) - (position.get(b.path) ?? Infinity),
  );
  const want = attachedPaths(rows);
  const got = attachedPaths(arranged);
  return got.length === want.length && got.every((p, i) => p === want[i]) ? arranged : rows;
}

/** Attach or detach a document, leaving it where it is. */
export function toggle(rows: DocRow[], path: string, attached: boolean): DocRow[] {
  if (!rows.some((r) => r.path === path && r.attached !== attached)) return rows;
  return rows.map((r) => (r.path === path ? { ...r, attached, via: attached ? null : r.via } : r));
}

/** Move the ATTACHED row at `from` to position `to`. */
export function move(rows: DocRow[], from: number, to: number): DocRow[] {
  if (from === to || !rows[from]?.attached || to < 0 || to >= rows.length) return rows;
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/**
 * Where ↑ (-1) or ↓ (+1) takes the attached row at `index`: the slot of the
 * nearest attached row in that direction, so each press changes the prompt
 * order by one place. `null` when it is already first or last.
 */
export function stepTarget(rows: DocRow[], index: number, direction: -1 | 1): number | null {
  for (let i = index + direction; i >= 0 && i < rows.length; i += direction) {
    if (rows[i]!.attached) return i;
  }
  return null;
}

/**
 * Where a drag released at `y` lands, given the tops of the rows in order: the
 * last row whose top is at or above the pointer, clamped to the first row.
 */
export function dropIndexAt(tops: number[], y: number): number {
  let index = 0;
  tops.forEach((top, i) => {
    if (top <= y) index = i;
  });
  return index;
}

/** Case-insensitive "contains" on the document path. */
export function matchesPath(row: DocRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || row.path.toLowerCase().includes(q);
}

/**
 * The documents a run would inject, in order: attached rows, then the ones
 * inherited from skills. Rows that cannot be injected (missing, too large)
 * are left out.
 */
export function injectedRows(rows: DocRow[]): DocRow[] {
  const usable = (r: DocRow) => !r.missing && !r.tooLarge && r.tokens !== null;
  return [...rows.filter((r) => r.attached && usable(r)), ...rows.filter((r) => !r.attached && r.via && usable(r))];
}
