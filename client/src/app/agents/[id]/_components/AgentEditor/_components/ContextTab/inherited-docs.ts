/* inheritedDocs — the documents an agent inherits from its skills (AC-46):
   enabled skills in link order, each skill's documents in order, without
   repeats against the agent's own documents or earlier skills. */
import type { InheritedDoc } from "../../../../../../../components/context-doc-picker";

export interface SkillWithDocs {
  name: string;
  enabled: boolean;
  context_docs?: string[];
}

export function inheritedDocs(skills: readonly SkillWithDocs[], own: readonly string[]): InheritedDoc[] {
  const seen = new Set(own);
  const out: InheritedDoc[] = [];
  for (const skill of skills) {
    if (!skill.enabled) continue;
    for (const path of skill.context_docs ?? []) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push({ path, via: skill.name });
    }
  }
  return out;
}
