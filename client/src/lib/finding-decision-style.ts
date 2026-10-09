import type { CSSProperties } from "react";

export type FindingDecision = "accept" | "dismiss";

/** Shared Accept/Reject button style for finding cards (FindingCard, InlineFinding).
 *  Both buttons use one Button kind ("ghost") and one geometry; when pressed only
 *  colours change (border width stays 1px), so the size never shifts. */
export function decisionButtonStyle(action: FindingDecision, pressed: boolean): CSSProperties {
  const base: CSSProperties = { minWidth: 92 };
  if (!pressed) return base;
  const token = action === "accept" ? "ok" : "crit";
  return {
    ...base,
    background: `var(--${token}-bg)`,
    color: `var(--${token})`,
    borderColor: `var(--${token})`,
  };
}
