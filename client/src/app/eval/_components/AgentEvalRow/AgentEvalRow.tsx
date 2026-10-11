/* AgentEvalRow — one agent of the Eval Dashboard (SPEC-06 AC-35, 64): name,
   model, disabled badge, latest completed run (version, time, passed/total),
   recall sparkline, the three metrics, or "never run". The whole row links to
   the agent's dashboard. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon, Sparkline } from "@devdigest/ui";
import type { EvalDashboardAgent } from "@devdigest/shared";
import { formatMetricPct, formatRunTime } from "../../../../lib/format";
import { s } from "./styles";

const METRICS = [
  { key: "recall", labelKey: "dashboard.metrics.recall" },
  { key: "precision", labelKey: "dashboard.metrics.precision" },
  { key: "citation_accuracy", labelKey: "dashboard.metrics.citationAccuracy" },
] as const;

export function AgentEvalRow({ agent }: { agent: EvalDashboardAgent }) {
  const t = useTranslations("eval");
  const { latest, running } = agent;
  // Sparkline draws only real points; null recall points are skipped (AC-63).
  const spark = agent.recall_spark.filter((v): v is number => v != null);

  return (
    <Link
      href={`/eval/${agent.agent_id}`}
      style={s.row}
      aria-label={t("dashboard.viewAgent", { name: agent.name })}
      data-testid={`agent-row-${agent.agent_id}`}
    >
      <div style={s.main}>
        <div style={s.titleRow}>
          <span style={s.name}>{agent.name}</span>
          <span style={s.chip}>{agent.model}</span>
          {!agent.enabled && <span style={s.badge}>{t("dashboard.disabled")}</span>}
        </div>
        <div style={s.sub}>
          {latest
            ? `${t("dashboard.latestRun")} v${latest.agent_version} · ${formatRunTime(latest.started_at)} · ${t("dashboard.passRate", { passed: latest.cases_passed, total: latest.cases_total - latest.cases_errored })}`
            : t("dashboard.neverRun")}
          {" · "}
          {agent.cases_total > 0 ? t("dashboard.casesCount", { count: agent.cases_total }) : t("dashboard.noCases")}
        </div>
        {running && (
          <div style={s.progress}>{t("dashboard.progress", { done: running.cases_done, total: running.cases_total })}</div>
        )}
      </div>
      {spark.length > 1 && (
        <div style={s.spark} role="img" aria-label={t("dashboard.sparkLabel")}>
          <Sparkline data={spark} color="var(--accent)" />
        </div>
      )}
      <div style={s.metrics}>
        {METRICS.map(({ key, labelKey }) => (
          <div key={key} style={s.metric}>
            <span style={s.metricLabel}>{t(labelKey)}</span>
            <span style={s.metricValue}>{latest ? formatMetricPct(latest[key]) : t("dashboard.noValue")}</span>
          </div>
        ))}
      </div>
      <Icon.ChevronRight size={16} style={s.chevron} aria-hidden="true" />
    </Link>
  );
}
