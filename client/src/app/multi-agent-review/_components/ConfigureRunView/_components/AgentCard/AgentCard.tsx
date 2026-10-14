/* AgentCard — one selectable agent: checkbox, icon, name and description, with
   its estimate on the right. The whole card toggles; the checkbox is the
   keyboard and screen-reader control. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Agent, AgentEstimate } from "@devdigest/shared";
import { formatCostUsd } from "@/lib/format";
import { formatDurationMs } from "../../../format";
import { AgentMark, agentTone } from "../../../AgentMark";
import { s } from "./styles";

export function AgentCard({
  agent,
  estimate,
  checked,
  onChange,
}: {
  agent: Agent;
  estimate: AgentEstimate | undefined;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useTranslations("multiAgentConfigure");
  const description = agent.description.trim();
  const color = agentTone(agent).color;
  return (
    <div style={s.card(checked, color)} onClick={() => onChange(!checked)}>
      <button type="button" role="checkbox" aria-checked={checked} aria-label={agent.name} style={s.box(checked, color)}>
        {checked && <Icon.Check size={13} />}
      </button>
      <AgentMark agent={agent} size={34} />
      <div style={s.body}>
        <div style={s.title}>{agent.name}</div>
        {description && <div style={s.description}>{agent.description}</div>}
      </div>
      <span style={s.meta}>
        <span style={s.metaMain}>
          {t("estimate", {
            time: formatDurationMs(estimate?.duration_ms),
            cost: formatCostUsd(estimate?.cost_usd),
          })}
        </span>
        <span style={s.metaRuns}>{t("basedOn", { count: estimate?.runs ?? 0 })}</span>
      </span>
    </div>
  );
}
