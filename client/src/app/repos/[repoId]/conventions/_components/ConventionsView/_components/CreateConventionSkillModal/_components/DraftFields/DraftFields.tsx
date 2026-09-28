/* DraftFields — every editable part of one skill draft: name, description,
   type, enabled, and the markdown body. Controlled by the modal. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { ConventionSkillDraft, SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "@/lib/skill";
import { SkillBodyEditor } from "../../../SkillBodyEditor";
import { s } from "./styles";

export function DraftFields({
  draft,
  onChange,
}: {
  draft: ConventionSkillDraft;
  onChange: (next: ConventionSkillDraft) => void;
}) {
  const t = useTranslations("conventions");
  const tSkills = useTranslations("skills");
  const set = <K extends keyof ConventionSkillDraft>(key: K, value: ConventionSkillDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <div>
      <FormField label={t("modal.name")} required>
        <TextInput value={draft.name} onChange={(v) => set("name", v)} aria-label={t("modal.name")} mono />
      </FormField>
      <FormField label={t("modal.description")}>
        <TextInput
          value={draft.description}
          onChange={(v) => set("description", v)}
          aria-label={t("modal.description")}
        />
      </FormField>
      <div style={s.row}>
        <div style={s.col}>
          <FormField label={t("modal.type")}>
            <SelectInput
              value={draft.type}
              onChange={(v) => set("type", v as SkillType)}
              options={SKILL_TYPES.map((v) => ({ value: v, label: tSkills(`type.${v}`) }))}
            />
          </FormField>
        </div>
        <div style={s.col}>
          <FormField label={t("modal.enabled")} hint={t("modal.enabledHint")}>
            <div style={s.toggle} aria-label={t("modal.enabled")}>
              <Toggle on={draft.enabled} onChange={(v) => set("enabled", v)} size={20} />
            </div>
          </FormField>
        </div>
      </div>
      <FormField label={t("modal.body")} required>
        <SkillBodyEditor fileName={draft.name.trim() || "skill"} value={draft.body} onChange={(v) => set("body", v)} />
      </FormField>
    </div>
  );
}
