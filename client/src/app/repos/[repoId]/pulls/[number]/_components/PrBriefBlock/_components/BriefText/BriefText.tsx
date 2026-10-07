import React from "react";
import type { TourLanguage } from "@devdigest/shared";
import { textDirection } from "./direction";

/**
 * Generated prose follows the brief language. Block-level so `dir` also drives paragraph alignment
 * (`text-align: start` resolves to the right edge in RTL); surrounding layout stays LTR.
 */
export function BriefText({
  language,
  children,
  style,
}: {
  language: TourLanguage;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <span dir={textDirection(language)} style={{ display: "block", textAlign: "start", ...style }}>
      {children}
    </span>
  );
}

const CODE_STYLE: React.CSSProperties = { unicodeBidi: "isolate", overflowWrap: "anywhere" };

/** Paths, `path:line` and identifiers: always LTR, isolated from surrounding RTL text. */
export function BriefCode({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span className="mono" dir="ltr" style={{ ...CODE_STYLE, ...style }}>
      {children}
    </span>
  );
}
