/* AgentSummary — header of the selected agent tab: score, review summary,
   duration, cost and "View trace". Summary and error text are plain text nodes. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared";
import { AgentStatus } from "../AgentStatus";
import { AgentMark, agentTone } from "../AgentMark";
import { formatDurationMs, formatRunCost } from "../format";
import { s } from "./AgentSummary.styles";

export function AgentSummary({
  column,
  name,
  onViewTrace,
}: {
  column: AgentColumn;
  /** Display name (already resolved, with the unknown-agent fallback). */
  name: string;
  onViewTrace: (runId: string) => void;
}) {
  const t = useTranslations("multiAgentTabs");
  const tc = useTranslations("multiAgentCommon");
  const summary = column.summary?.trim() ? column.summary : null;

  return (
    <section
      style={s.root(agentTone({ id: column.agent_id, name: column.agent_name }).color)}
      aria-label={name}
    >
      <div style={s.score} aria-label={t("summary.score")}>
        <span style={s.scoreLabel}>{t("summary.score")}</span>
        <span style={s.scoreValue}>{column.score ?? tc("empty")}</span>
      </div>
      <div style={s.main}>
        <div style={s.nameRow}>
          <AgentMark agent={{ id: column.agent_id, name: column.agent_name }} size={24} />
          <span style={s.name}>{name}</span>
          <AgentStatus status={column.status} />
        </div>
        {column.status === "failed" ? (
          <p style={s.text}>{t("summary.failed", { error: column.error ?? tc("empty") })}</p>
        ) : column.status === "cancelled" ? (
          <p style={s.text}>{t("summary.cancelled")}</p>
        ) : (
          <p style={s.text}>{summary ?? t("summary.noSummary")}</p>
        )}
      </div>
      <div style={s.side}>
        <Button
          kind="ghost"
          size="sm"
          aria-label={t("summary.viewTraceFor", { name })}
          onClick={() => onViewTrace(column.run_id)}
        >
          {t("summary.viewTrace")}
        </Button>
        <span className="mono" style={s.meta}>
          {t("summary.duration")} {formatDurationMs(column.duration_ms)}
        </span>
        <span className="mono" style={s.meta}>
          {t("summary.cost")} {formatRunCost(column.cost_usd)}
        </span>
      </div>
    </section>
  );
}
