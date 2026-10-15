/* AgentAvatar — letter avatar (Q-26). Decorative: the agent's name is always printed next to it. */
"use client";

import React from "react";
import type { CSSProperties } from "react";

export function AgentAvatar({ name, size = 32 }: { name: string | null | undefined; size?: number }) {
  const letter = (name ?? "").trim().charAt(0).toUpperCase() || "?";
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: size,
    height: size,
    borderRadius: 8,
    fontSize: Math.round(size * 0.45),
    fontWeight: 700,
    color: "var(--accent-text)",
    background: "var(--accent-bg)",
    border: "1px solid var(--border)",
  };
  return (
    <span style={style} aria-hidden="true">
      {letter}
    </span>
  );
}
