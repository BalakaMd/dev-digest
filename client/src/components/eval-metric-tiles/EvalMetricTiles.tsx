/* EvalMetricTiles — recall / precision / citation accuracy / cases passed of the
   latest completed eval run, each metric with its signed change in percentage
   points against the previous completed run (SPEC-06 AC-27, 29, 63). Shared by
   the agent editor's Evals tab and the dashboard agent view. A metric without a
   value shows "—"; with a single completed run there is no delta (EC-19). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalSuiteRun } from "@devdigest/shared";
import { formatDeltaPts, formatMetricPct } from "../../lib/format";
import { s } from "./styles";

type Metric = "recall" | "precision" | "citation_accuracy";

/** Change of a metric in percentage points; null when either run has no value. */
export function metricDeltaPp(
  latest: EvalSuiteRun | null | undefined,
  previous: EvalSuiteRun | null | undefined,
  metric: Metric,
): number | null {
  const a = latest?.[metric];
  const b = previous?.[metric];
  if (a == null || b == null) return null;
  return (a - b) * 100;
}

const TILES: ReadonlyArray<{ metric: Metric; labelKey: string }> = [
  { metric: "recall", labelKey: "dashboard.metrics.recall" },
  { metric: "precision", labelKey: "dashboard.metrics.precision" },
  { metric: "citation_accuracy", labelKey: "dashboard.metrics.citationAccuracy" },
];

export function EvalMetricTiles({
  latest,
  previous,
}: {
  /** Latest completed run; null = none yet. */
  latest: EvalSuiteRun | null;
  /** The completed run before it, if any. */
  previous?: EvalSuiteRun | null;
}) {
  const t = useTranslations("eval");
  const scored = latest ? latest.cases_total - latest.cases_errored : 0;
  return (
    <div>
      <div style={s.grid}>
        {TILES.map(({ metric, labelKey }) => {
          const pp = metricDeltaPp(latest, previous, metric);
          const delta = pp == null ? "" : formatDeltaPts(pp);
          return (
            <div key={metric} style={s.tile} data-testid={`metric-tile-${metric}`}>
              <div style={s.label}>{t(labelKey)}</div>
              <div style={s.valueRow}>
                <span style={s.value}>{formatMetricPct(latest?.[metric])}</span>
                {delta && <span style={s.delta(pp ?? 0)}>{delta}</span>}
              </div>
            </div>
          );
        })}
        <div style={s.tile} data-testid="metric-tile-passed">
          <div style={s.label}>{t("dashboard.metrics.casesPassed")}</div>
          <div style={s.valueRow}>
            <span style={s.value}>{latest ? `${latest.cases_passed}/${scored}` : "—"}</span>
          </div>
          {latest && latest.cases_errored > 0 && (
            <div style={s.note}>{t("dashboard.erroredCases", { count: latest.cases_errored })}</div>
          )}
        </div>
      </div>
    </div>
  );
}
