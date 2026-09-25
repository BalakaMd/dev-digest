/* draft-model.ts — rules for the editable skill drafts in the modal. */
import type { ConventionSkillDraft, CreateConventionSkillsInput } from "@devdigest/shared";

export function isDraftValid(d: Pick<ConventionSkillDraft, "name" | "body">): boolean {
  return d.name.trim().length > 0 && d.body.trim().length > 0;
}

/** The create payload: every draft as edited, names trimmed. */
export function toCreateInput(drafts: readonly ConventionSkillDraft[]): CreateConventionSkillsInput {
  return {
    skills: drafts.map((d) => ({
      name: d.name.trim(),
      description: d.description,
      type: d.type,
      enabled: d.enabled,
      body: d.body,
      convention_ids: d.convention_ids,
    })),
  };
}
