/* RegressionBanner — warning when the latest completed run lowered recall, precision
   or citation accuracy by at least 1 pp against the previous one: names each lowered
   metric with its drop and the cases that went passed → failed (SPEC-06 AC-42). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { MetricDrop } from "../../regression";
import { s } from "./styles";

const LABEL_KEY = {
  recall: "dashboard.legend.recall",
  precision: "dashboard.legend.precision",
  citation_accuracy: "dashboard.legend.citation",
} as const;

export function RegressionBanner({
  drops,
  version,
  previousVersion,
  flipped,
  flippedLoading,
}: {
  drops: MetricDrop[];
  version: number;
  previousVersion: number;
  /** Names of the cases that went from passed to failed. */
  flipped: string[];
  flippedLoading: boolean;
}) {
  const t = useTranslations("eval");
  return (
    <section role="status" aria-label={t("agentView.regressionTitle", { version })} style={s.banner} data-testid="regression-banner">
      <Icon.AlertTriangle size={18} aria-hidden="true" style={s.icon} />
      <div style={s.body}>
        <div>
          <strong>{t("agentView.regressionTitle", { version })}</strong>
          {" — "}
          {drops.map((d, i) => (
            <span key={d.metric}>
              {i > 0 && ", "}
              {t("agentView.regressionDrop", { metric: t(LABEL_KEY[d.metric]), pp: Math.round(d.pp * 10) / 10 })}
            </span>
          ))}{" "}
          <span style={s.muted}>({t("agentView.regressionVs", { version: previousVersion })})</span>
        </div>
        {flippedLoading ? (
          <div style={s.muted}>{t("agentView.regressionFlippedLoading")}</div>
        ) : (
          flipped.length > 0 && <div>{t("agentView.regressionFlipped", { cases: flipped.join(", ") })}</div>
        )}
      </div>
    </section>
  );
}
