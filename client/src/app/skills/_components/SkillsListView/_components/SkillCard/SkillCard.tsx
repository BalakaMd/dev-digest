/* SkillCard — one skill in the Skills grid: name, type, directive description,
   global enable toggle, current version, how many agents link it, and delete.
   Clicking the card opens the preview drawer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { SkillSummary } from "@devdigest/shared";
import { SkillTypeBadge } from "../../../../../../components/skill-type-badge";
import { isImported } from "../../../../skill-model";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onOpen,
  onToggle,
  onDelete,
}: {
  skill: SkillSummary;
  active?: boolean;
  onOpen: () => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("skills");
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`skill-card-${skill.name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={s.card(!!active, skill.enabled)}
    >
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={14} />
        </div>
        <span className="mono" style={s.name} title={skill.name}>
          {skill.name}
        </span>
        <div onClick={stop} onKeyDown={stop} aria-label={t("card.enable", { name: skill.name })}>
          <Toggle on={skill.enabled} onChange={onToggle} size={14} />
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          onKeyDown={stop}
          title={t("card.delete", { name: skill.name })}
          aria-label={t("card.delete", { name: skill.name })}
          style={s.deleteBtn}
        >
          <Icon.Trash size={14} />
        </button>
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <SkillTypeBadge type={skill.type} />
        {isImported(skill) && (
          <Badge color="var(--warn)" icon="Upload">
            {t("card.imported")}
          </Badge>
        )}
        <span style={s.spacer} />
        <span className="mono" style={s.meta}>
          {t("card.version", { version: skill.version })}
        </span>
        <span style={s.meta}>
          <Icon.Cpu size={12} /> {t("card.agentCount", { count: skill.agent_count })}
        </span>
      </div>
    </div>
  );
}
