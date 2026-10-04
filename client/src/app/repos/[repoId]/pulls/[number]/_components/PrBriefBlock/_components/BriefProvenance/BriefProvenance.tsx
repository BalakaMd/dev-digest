"use client";

import React from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import type { PrBrief } from "@devdigest/shared";
import { shortSha } from "../../helpers";
import { NOW_INTERVAL_MS } from "../../constants";
import { s } from "./styles";

/** "Generated <relative time> · commit <sha7> · <model>" (AC-36). */
export function BriefProvenance({ brief }: { brief: PrBrief }) {
  const t = useTranslations("brief");
  const format = useFormatter();
  const now = useNow({ updateInterval: NOW_INTERVAL_MS });
  return (
    <p style={s.line}>
      {t("provenance", {
        time: format.relativeTime(new Date(brief.generated_at), now),
        sha: shortSha(brief.head_sha),
        model: brief.model,
      })}
    </p>
  );
}
