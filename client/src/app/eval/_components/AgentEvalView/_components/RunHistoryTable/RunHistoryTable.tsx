/* RunHistoryTable — the agent's eval runs, newest first, with start time, version,
   the three metrics, passed/scored, cost ("—" when unknown), errored count and a
   status marker (SPEC-06 AC-28, 45, 67, 76; Q-6). Row checkboxes exist on completed
   runs only. The Compare button is enabled iff exactly two runs are selected (AC-30). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { EvalSuiteRun } from "@devdigest/shared";
import { formatCostOrDash, formatMetricPct, formatRunTime } from "../../../../../../lib/format";
import { s } from "./styles";

export interface RunHistoryTableProps {
  /** Runs of the chosen period, newest first, any status. */
  runs: EvalSuiteRun[];
  /** Ids of the selected (completed) runs. */
  selected: string[];
  onToggle: (runId: string) => void;
  /** Enabled iff exactly two runs are selected. */
  canCompare: boolean;
  onCompare: () => void;
  /** Open a run's case results (CaseResultDrawer). When set, the start time becomes a button. */
  onOpenRun?: (run: EvalSuiteRun) => void;
}

function Status({ run }: { run: EvalSuiteRun }) {
  const t = useTranslations("eval");
  if (run.status === "running") {
    return <span style={s.running}>{t("dashboard.status.running", { done: run.cases_done, total: run.cases_total })}</span>;
  }
  if (run.status === "failed") {
    return <span style={s.failed}>{t("dashboard.status.failed", { reason: run.error ?? "" })}</span>;
  }
  return <span style={s.done}>{t("dashboard.status.done")}</span>;
}

const COLS = ["ranAt", "version", "recall", "precision", "citation", "pass", "cost", "errors", "status"] as const;

export function RunHistoryTable({ runs, selected, onToggle, canCompare, onCompare, onOpenRun }: RunHistoryTableProps) {
  const t = useTranslations("eval");
  const hintId = React.useId();
  return (
    <section aria-labelledby="eval-history-title">
      <div style={s.head}>
        <h2 id="eval-history-title" style={s.title}>
          {t("dashboard.recentRuns")}
        </h2>
        {selected.length > 0 && <span style={s.count}>{t("agentView.selectedCount", { count: selected.length })}</span>}
        <div style={s.actions}>
          {!canCompare && (
            <span id={hintId} style={s.hint}>
              {t("agentView.compareDisabled")}
            </span>
          )}
          <Button
            kind="primary"
            icon="Layers"
            disabled={!canCompare}
            aria-describedby={!canCompare ? hintId : undefined}
            onClick={onCompare}
          >
            {t("dashboard.compareSelected")}
          </Button>
        </div>
      </div>
      {runs.length === 0 ? (
        <p style={s.empty}>{t("agentView.historyEmpty")}</p>
      ) : (
        <div style={s.wrap}>
          <table style={s.table} aria-label={t("agentView.historyCaption")}>
            <thead>
              <tr>
                <th scope="col" style={s.th} />
                {COLS.map((k) => (
                  <th key={k} scope="col" style={s.th}>
                    {t(`dashboard.table.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const when = formatRunTime(r.started_at);
                const done = r.status === "done";
                return (
                  <tr key={r.id} data-testid={`history-row-${r.id}`} aria-selected={selected.includes(r.id)}>
                    <td style={s.td}>
                      {done && (
                        <input
                          type="checkbox"
                          checked={selected.includes(r.id)}
                          onChange={() => onToggle(r.id)}
                          aria-label={t("dashboard.selectRun", { when })}
                        />
                      )}
                    </td>
                    <td style={{ ...s.td, ...s.mono }}>
                      {onOpenRun ? (
                        <button type="button" style={s.link} onClick={() => onOpenRun(r)} aria-label={t("agentView.openRun", { when })}>
                          {when}
                        </button>
                      ) : (
                        when
                      )}
                    </td>
                    <td style={{ ...s.td, ...s.version }}>v{r.agent_version}</td>
                    <td style={s.td}>{formatMetricPct(r.recall)}</td>
                    <td style={s.td}>{formatMetricPct(r.precision)}</td>
                    <td style={s.td}>{formatMetricPct(r.citation_accuracy)}</td>
                    <td style={{ ...s.td, ...s.strong }}>{done ? `${r.cases_passed}/${r.cases_total - r.cases_errored}` : "—"}</td>
                    <td style={s.td}>{formatCostOrDash(r.cost_usd)}</td>
                    <td style={s.td}>{t("agentView.errorsCount", { count: r.cases_errored })}</td>
                    <td style={s.td}>
                      <Status run={r} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
