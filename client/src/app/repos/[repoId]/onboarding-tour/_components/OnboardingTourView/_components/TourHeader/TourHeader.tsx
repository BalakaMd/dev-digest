"use client";

import React from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { NOW_INTERVAL_MS } from "../../constants";
import { repoNameOf } from "../../helpers";
import { s } from "./styles";

/** Heading, provenance line, Regenerate / Share link and the "changed since" notes. */
export function TourHeader({
  fullName,
  generatedAt,
  indexedFiles,
  languageChanged,
  indexChanged,
  regenerateDisabled,
  regenerating,
  onRegenerate,
  onShare,
}: {
  fullName: string;
  generatedAt: string;
  indexedFiles: number;
  languageChanged: boolean;
  indexChanged: boolean;
  regenerateDisabled: boolean;
  regenerating: boolean;
  onRegenerate: () => void;
  onShare: () => void;
}) {
  const t = useTranslations("onboarding");
  const format = useFormatter();
  const now = useNow({ updateInterval: NOW_INTERVAL_MS });
  const shareHint = t("share.hint");
  return (
    <header style={s.root}>
      <div style={s.row}>
        <h1 style={s.title}>
          {t("heading")} <span className="mono" style={s.repo}>{repoNameOf(fullName)}</span>
        </h1>
        <div style={s.actions}>
          <Button
            kind="secondary"
            icon="RefreshCw"
            disabled={regenerateDisabled}
            loading={regenerating}
            onClick={onRegenerate}
          >
            {t("regenerate")}
          </Button>
          <Button
            kind="secondary"
            icon="Link"
            title={shareHint}
            aria-describedby="onboarding-share-hint"
            onClick={onShare}
          >
            {t("share.label")}
          </Button>
          <span id="onboarding-share-hint" style={s.hidden}>
            {shareHint}
          </span>
        </div>
      </div>
      <p style={s.provenance}>
        {t("provenance", {
          count: indexedFiles,
          when: format.relativeTime(new Date(generatedAt), now),
        })}
      </p>
      {(languageChanged || indexChanged) && (
        <div style={s.changes}>
          {languageChanged && (
            <span style={s.change}>
              <Icon.Info size={14} aria-hidden /> {t("languageChanged")}
            </span>
          )}
          {indexChanged && (
            <span style={s.change}>
              <Icon.Info size={14} aria-hidden /> {t("indexChanged")}
            </span>
          )}
        </div>
      )}
    </header>
  );
}
