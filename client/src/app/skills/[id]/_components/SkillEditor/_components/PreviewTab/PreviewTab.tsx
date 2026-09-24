/* PreviewTab — the skill body rendered as formatted markdown, i.e. the way a
   reviewing agent receives it (not the raw source). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { isImported } from "../../../../../skill-model";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("preview.intro")}</p>
      {isImported(skill) && (
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.5,
            padding: "10px 12px",
            borderRadius: 7,
            background: "var(--warn-bg)",
            color: "var(--text-secondary)",
          }}
        >
          {t("import.trust")}
        </div>
      )}
      <div
        data-testid="skill-preview"
        style={{
          fontSize: 14,
          padding: "18px 22px",
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "var(--bg-elevated)",
        }}
      >
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}
