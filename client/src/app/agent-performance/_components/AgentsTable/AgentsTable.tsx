/* AgentsTable — sortable agents table with expandable rows (AC-30..AC-36, AC-52, AC-60).
   Sort and expansion are controlled by the parent (address state, S10). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { AgentPerformanceRow } from "@devdigest/shared";
import type { SortColumn, SortDir } from "../../_model/constants";
import { sortRows } from "../../_model/sort";
import { srOnly } from "../sr-only";
import { AgentRow, COLUMN_COUNT } from "./AgentRow";
import { ExpandedRow } from "./ExpandedRow";
import { s } from "./styles";

export type AgentsTableProps = {
  rows: readonly AgentPerformanceRow[];
  sort: SortColumn;
  dir: SortDir;
  onSort: (column: SortColumn) => void;
  expandedId: string | null;
  onToggle: (agentId: string) => void;
  repoId: string;
  /** The instants the overview applied; the detail read reuses them (AC-35). */
  applied: { from: string; to: string };
  /** Label for the "Runs" header, e.g. "RUNS 30D" is built from this suffix (optional). */
  rangeLabel?: string;
};

const SORTABLE = {
  runs: "table.runs",
  avg_cost: "table.avgCost",
  avg_duration: "table.avgDuration",
  accept: "table.accept",
  last_run: "table.lastRun",
} as const;

export function AgentsTable({
  rows,
  sort,
  dir,
  onSort,
  expandedId,
  onToggle,
  repoId,
  applied,
  rangeLabel,
}: AgentsTableProps) {
  const t = useTranslations("agentPerformance");
  const sorted = React.useMemo(() => sortRows(rows, sort, dir), [rows, sort, dir]);

  const sortHeader = (column: keyof typeof SORTABLE, suffix?: string) => {
    const active = sort === column;
    const label = t(SORTABLE[column]) + (suffix ? ` ${suffix}` : "");
    return (
      <th
        scope="col"
        style={s.th}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        <button
          type="button"
          style={s.sortButton}
          onClick={() => onSort(column)}
          aria-label={t("table.sortBy", { column: t(SORTABLE[column]) })}
        >
          <span aria-hidden="true">{label}</span>
          <span aria-hidden="true">{active ? (dir === "asc" ? "↑" : "↓") : ""}</span>
        </button>
        {column === "accept" ? <span style={s.hint}>{t("accept.headerHint")}</span> : null}
      </th>
    );
  };

  return (
    <div style={s.wrap}>
      <table style={s.table}>
        <caption style={s.caption}>{t("table.caption")}</caption>
        <thead>
          <tr>
            <th scope="col" style={s.th}>
              {t("table.agent")}
            </th>
            {sortHeader("runs", rangeLabel)}
            <th scope="col" style={s.th}>
              {t("table.failed")}
            </th>
            {sortHeader("avg_cost")}
            {sortHeader("avg_duration")}
            {sortHeader("accept")}
            <th scope="col" style={s.th}>
              {t("table.costPerAccepted")}
            </th>
            {sortHeader("last_run")}
            <th scope="col" style={s.th}>
              <span style={srOnly}>{t("table.view")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const expanded = expandedId === row.agent_id;
            const detailId = `agent-perf-detail-${row.agent_id}`;
            return (
              <React.Fragment key={row.agent_id}>
                <AgentRow row={row} expanded={expanded} detailId={detailId} onToggle={onToggle} />
                {expanded ? (
                  <tr>
                    <td colSpan={COLUMN_COUNT} style={s.expandedCell}>
                      <ExpandedRow agentId={row.agent_id} repoId={repoId} applied={applied} id={detailId} />
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
