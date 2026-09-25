/* skill.ts — framework-free rules about a skill used by more than one feature
   (the Skills pages and the Conventions → skill modal). */
import type { SkillType } from "@devdigest/shared";

/** Selectable types, in the order the editors offer them. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/**
 * Rough token count for the body-size hint. The server counts with tiktoken;
 * the client has no tokenizer, so this is the `chars / 4` heuristic the server
 * itself falls back to — always rendered with a `~` for that reason.
 */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
