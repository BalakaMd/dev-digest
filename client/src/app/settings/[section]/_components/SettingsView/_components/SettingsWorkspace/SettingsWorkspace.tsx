"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput } from "@devdigest/ui";
import type { TourLanguage } from "@devdigest/shared";
import { useSettings, useUpdateSettings } from "../../../../../../../lib/hooks";
import { SectionTitle } from "../SectionTitle";
import { s } from "./styles";

/** Option labels are endonyms — deliberately not translated. */
const TOUR_LANGUAGE_LABELS: Record<TourLanguage, string> = {
  English: "English",
  Ukrainian: "Українська",
  Hebrew: "עברית",
};

/** Local copy: the client may import only types from `@devdigest/shared` (values break webpack). */
const TOUR_LANGUAGES: readonly TourLanguage[] = ["English", "Ukrainian", "Hebrew"];

function isTourLanguage(v: unknown): v is TourLanguage {
  return TOUR_LANGUAGES.includes(v as TourLanguage);
}

const TOUR_LANGUAGE_OPTIONS = TOUR_LANGUAGES.map((value) => ({
  value,
  label: TOUR_LANGUAGE_LABELS[value],
}));

/**
 * Settings → Workspace. Only the workspace-wide "Tour language" select: it
 * persists to `settings.tour_language` and defaults to English when unset.
 */
export function SettingsWorkspace() {
  const t = useTranslations("settings");
  const { data: settings } = useSettings();
  const update = useUpdateSettings();

  const stored = settings?.tour_language;
  const current: TourLanguage = isTourLanguage(stored) ? stored : "English";

  return (
    <div style={s.wrap}>
      <SectionTitle title={t("workspace.title")} body={t("workspace.body")} />
      <div style={s.row}>
        <FormField label={t("workspace.tourLanguage")} hint={t("workspace.tourLanguageHint")}>
          <SelectInput
            mono={false}
            value={current}
            onChange={(v) => {
              if (isTourLanguage(v)) update.mutate({ tour_language: v });
            }}
            options={TOUR_LANGUAGE_OPTIONS}
          />
        </FormField>
      </div>
    </div>
  );
}
