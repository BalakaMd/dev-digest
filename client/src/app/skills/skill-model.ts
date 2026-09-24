/* skill-model.ts — framework-free rules about a skill, shared by the Skills
   list, the import flow and the skill editor. */
import type { Skill, SkillType } from "@devdigest/shared";

/** Selectable types, in the order the editor offers them. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Sources whose text was written outside this editor — badged as imported. */
const IMPORTED_SOURCES: readonly Skill["source"][] = ["imported", "imported_url", "community"];

export function isImported(skill: Pick<Skill, "source">): boolean {
  return IMPORTED_SOURCES.includes(skill.source);
}

/**
 * Rough token count for the body-size hint. The server counts with tiktoken;
 * the client has no tokenizer, so this is the `chars / 4` heuristic the server
 * itself falls back to — always rendered with a `~` for that reason.
 */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Case-insensitive match over name, description and type. */
export function matchesSkillQuery(
  skill: Pick<Skill, "name" | "description" | "type">,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    skill.name.toLowerCase().includes(q) ||
    skill.description.toLowerCase().includes(q) ||
    skill.type.includes(q)
  );
}

/** The editable fields of a skill, as held by a form. */
export interface SkillDraft {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export const EMPTY_DRAFT: SkillDraft = { name: "", description: "", type: "custom", body: "" };

export function isDraftComplete(draft: SkillDraft): boolean {
  return draft.name.trim().length > 0 && draft.body.trim().length > 0;
}
