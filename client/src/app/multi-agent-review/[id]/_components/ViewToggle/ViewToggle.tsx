/* ViewToggle — Columns / Tabs switch of the result page: two buttons with
   `aria-pressed`. Presentational; the mode lives in the URL (owned by the parent). */
"use client";

import { useTranslations } from "next-intl";
import { s } from "./styles";

export type ViewMode = "columns" | "tabs";

export interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const MODES: ViewMode[] = ["columns", "tabs"];

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  const t = useTranslations("multiAgentResults");
  return (
    <div role="group" aria-label={t("viewToggleLabel")} style={s.group}>
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={value === m}
          style={{ ...s.button, ...(value === m ? s.buttonActive : null) }}
          onClick={() => onChange(m)}
        >
          {t(m)}
        </button>
      ))}
    </div>
  );
}
