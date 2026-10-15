/* AgentRow — one agent's row (AC-30, AC-31, AC-36, AC-44). Null values render "—". */
"use client";

import React from "react";
import Link from "next/link";
import { useFormatter, useNow, useTranslations } from "next-intl";
import type { AgentPerformanceRow } from "@devdigest/shared";
import { formatCostUsd } from "@/lib/format";
import { AcceptRate } from "../AcceptRate";
import { AgentAvatar } from "../AgentAvatar";
import { FocusTip } from "../FocusTip";
import { formatDuration } from "./format";
import { s } from "./styles";

const NOW_INTERVAL_MS = 60_000;
export const COLUMN_COUNT = 9;

export function AgentRow({
  row,
  expanded,
  detailId,
  onToggle,
}: {
  row: AgentPerformanceRow;
  expanded: boolean;
  detailId: string;
  onToggle: (agentId: string) => void;
}) {
  const t = useTranslations("agentPerformance");
  const format = useFormatter();
  // `relativeTime` needs a reference time (client INSIGHTS 2026-09-25).
  const now = useNow({ updateInterval: NOW_INTERVAL_MS });
  const dash = t("dash");
  return (
    <tr data-agent-id={row.agent_id}>
      <td style={s.td}>
        <FocusTip lines={[row.name]} placement="top" style={{ display: "block" }}>
        <button
          type="button"
          style={s.expandButton}
          aria-expanded={expanded}
          aria-controls={expanded ? detailId : undefined}
          aria-label={t("table.expand", { name: row.name })}
          title={row.name}
          onClick={() => onToggle(row.agent_id)}
        >
          <AgentAvatar name={row.name} />
          <span style={s.name}>{row.name}</span>
          {!row.enabled ? <span style={s.badge}>{t("table.disabled")}</span> : null}
        </button>
        </FocusTip>
      </td>
      <td style={{ ...s.td, ...s.num }}>{row.runs}</td>
      <td style={{ ...s.td, ...s.num }}>{row.failed}</td>
      <td style={{ ...s.td, ...s.num }}>{row.avg_cost_usd == null ? dash : formatCostUsd(row.avg_cost_usd)}</td>
      <td style={{ ...s.td, ...s.num }}>{row.avg_duration_ms == null ? dash : formatDuration(row.avg_duration_ms)}</td>
      <td style={s.td}>
        <AcceptRate accept={row.accept} focusable tipPlacement="top" />
      </td>
      <td style={{ ...s.td, ...s.num }}>
        {row.cost_per_accepted_usd == null ? dash : formatCostUsd(row.cost_per_accepted_usd)}
      </td>
      <td style={{ ...s.td, ...s.muted }}>
        {row.last_run_at == null ? dash : format.relativeTime(new Date(row.last_run_at), now)}
      </td>
      <td style={s.td}>
        <Link href={`/agents/${row.agent_id}`} style={s.link} aria-label={t("table.viewAgent", { name: row.name })}>
          {t("table.view")}
        </Link>
      </td>
    </tr>
  );
}
