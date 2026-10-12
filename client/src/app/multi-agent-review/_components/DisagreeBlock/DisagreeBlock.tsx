/* DisagreeBlock — "Where agents disagree": one row per finding group, one cell
   per agent run. All text from agents is rendered as text nodes. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge, Toggle } from "@devdigest/ui";
import type { Conflict, ConflictTake } from "@devdigest/shared";
import { AgentStatus } from "../AgentStatus";
import { hasRunning, visibleRows } from "./helpers";
import { s } from "./styles";

function Cell({ take }: { take: ConflictTake }) {
  const t = useTranslations("multiAgentDisagree");
  const tc = useTranslations("multiAgentCommon");
  const name = take.agent_name ?? tc("unknownAgent");
  const summary = take.agent_summary?.trim() ? take.agent_summary : null;

  let body: React.ReactNode;
  if (take.state === "flagged") {
    body = (
      <>
        {take.severity && <SeverityBadge severity={take.severity} />}
        <span style={s.cellTitle}>{take.title}</span>
        {take.more_count >= 1 && <span style={s.more}>{t("more", { count: take.more_count })}</span>}
      </>
    );
  } else if (take.state === "did_not_flag") {
    body = (
      <>
        <span style={s.state}>{t("didNotFlag")}</span>
        {summary && (
          <span style={s.summary} title={summary} tabIndex={0}>
            {t("agentSummary")} {summary}
          </span>
        )}
      </>
    );
  } else {
    // running | failed | cancelled: the status as icon + word.
    body = <AgentStatus status={take.state} />;
  }

  return (
    <div style={s.cell} data-state={take.state}>
      <span style={s.agent}>{name}</span>
      {body}
    </div>
  );
}

export function DisagreeBlock({
  conflicts,
  running = false,
}: {
  conflicts: Conflict[];
  /** True while any agent run is running (covers a run with no finding group yet). */
  running?: boolean;
}) {
  const t = useTranslations("multiAgentDisagree");
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);
  const rows = visibleRows(conflicts, onlyConflicts);

  return (
    <section style={s.root} aria-labelledby="disagree-title">
      <div style={s.head}>
        <h2 id="disagree-title" style={s.title}>
          {t("title")}
        </h2>
        <label style={s.switchLabel}>
          <span>{t("onlyConflicts")}</span>
          <Toggle on={onlyConflicts} onChange={setOnlyConflicts} />
        </label>
      </div>
      {(running || hasRunning(conflicts)) && (
        <div style={s.notice}>
          {t("incomplete")}
        </div>
      )}
      {rows.length === 0 ? (
        <p style={s.empty}>{conflicts.length === 0 ? t("empty") : t("emptyFiltered")}</p>
      ) : (
        <ul style={s.list} aria-label={t("rowsLabel")}>
          {rows.map((c) => (
            <li key={c.group_id} style={s.row}>
              <div style={s.rowHead}>
                <span className="mono" style={s.location}>
                  {c.file}:{c.line}
                </span>
                <span style={s.rowTitle}>{c.title}</span>
              </div>
              <div style={s.cells}>
                {c.takes.map((take) => (
                  <Cell key={take.run_id} take={take} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
