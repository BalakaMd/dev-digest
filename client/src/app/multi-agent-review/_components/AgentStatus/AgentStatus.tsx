/* AgentStatus — one agent run's status as icon + text word. The running icon
   pulses (motion in addition to the word). No aria-live: completion is not
   announced (spec NG-10). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@devdigest/ui";
import type { RunStatus } from "@devdigest/shared";
import { s } from "./styles";

const ICON: Record<RunStatus, IconName> = {
  running: "Activity",
  done: "CheckCircle",
  failed: "XCircle",
  cancelled: "Slash",
};

export function AgentStatus({ status }: { status: RunStatus }) {
  const t = useTranslations("multiAgentCommon");
  const Glyph = Icon[ICON[status]];
  return (
    <span style={{ ...s.root, color: s.color[status] }} data-status={status}>
      <Glyph size={13} aria-hidden="true" style={status === "running" ? s.pulse : undefined} />
      <span>{t(`status.${status}`)}</span>
    </span>
  );
}
