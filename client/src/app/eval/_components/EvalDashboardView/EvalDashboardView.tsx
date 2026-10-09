/* EvalDashboardView — /eval: every agent with its latest eval metrics, the 10
   most recent runs of all agents, and "Run all agents" (SPEC-06 AC-35, 36, 44).
   Metrics, latest run and sparkline use completed runs only (server-side); the
   runs table lists failed and running runs with their status (Q-6). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { EvalSuiteRun } from "@devdigest/shared";
import { AppShell } from "../../../../components/app-shell";
import { useEvalDashboard, useRunAllAgents } from "../../../../lib/hooks";
import { formatMetricPct, formatRunTime } from "../../../../lib/format";
import { AgentEvalRow } from "../AgentEvalRow";
import { s } from "./styles";

function RunStatus({ run }: { run: EvalSuiteRun }) {
  const t = useTranslations("eval");
  if (run.status === "running") {
    return <span style={s.statusRunning}>{t("dashboard.status.running", { done: run.cases_done, total: run.cases_total })}</span>;
  }
  if (run.status === "failed") {
    return <span style={s.statusFailed}>{t("dashboard.status.failed", { reason: run.error ?? "" })}</span>;
  }
  return <span style={s.statusDone}>{t("dashboard.status.done")}</span>;
}

export function EvalDashboardView() {
  const t = useTranslations("eval");
  const dash = useEvalDashboard();
  const runAll = useRunAllAgents();
  const [announcement, setAnnouncement] = React.useState("");

  const agents = dash.data?.agents ?? [];
  const runs = dash.data?.recent_runs ?? [];
  const nameOf = (r: EvalSuiteRun) => r.agent_name ?? agents.find((a) => a.agent_id === r.agent_id)?.name ?? "";

  const onRunAll = () => {
    runAll.mutate(undefined, {
      onSuccess: (res) =>
        setAnnouncement(res.started.length ? t("dashboard.runAllStarted", { count: res.started.length }) : t("dashboard.runAllNone")),
      // Failure is surfaced by the global mutation-error toast (lib/providers.tsx).
    });
  };

  return (
    <AppShell crumb={[{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("dashboard.title")}</h1>
            <p style={s.subtitle}>{t("dashboard.subtitleAll")}</p>
          </div>
          <Button kind="primary" icon="Play" loading={runAll.isPending} onClick={onRunAll}>
            {t("dashboard.runAll")}
          </Button>
        </div>
        <div role="status" data-testid="dashboard-status" style={s.status}>
          {announcement}
        </div>

        {dash.isLoading ? (
          <div aria-busy="true" aria-label={t("dashboard.loading")} style={s.list}>
            <Skeleton height={72} />
            <Skeleton height={72} />
            <Skeleton height={72} />
          </div>
        ) : dash.isError ? (
          <ErrorState title={t("dashboard.loadError")} body={dash.error.message} onRetry={() => dash.refetch()} />
        ) : (
          <>
            <h2 style={s.heading}>{t("dashboard.agentsHeading")}</h2>
            {agents.length === 0 ? (
              <EmptyState icon="Cpu" title={t("dashboard.agentsHeading")} body={t("dashboard.noAgents")} />
            ) : (
              <div style={s.list}>
                {agents.map((a) => (
                  <AgentEvalRow key={a.agent_id} agent={a} />
                ))}
              </div>
            )}

            <h2 style={s.heading}>{t("dashboard.recentHeading")}</h2>
            {runs.length === 0 ? (
              <p style={s.subtitle}>{t("dashboard.recentEmpty")}</p>
            ) : (
              <div style={s.tableWrap}>
                <table style={s.table} aria-label={t("dashboard.recentCaption")}>
                  <thead>
                    <tr>
                      {(["agent", "ranAt", "version", "recall", "precision", "citation", "pass", "status"] as const).map((k) => (
                        <th key={k} scope="col" style={s.th}>
                          {t(`dashboard.table.${k}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.id} data-testid={`run-row-${r.id}`}>
                        <td style={{ ...s.td, ...s.strong }}>{nameOf(r)}</td>
                        <td style={{ ...s.td, ...s.mono }}>{formatRunTime(r.started_at)}</td>
                        <td style={{ ...s.td, ...s.mono }}>v{r.agent_version}</td>
                        <td style={s.td}>{formatMetricPct(r.recall)}</td>
                        <td style={s.td}>{formatMetricPct(r.precision)}</td>
                        <td style={s.td}>{formatMetricPct(r.citation_accuracy)}</td>
                        <td style={{ ...s.td, ...s.strong }}>
                          {r.cases_passed}/{r.cases_total - r.cases_errored}
                        </td>
                        <td style={s.td}>
                          <RunStatus run={r} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
