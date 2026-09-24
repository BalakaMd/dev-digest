/* skill-rows.ts — the pure model behind the agent's Skills tab. Every skill in
   the workspace is a row; a row is ENABLED for this agent when it is linked.
   The prompt order is the order of the enabled rows as they appear in the list.

   The list is laid out once — enabled rows first in link order, the rest
   alphabetically — and then stays put: toggling a skill flips it in place and
   never moves it, so the row under the cursor is still the row that was just
   clicked. Only a drag or ↑/↓ moves a row. */
import type { AgentSkillDetail, SkillSummary } from "@devdigest/shared";

export interface SkillRow {
  id: string;
  name: string;
  description: string;
  type: SkillSummary["type"];
  /** The skill's own global switch — when false it reaches no agent's prompt. */
  globallyEnabled: boolean;
  /** Linked to (enabled for) this agent. */
  enabled: boolean;
}

/** The initial layout: linked skills first in link order, the rest alphabetically. */
export function buildRows(all: SkillSummary[], linked: AgentSkillDetail[]): SkillRow[] {
  const known = new Map(all.map((sk) => [sk.id, sk]));
  const linkedIds = new Set(linked.map((l) => l.id));
  const toRow = (sk: SkillSummary | AgentSkillDetail, enabled: boolean): SkillRow => ({
    id: sk.id,
    name: sk.name,
    description: sk.description,
    type: sk.type,
    globallyEnabled: sk.enabled,
    enabled,
  });

  const enabledRows = [...linked]
    .sort((a, b) => a.order - b.order)
    // A link whose skill vanished from the list (deleted elsewhere) is dropped.
    .filter((l) => known.has(l.id))
    .map((l) => toRow(l, true));
  const rest = all
    .filter((sk) => !linkedIds.has(sk.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((sk) => toRow(sk, false));
  return [...enabledRows, ...rest];
}

/**
 * Lay the server's rows out in the order the user last saw (`layout`, a list
 * of ids). Skills not in the layout go to the end. When the enabled rows would
 * come out in a different order than the server's prompt order — the links
 * changed somewhere else — the layout is stale and the server's wins.
 */
export function arrangeRows(rows: SkillRow[], layout: string[] | null): SkillRow[] {
  if (!layout) return rows;
  const position = new Map(layout.map((id, i) => [id, i]));
  const arranged = [...rows].sort(
    (a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity),
  );
  const same = toSkillIds(arranged).every((id, i) => id === toSkillIds(rows)[i]);
  return same ? arranged : rows;
}

/** Enable (link) or disable (unlink) a skill, leaving it where it is. */
export function toggleRow(rows: SkillRow[], id: string, enabled: boolean): SkillRow[] {
  if (!rows.some((r) => r.id === id && r.enabled !== enabled)) return rows;
  return rows.map((r) => (r.id === id ? { ...r, enabled } : r));
}

/** Move the ENABLED row at `from` to position `to` in the list. */
export function moveRow(rows: SkillRow[], from: number, to: number): SkillRow[] {
  if (from === to || !rows[from]?.enabled || to < 0 || to >= rows.length) return rows;
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/**
 * Where ↑ (-1) or ↓ (+1) takes the enabled row at `index`: the slot of the
 * nearest enabled row in that direction, so each press changes the prompt
 * order by exactly one place. `null` when it is already first or last.
 */
export function stepTarget(rows: SkillRow[], index: number, direction: -1 | 1): number | null {
  for (let i = index + direction; i >= 0 && i < rows.length; i += direction) {
    if (rows[i]!.enabled) return i;
  }
  return null;
}

/** 1-based position of each enabled row in the prompt, keyed by skill id. */
export function promptPositions(rows: SkillRow[]): Map<string, number> {
  return new Map(toSkillIds(rows).map((id, i) => [id, i + 1]));
}

/** The POST body: enabled skill ids, in prompt order. */
export function toSkillIds(rows: SkillRow[]): string[] {
  return rows.filter((r) => r.enabled).map((r) => r.id);
}

/** How many skills actually reach the prompt: enabled here AND globally on. */
export function countActive(rows: SkillRow[]): number {
  return rows.filter((r) => r.enabled && r.globallyEnabled).length;
}

/** Case-insensitive match on the skill name. */
export function matchesName(row: SkillRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || row.name.toLowerCase().includes(q);
}

/**
 * Where a drag released at `y` lands, given the tops of the rows in order: the
 * last row whose top is at or above the pointer (so a gap between rows counts
 * as the row above it), clamped to the first row.
 */
export function dropIndexAt(tops: number[], y: number): number {
  let index = 0;
  tops.forEach((top, i) => {
    if (top <= y) index = i;
  });
  return index;
}
