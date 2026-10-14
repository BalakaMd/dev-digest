/* ColumnCard — one agent run's column. All agent-derived text (names, titles,
   error, latest_log) is rendered as plain text nodes. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, SeverityBadge } from "@devdigest/ui";
import type { AgentColumn, FindingGroup } from "@devdigest/shared";
import { AgentStatus } from "../AgentStatus";
import { AgentMark, agentTone } from "../AgentMark";
import { alsoFlaggedBy } from "../group-helpers";
import { formatDurationMs, formatRunCost } from "../format";
import { useElapsed } from "./use-elapsed";
import { s } from "./styles";

export interface ColumnCardProps {
  column: AgentColumn;
  columns: AgentColumn[];
  groups: FindingGroup[];
  onViewTrace: (runId: string) => void;
  onCancel: (runId: string) => void;
}

export function ColumnCard({ column, columns, groups, onViewTrace, onCancel }: ColumnCardProps) {
  const t = useTranslations("multiAgentColumns");
  const tc = useTranslations("multiAgentCommon");
  const name = column.agent_name ?? tc("unknownAgent");
  const isRunning = column.status === "running";
  const isEnded = column.status === "failed" || column.status === "cancelled";
  const elapsed = useElapsed(column.started_at, isRunning);
  const count = column.findings.length;
  const tone = agentTone({ id: column.agent_id, name: column.agent_name });

  return (
    <section style={s.column(tone.color)} aria-label={t("columnLabel", { name })} data-status={column.status}>
      <div style={s.head}>
        <div style={s.headRow}>
          <div style={s.nameRow}>
            <AgentMark agent={{ id: column.agent_id, name: column.agent_name }} size={26} />
            <h3 style={s.name}>{name}</h3>
          </div>
          {column.status === "done" && column.score != null && (
            <span style={s.score}>{t("score", { score: column.score })}</span>
          )}
        </div>
        <AgentStatus status={column.status} />
        {!isRunning && (
          <div style={s.meta}>
            {formatDurationMs(column.duration_ms)} · {formatRunCost(column.cost_usd)}
          </div>
        )}
      </div>

      <div style={s.body}>
        {isRunning && (
          <div style={s.running}>
            <span style={s.meta}>{t("elapsed", { time: formatDurationMs(elapsed) })}</span>
            <span
              style={s.logLine}
              tabIndex={0}
              title={column.latest_log ?? undefined}
              aria-label={column.latest_log?.trim() ? column.latest_log : undefined}
            >
              {column.latest_log?.trim() ? column.latest_log : t("noLogYet")}
            </span>
          </div>
        )}
        {isEnded ? (
          <p style={s.error}>{column.error?.trim() ? column.error : t("noError")}</p>
        ) : count === 0 ? (
          !isRunning && <p style={s.empty}>{t("noFindings")}</p>
        ) : (
          <ul style={s.list}>
            {column.findings.map((f) => {
              const also = alsoFlaggedBy(f.id, groups, columns, tc("unknownAgent"));
              const loc = `${f.file}:${f.start_line}`;
              return (
                <li
                  key={f.id}
                  style={s.card}
                  tabIndex={0}
                  title={`${f.title} — ${loc}`}
                >
                  <SeverityBadge severity={f.severity} />
                  <span style={s.cardTitle}>{f.title}</span>
                  <span className="mono" style={s.cardLoc}>
                    {loc}
                  </span>
                  {f.accepted_at && <span style={s.decisionOk}>{t("finding.accepted")}</span>}
                  {f.dismissed_at && <span style={s.decision}>{t("finding.dismissed")}</span>}
                  {also.length > 0 && (
                    <span style={s.also}>{tc("alsoFlaggedBy", { names: also.join(", ") })}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div style={s.foot}>
        <span style={s.count}>{t("findingCount", { count })}</span>
        <div style={s.footActions}>
          {isRunning && (
            <Button
              kind="ghost"
              size="sm"
              aria-label={t("cancelFor", { name })}
              onClick={() => onCancel(column.run_id)}
            >
              {t("cancel")}
            </Button>
          )}
          <Button
            kind="ghost"
            size="sm"
            aria-label={t("viewTraceFor", { name })}
            onClick={() => onViewTrace(column.run_id)}
          >
            {t("viewTrace")}
          </Button>
        </div>
      </div>
    </section>
  );
}
