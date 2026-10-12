/* CiRunsTable — the CI runs list shared by the CI Runs page and the agent's CI tab
   (SPEC-08 AC-47…AC-49, AC-52). A missing value renders "—"; the verdict is text,
   never colour alone; links go to github.com only and open in a new tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { CiRunItem } from "@devdigest/shared";
import { EMPTY, formatRunTime } from "../../lib/format";
import { formatCost, formatDuration, formatFindings, jobHref, prHref } from "./helpers";
import { s } from "./styles";

const VERDICT_COLOR: Record<CiRunItem["verdict"], { color: string; bg: string }> = {
  approve: { color: "var(--ok, #1a7f37)", bg: "var(--bg-hover)" },
  comment: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  request_changes: { color: "var(--warn, #9a6700)", bg: "var(--bg-hover)" },
  failed: { color: "var(--crit)", bg: "var(--bg-hover)" },
};

export interface CiRunsTableProps {
  items: CiRunItem[];
  /** Opens the run's details; omit to hide the action column. */
  onOpen?: (run: CiRunItem) => void;
  /** Hide the agent column (the CI tab already belongs to one agent). */
  hideAgent?: boolean;
  /** Accessible table name. */
  caption?: string;
}

export function CiRunsTable({ items, onOpen, hideAgent = false, caption }: CiRunsTableProps) {
  const t = useTranslations("ci");
  const columns = (["when", "pullRequest", "agent", "verdict", "findings", "cost", "duration", "job"] as const).filter(
    (k) => !(hideAgent && k === "agent"),
  );

  return (
    <div style={s.wrap}>
      <table style={s.table} aria-label={caption ?? t("runs.table.caption")}>
        <thead>
          <tr>
            {columns.map((k) => (
              <th key={k} scope="col" style={s.th}>
                {t(`runs.table.${k}`)}
              </th>
            ))}
            {onOpen && (
              <th scope="col" style={s.th}>
                <span className="sr-only">{t("runs.table.actions")}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((r) => {
            const pr = prHref(r);
            const job = jobHref(r);
            const prLabel = r.pr_number != null ? `#${r.pr_number}` : EMPTY;
            const vc = VERDICT_COLOR[r.verdict];
            return (
              <tr key={r.id} data-testid={`ci-run-${r.id}`}>
                <td style={{ ...s.td, ...s.mono }}>{formatRunTime(r.ran_at)}</td>
                <td style={s.td}>
                  {r.repo && <span style={s.repo}>{r.repo}</span>}
                  {pr ? (
                    <a href={pr} target="_blank" rel="noopener noreferrer" style={s.link}>
                      {prLabel}
                    </a>
                  ) : (
                    <span>{prLabel}</span>
                  )}
                </td>
                {!hideAgent && <td style={s.td}>{r.agent_name ?? EMPTY}</td>}
                <td style={s.td}>
                  <Badge color={vc.color} bg={vc.bg}>
                    {t(`runs.verdict.${r.verdict}`)}
                  </Badge>
                </td>
                <td style={s.td}>{formatFindings(r.findings_count)}</td>
                <td style={{ ...s.td, ...s.mono }}>{formatCost(r.cost_usd)}</td>
                <td style={{ ...s.td, ...s.mono }}>{formatDuration(r.duration_ms)}</td>
                <td style={s.td}>
                  {job ? (
                    <a href={job} target="_blank" rel="noopener noreferrer" style={s.link}>
                      {t("runs.openJob")}
                    </a>
                  ) : (
                    EMPTY
                  )}
                </td>
                {onOpen && (
                  <td style={s.td}>
                    <button type="button" style={s.action} onClick={() => onOpen(r)}>
                      {t("runs.viewDetails")}
                      <span className="sr-only"> {prLabel}</span>
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
