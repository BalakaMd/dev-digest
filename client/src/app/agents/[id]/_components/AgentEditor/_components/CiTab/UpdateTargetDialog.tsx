/* "Update CI config" with several installations: ask which one to update (AC-42).
   An inline, labelled panel — the wizard keeps its own dialog shell. Escape cancels. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { CiInstallation } from "@devdigest/shared";
import { s } from "./styles";

export function UpdateTargetDialog({
  installations,
  onPick,
  onCancel,
}: {
  installations: CiInstallation[];
  onPick: (installation: CiInstallation) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("ci");
  const [selected, setSelected] = React.useState(installations[0]?.id ?? "");
  const titleId = React.useId();
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => ref.current?.querySelector<HTMLInputElement>("input:checked")?.focus(), []);

  const picked = installations.find((i) => i.id === selected);
  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={titleId}
      style={s.panel}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <h3 id={titleId} style={s.panelTitle}>
        {t("ciTab.targetPicker.title")}
      </h3>
      <fieldset style={s.fieldset}>
        <legend className="sr-only">{t("ciTab.targetPicker.legend")}</legend>
        {installations.map((i) => (
          <label key={i.id} style={s.radio}>
            <input
              type="radio"
              name="ci-update-target"
              value={i.id}
              checked={selected === i.id}
              onChange={() => setSelected(i.id)}
            />
            <span className="mono">{i.repo}</span>
          </label>
        ))}
      </fieldset>
      <div style={s.actions}>
        <Button kind="primary" disabled={!picked} onClick={() => picked && onPick(picked)}>
          {t("ciTab.targetPicker.continue")}
        </Button>
        <Button onClick={onCancel}>{t("ciTab.targetPicker.cancel")}</Button>
      </div>
    </div>
  );
}
