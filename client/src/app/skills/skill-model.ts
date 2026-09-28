/* skill-model.ts — framework-free rules about a skill, shared by the Skills
   list, the import flow and the skill editor. */
import type { Skill, SkillType } from "@devdigest/shared";

export { SKILL_TYPES, approxTokens } from "../../lib/skill";

/** Sources whose text was written outside this editor — badged as imported. */
const IMPORTED_SOURCES: readonly Skill["source"][] = ["imported", "imported_url", "community"];

export function isImported(skill: Pick<Skill, "source">): boolean {
  return IMPORTED_SOURCES.includes(skill.source);
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
