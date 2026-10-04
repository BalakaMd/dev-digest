import React from "react";
import type { TourLanguage } from "@devdigest/shared";
import { textDirection } from "./direction";
import { s } from "./styles";

/** Generated prose: direction follows the tour language. */
export function TourText({
  language,
  children,
  style,
}: {
  language: TourLanguage;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <span dir={textDirection(language)} style={style}>
      {children}
    </span>
  );
}

/** Paths, code and commands: always LTR, isolated from the surrounding RTL text. */
export function TourCode({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span className="mono" dir="ltr" style={{ ...s.code, ...style }}>
      {children}
    </span>
  );
}
