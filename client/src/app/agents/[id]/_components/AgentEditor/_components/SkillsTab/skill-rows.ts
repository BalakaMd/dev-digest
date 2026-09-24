/* skill-rows.ts — the pure model behind the agent's Skills tab. Every skill in
   the workspace is a row; a row is ENABLED for this agent when it is linked.
   Enabled rows come first, in link order (= the order of the blocks in the
   prompt); the rest follow alphabetically and cannot be dragged. */
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

/** Enable (append to the end of the prompt order) or disable (unlink) a skill. */
export function toggleRow(rows: SkillRow[], id: string, enabled: boolean): SkillRow[] {
  const row = rows.find((r) => r.id === id);
  if (!row || row.enabled === enabled) return rows;
  const enabledRows = rows.filter((r) => r.enabled && r.id !== id);
  const rest = rows.filter((r) => !r.enabled && r.id !== id);
  if (enabled) return [...enabledRows, { ...row, enabled: true }, ...rest];
  const disabled = [...rest, { ...row, enabled: false }].sort((a, b) => a.name.localeCompare(b.name));
  return [...enabledRows, ...disabled];
}

/**
 * Move an enabled row from index `from` to index `to`. Both must point at
 * enabled rows: a skill that is off has no place in the prompt to move to.
 */
export function moveRow(rows: SkillRow[], from: number, to: number): SkillRow[] {
  const enabledCount = rows.filter((r) => r.enabled).length;
  if (from === to || from < 0 || to < 0 || from >= enabledCount || to >= enabledCount) return rows;
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
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
