/* VerdictBanner — ported from findings.jsx.
   request_changes / approve / comment + summary + finding/blocker counts + score. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge } from "@devdigest/ui";
import type { Verdict } from "@devdigest/shared";
import { VERDICT_META } from "./constants";
import { ScoreColumn } from "../ScoreColumn";
import { s } from "./styles";

export function VerdictBanner({
  verdict,
  summary,
  score,
  findingsCount,
  blockers,
  agentName,
  info,
  action,
  footer,
  meta,
}: {
  verdict: Verdict;
  summary: string | null;
  score: number | null;
  findingsCount: number;
  blockers: number;
  agentName?: string | null;
  /** Optional tooltip text; renders an info icon next to the title. */
  info?: string;
  /** Optional top-right slot (e.g. a regenerate button). */
  action?: React.ReactNode;
  /** Optional content under the summary, inside the card. */
  footer?: React.ReactNode;
  /** Optional content under the score, below a divider (e.g. run cost). */
  meta?: React.ReactNode;
}) {
  const t = useTranslations("prReview");
  const m = VERDICT_META[verdict] ?? VERDICT_META.comment;
  const VIcon = Icon[m.icon];
  return (
    <div style={s.wrap}>
      <div style={s.iconBox(m.bg, m.c)}>
        <VIcon size={22} />
      </div>
      <div style={s.main}>
        <div style={s.titleRow}>
          <span style={s.label(m.c)}>{t(`verdict.${m.labelKey}`)}</span>
          <Badge color="var(--text-secondary)">
            {t("verdict.findingsCount", { count: findingsCount })}
            {blockers > 0 ? t("verdict.blockers", { count: blockers }) : ""}
          </Badge>
          {agentName && (
            <Badge color="var(--accent-text)" bg="var(--accent-bg)" icon="Cpu">
              {agentName}
            </Badge>
          )}
          {info && (
            <span style={s.info} title={info} role="img" aria-label={info}>
              <Icon.Info size={14} />
            </span>
          )}
        </div>
        {summary && <p style={s.summary}>{summary}</p>}
        {footer}
      </div>
      {action && <div style={s.action}>{action}</div>}
      {(score != null || meta) && <ScoreColumn score={score} meta={meta} />}
    </div>
  );
}
