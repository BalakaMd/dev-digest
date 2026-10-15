"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { AgentPerformanceOverview } from "@devdigest/shared";
import { AcceptRate } from "../AcceptRate";
import { acceptDescriptionKey, acceptTone } from "../../_model/accept-rate";
import { AgentAvatar } from "../AgentAvatar";
import { FocusTip } from "../FocusTip";
import { srOnly } from "../sr-only";
import { s } from "./styles";

type MostActive = AgentPerformanceOverview["totals"]["most_active"];

export function MostActiveCard({
  agent,
  onOpen,
}: {
  agent: MostActive;
  onOpen: (agentId: string) => void;
}) {
  const t = useTranslations("agentPerformance");
  const descId = React.useId();
  if (!agent) {
    return (
      <section style={s.card} aria-label={t("cards.mostActive")}>
        <div style={s.label}>{t("cards.mostActive")}</div>
        <div style={s.value}>{t("dash")}</div>
      </section>
    );
  }
  const descKey = acceptDescriptionKey(acceptTone(agent.accept));
  const tipLines = [agent.name, ...(descKey ? [t(`accept.${descKey}`)] : [])];
  return (
    <FocusTip lines={tipLines} style={{ display: "block" }}>
    <button
      type="button"
      style={s.cardButton}
      aria-label={t("cards.openMostActive", { name: agent.name })}
      aria-describedby={descKey ? descId : undefined}
      onClick={() => onOpen(agent.agent_id)}
    >
      <span style={s.label}>{t("cards.mostActive")}</span>
      <span style={s.agentRow}>
        <AgentAvatar name={agent.name} />
        <span style={s.agentText}>
          <span style={s.agentName} title={agent.name}>
            {agent.name}
          </span>
          <span style={s.agentMeta}>
            <span>{t("cards.mostActiveRuns", { count: agent.runs })}</span>
            <span aria-hidden="true">·</span>
            <AcceptRate accept={agent.accept} />
          </span>
        </span>
      </span>
    </button>
    {descKey ? (
      <span id={descId} style={srOnly}>
        {t(`accept.${descKey}`)}
      </span>
    ) : null}
    </FocusTip>
  );
}
