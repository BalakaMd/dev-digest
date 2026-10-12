/* AgentCard — one selectable agent with its estimate and description. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@devdigest/ui";
import type { Agent, AgentEstimate } from "@devdigest/shared";
import { formatCostUsd } from "@/lib/format";
import { formatDurationMs } from "../../../format";
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
  return (
    <div style={s.card(checked)}>
      <div style={s.head}>
        <Checkbox checked={checked} onChange={onChange} label={agent.name} />
        <span style={s.meta}>
          <span>
            {t("estimate", {
              time: formatDurationMs(estimate?.duration_ms),
              cost: formatCostUsd(estimate?.cost_usd),
            })}
          </span>
          <span>{t("basedOn", { count: estimate?.runs ?? 0 })}</span>
        </span>
      </div>
      {description && <div style={s.description}>{agent.description}</div>}
    </div>
  );
}
