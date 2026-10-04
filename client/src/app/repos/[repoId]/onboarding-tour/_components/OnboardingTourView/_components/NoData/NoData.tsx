"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

/** Shown in place of a section the generation left empty (AC-21). */
export function NoData({
  onRegenerate,
  regenerateDisabled,
}: {
  onRegenerate: () => void;
  regenerateDisabled?: boolean;
}) {
  const t = useTranslations("onboardingSections");
  return (
    <div style={s.root}>
      <span style={s.text}>{t("noData.text")}</span>
      <Button kind="secondary" size="sm" icon="RefreshCw" disabled={regenerateDisabled} onClick={onRegenerate}>
        {t("noData.regenerate")}
      </Button>
    </div>
  );
}
