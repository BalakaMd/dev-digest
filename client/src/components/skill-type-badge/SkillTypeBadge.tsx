/* SkillTypeBadge — the coloured type label of a skill (rubric / convention /
   security / custom). Shared by the Skills page and the agent editor so a type
   reads the same everywhere. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { SkillType } from "@devdigest/shared";

const TYPE_COLORS: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};

export function SkillTypeBadge({ type }: { type: SkillType }) {
  const t = useTranslations("skills");
  const color = TYPE_COLORS[type];
  return (
    <span
      className="mono"
      style={{
        fontSize: 11,
        fontWeight: 600,
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        padding: "2px 8px",
        borderRadius: 4,
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      {t(`type.${type}`)}
    </span>
  );
}
