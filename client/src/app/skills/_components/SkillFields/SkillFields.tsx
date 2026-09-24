/* SkillFields — the four editable fields of a skill (name, directive
   description, type, markdown body). Controlled: the parent owns the draft.
   Used by the create modal, the import preview and the editor's Config tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, TextInput } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES, approxTokens, type SkillDraft } from "../../skill-model";
import { s } from "./styles";

export function SkillFields({
  draft,
  onChange,
  bodyRows = 14,
}: {
  draft: SkillDraft;
  onChange: (next: SkillDraft) => void;
  bodyRows?: number;
}) {
  const t = useTranslations("skills");
  const set = <K extends keyof SkillDraft>(key: K, value: SkillDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <div style={s.fields}>
      <FormField label={t("form.name")} required>
        <TextInput
          value={draft.name}
          onChange={(v) => set("name", v)}
          placeholder={t("form.namePlaceholder")}
          aria-label={t("form.name")}
          mono
        />
      </FormField>
      <FormField label={t("form.description")} hint={t("form.descriptionHint")}>
        <TextInput
          value={draft.description}
          onChange={(v) => set("description", v)}
          placeholder={t("form.descriptionPlaceholder")}
          aria-label={t("form.description")}
        />
      </FormField>
      <FormField label={t("form.type")}>
        <SelectInput
          value={draft.type}
          onChange={(v) => set("type", v as SkillType)}
          options={SKILL_TYPES.map((v) => ({ value: v, label: t(`type.${v}`) }))}
        />
      </FormField>
      <FormField
        label={t("form.body")}
        hint={t("form.bodyHint")}
        required
        right={
          <span className="mono" style={s.tokens}>
            {t("form.tokens", { count: approxTokens(draft.body) })}
          </span>
        }
      >
        <textarea
          className="mono"
          value={draft.body}
          onChange={(e) => set("body", e.target.value)}
          placeholder={t("form.bodyPlaceholder")}
          aria-label={t("form.body")}
          spellCheck={false}
          rows={bodyRows}
          style={s.body}
        />
      </FormField>
    </div>
  );
}
