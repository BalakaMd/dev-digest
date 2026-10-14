/* ColumnsView — one column per agent run, scrolling horizontally when they do
   not fit. Presentational: data and actions come in through props. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { AgentColumn, FindingGroup } from "@devdigest/shared";
import { ColumnCard } from "./ColumnCard";
import { s } from "./styles";

export interface ColumnsViewProps {
  columns: AgentColumn[];
  groups: FindingGroup[];
  onViewTrace: (runId: string) => void;
  onCancel: (runId: string) => void;
}

export function ColumnsView({ columns, groups, onViewTrace, onCancel }: ColumnsViewProps) {
  const t = useTranslations("multiAgentColumns");
  return (
    // tabIndex=0: a scroll container must be focusable for keyboard scrolling (AC-60).
    <div style={s.scroller} tabIndex={0} role="region" aria-label={t("regionLabel")}>
      {columns.map((c) => (
        <ColumnCard
          key={c.run_id}
          column={c}
          columns={columns}
          groups={groups}
          onViewTrace={onViewTrace}
          onCancel={onCancel}
        />
      ))}
    </div>
  );
}
