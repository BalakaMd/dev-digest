/* TabsView — Tabs mode of the multi-agent result page: one tab per agent run
   (name + score, or its status while it has no score); the selected tab shows
   the agent summary and that agent's findings. Presentational: decisions and
   "View trace" go out through callbacks. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { AgentColumn, FindingGroup } from "@devdigest/shared";
import { alsoFlaggedBy } from "../group-helpers";
import { AgentSummary } from "./AgentSummary";
import { ResultFindingCard } from "./ResultFindingCard";
import { s } from "./styles";

export interface TabsViewProps {
  columns: AgentColumn[];
  groups: FindingGroup[];
  /** Accept a finding by id. */
  onAccept: (findingId: string) => void;
  /** Dismiss a finding by id. */
  onDismiss: (findingId: string) => void;
  /** Open the trace of a run. */
  onViewTrace: (runId: string) => void;
  /** Ids of findings with a decision request in flight (their actions are disabled). */
  pendingFindingIds?: ReadonlySet<string>;
  /** finding id → name of the eval case already made from it. */
  evalCaseNames?: Readonly<Record<string, string>>;
  /** Repo full name + head sha enable file links on findings. */
  repoFullName?: string | null;
  headSha?: string | null;
}

export function TabsView({
  columns,
  groups,
  onAccept,
  onDismiss,
  onViewTrace,
  pendingFindingIds,
  evalCaseNames,
  repoFullName,
  headSha,
}: TabsViewProps) {
  const t = useTranslations("multiAgentTabs");
  const tc = useTranslations("multiAgentCommon");
  const baseId = React.useId();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const tabRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  if (columns.length === 0) return null;
  // Derived: fall back to the first tab while nothing (or a vanished run) is selected.
  const selected = columns.find((c) => c.run_id === selectedId) ?? columns[0]!;
  const nameOf = (c: AgentColumn) => c.agent_name ?? tc("unknownAgent");

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % columns.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + columns.length) % columns.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = columns.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const target = columns[next]!;
    setSelectedId(target.run_id);
    tabRefs.current[target.run_id]?.focus();
  };

  return (
    <div style={s.root}>
      <div role="tablist" aria-label={t("tabsLabel")} style={s.tablist}>
        {columns.map((c, i) => {
          const isSel = c.run_id === selected.run_id;
          const value = c.score != null ? String(c.score) : tc(`status.${c.status}`);
          return (
            <button
              key={c.run_id}
              ref={(el) => {
                tabRefs.current[c.run_id] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${c.run_id}`}
              aria-selected={isSel}
              aria-controls={`${baseId}-panel`}
              tabIndex={isSel ? 0 : -1}
              title={nameOf(c)}
              style={s.tab(isSel)}
              onClick={() => setSelectedId(c.run_id)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              <span style={s.tabName}>{nameOf(c)}</span>
              <span style={s.tabValue}>{value}</span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${selected.run_id}`}
        style={s.panel}
      >
        <AgentSummary column={selected} name={nameOf(selected)} onViewTrace={onViewTrace} />
        {selected.findings.length === 0 ? (
          <p style={s.empty}>{t("noFindings")}</p>
        ) : (
          <ul style={s.list} aria-label={t("findingsLabel", { name: nameOf(selected) })}>
            {selected.findings.map((f) => (
              <li key={f.id}>
                <ResultFindingCard
                  finding={f}
                  alsoFlaggedBy={alsoFlaggedBy(f.id, groups, columns, tc("unknownAgent"))}
                  pending={pendingFindingIds?.has(f.id)}
                  evalCaseName={evalCaseNames?.[f.id] ?? null}
                  repoFullName={repoFullName}
                  headSha={headSha}
                  onAccept={onAccept}
                  onDismiss={onDismiss}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
