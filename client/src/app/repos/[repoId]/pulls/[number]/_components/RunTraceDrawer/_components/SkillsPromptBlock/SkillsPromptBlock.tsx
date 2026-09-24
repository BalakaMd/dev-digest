/* SkillsPromptBlock — the prompt's skills block, one sub-block per injected
   skill in prompt order, with the token weight of the skills block ALONE (not
   the whole prompt). A disabled / unlinked skill has no sub-block at all. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { PromptAssembly } from "@devdigest/shared";
import { s } from "../../styles";
import { PromptBlock } from "../PromptBlock";
import { splitSkillBlocks } from "./split-skill-blocks";

export function SkillsPromptBlock({ assembly, color }: { assembly: PromptAssembly; color: string }) {
  const t = useTranslations("runs");
  const text = assembly.skills ?? "";
  const skills = assembly.skill_blocks ?? [];
  const parts = skills.length > 0 ? splitSkillBlocks(text, skills.map((b) => b.name)) : null;
  const meta =
    assembly.skills_tokens != null ? t("trace.prompt.skillsTokens", { count: assembly.skills_tokens }) : undefined;

  // Traces from before per-skill stats: one undivided block, as before.
  if (!parts) return <PromptBlock label={t("trace.prompt.skills")} text={text} color={color} meta={meta} />;

  return (
    <div style={s.skillsGroup} data-testid="skills-prompt-block">
      <div style={s.skillsGroupHead}>
        <span style={s.promptDot(color)} />
        <span style={s.promptLabel}>{t("trace.prompt.skills")}</span>
        <Badge color="var(--text-secondary)">{t("trace.prompt.skillCount", { count: skills.length })}</Badge>
        {meta && (
          <span className="mono" style={s.promptMeta}>
            {meta}
          </span>
        )}
      </div>
      {skills.map((b, i) => (
        <PromptBlock
          key={`${i}-${b.name}`}
          label={`${i + 1}. ${b.name}`}
          text={parts[i] ?? ""}
          color={color}
          meta={t("trace.prompt.skillTokens", { count: b.tokens })}
        />
      ))}
    </div>
  );
}
