/* SkillBodyEditor — the markdown body of a skill-to-be, as an editable file:
   header with `<name>.md`, an "unsaved" badge and a token estimate, and a
   line-number gutter kept in step with the textarea's scroll. Lines never wrap,
   so every gutter number sits next to exactly one line. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { approxTokens } from "@/lib/skill";
import { s } from "./styles";

export function SkillBodyEditor({
  fileName,
  value,
  onChange,
  rows = 14,
}: {
  fileName: string;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
}) {
  const t = useTranslations("conventions");
  const gutterRef = React.useRef<HTMLDivElement>(null);
  const lineCount = value.split("\n").length;

  const syncGutter = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
  };

  return (
    <div style={s.frame}>
      <div style={s.header}>
        <Icon.FileText size={13} style={s.fileIcon} />
        <span className="mono" style={s.fileName}>
          {fileName}.md
        </span>
        <span style={s.unsaved}>{t("modal.unsaved")}</span>
        <span className="mono" style={s.tokens}>
          {t("modal.tokens", { count: approxTokens(value) })}
        </span>
      </div>
      <div style={s.body}>
        <div ref={gutterRef} aria-hidden style={s.gutter(rows)} data-testid="skill-body-gutter">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} style={s.lineNo}>
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          className="mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncGutter}
          aria-label={t("modal.body")}
          spellCheck={false}
          wrap="off"
          rows={rows}
          style={s.textarea}
        />
      </div>
    </div>
  );
}
