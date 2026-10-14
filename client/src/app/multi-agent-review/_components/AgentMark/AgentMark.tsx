/* AgentMark — the agent's icon in a tinted square. Decorative: the agent's name
   is always printed next to it, so colour never carries meaning alone (NFR-5). */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { agentTone } from "./agent-tone";
import { s } from "./styles";

export function AgentMark({
  agent,
  size = 28,
}: {
  agent: { id?: string | null; name?: string | null };
  size?: number;
}) {
  const tone = agentTone(agent);
  const Glyph = Icon[tone.icon];
  return (
    <span style={s.mark(tone.color, size)} data-agent-color={tone.color} aria-hidden="true">
      <Glyph size={Math.round(size * 0.55)} />
    </span>
  );
}
