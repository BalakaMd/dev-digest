import type { CSSProperties } from "react";
import { toneBackground } from "./agent-tone";

export const s = {
  mark: (color: string, size: number): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: size,
    height: size,
    borderRadius: 6,
    color,
    background: toneBackground(color),
    border: `1px solid ${toneBackground(color)}`,
  }),
} as const;
