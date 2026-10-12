/* RunHeader — header of the result page: PR number + title (text), agent count,
   total time/cost (or "—" until every agent ended, with the estimate next to the
   actual once ended), "Configure run", "Cancel remaining" and the view switch. */
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { MultiAgentRun } from "@devdigest/shared";
import { formatDurationMs, formatRunCost } from "../../../_components/format";
import { ViewToggle, type ViewMode } from "../ViewToggle";
import { s } from "./styles";

export interface RunHeaderProps {
  run: MultiAgentRun;
  view: ViewMode;
  onViewChange: (mode: ViewMode) => void;
  onConfigure: () => void;
  onCancelRemaining: () => void;
  cancelling?: boolean;
}

export function RunHeader({ run, view, onViewChange, onConfigure, onCancelRemaining, cancelling }: RunHeaderProps) {
  const t = useTranslations("multiAgentResults");
  const running = run.columns.some((c) => c.status === "running");
  const ended = !running;
  // Totals are unknown until every agent run has ended.
  const time = ended ? formatDurationMs(run.total_duration_ms) : "—";
  const cost = ended ? formatRunCost(run.total_cost_usd) : "—";
  const est = run.estimate;

  return (
    <header style={s.header}>
      <div style={s.titleRow}>
        <h1 style={s.h1}>{t("prTitle", { number: run.pr_number, title: run.pr_title })}</h1>
        <div style={s.actions}>
          {running && (
            <Button kind="ghost" size="sm" onClick={onCancelRemaining} disabled={cancelling}>
              {t("cancelRemaining")}
            </Button>
          )}
          <Button kind="ghost" size="sm" onClick={onConfigure}>
            {t("configureRun")}
          </Button>
          <ViewToggle value={view} onChange={onViewChange} />
        </div>
      </div>
      <div style={s.meta}>
        <span>{t("agentsParallel", { count: run.agent_count })}</span>
        <span>
          <span style={s.metaLabel}>{t("totalTime")}</span>
          {time}
          {ended && est && <span style={s.note}>{t("estimate", { value: formatDurationMs(est.time_ms) })}</span>}
        </span>
        <span>
          <span style={s.metaLabel}>{t("totalCost")}</span>
          {cost}
          {ended && run.cost_incomplete && <span style={s.note}>{t("unpricedMarker")}</span>}
          {ended && est && <span style={s.note}>{t("estimate", { value: formatRunCost(est.cost_usd) })}</span>}
        </span>
      </div>
    </header>
  );
}
