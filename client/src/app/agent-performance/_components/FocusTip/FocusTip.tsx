/* FocusTip — shows a visible description while keyboard focus is inside it (AC-68, NFR-3).
   The hover `title` and the visually hidden text stay with the caller; this adds the
   keyboard-focus path. Wrap an element that is already focusable, or pass `focusable` to make
   the wrapper itself a tab stop (only where nothing interactive is inside). The bubble is
   aria-hidden: assistive technology already reads the caller's sr-only text. */
"use client";

import React from "react";
import type { CSSProperties } from "react";

const bubble: CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  marginTop: 4,
  zIndex: 20,
  maxWidth: 280,
  width: "max-content",
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid var(--border-strong)",
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  fontSize: 12,
  fontWeight: 500,
  lineHeight: 1.4,
  whiteSpace: "normal",
  overflowWrap: "anywhere",
  textAlign: "left",
  boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
  pointerEvents: "none",
};

/* Only keyboard focus opens the bubble; a mouse click keeps relying on hover/`title`. */
function isKeyboardFocus(target: EventTarget): boolean {
  try {
    return (target as HTMLElement).matches(":focus-visible");
  } catch {
    return true;
  }
}

export function FocusTip({
  lines,
  focusable = false,
  placement = "bottom",
  as: Tag = "span",
  title,
  style,
  children,
}: {
  lines: readonly string[];
  focusable?: boolean;
  /** "top" opens the bubble upward — for table rows, where a scroll wrapper would clip it. */
  placement?: "bottom" | "top";
  as?: "span" | "li";
  title?: string;
  style?: CSSProperties;
  children: React.ReactNode;
}) {
  const [shown, setShown] = React.useState(false);
  return (
    <Tag
      title={title}
      style={{ position: "relative", display: "inline-block", maxWidth: "100%", ...style }}
      tabIndex={focusable ? 0 : undefined}
      onFocus={(e) => setShown(isKeyboardFocus(e.target))}
      onBlur={() => setShown(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setShown(false);
      }}
    >
      {children}
      {shown && lines.length > 0 ? (
        <span
          aria-hidden="true"
          data-focus-tip
          style={placement === "top" ? { ...bubble, top: "auto", bottom: "100%", marginTop: 0, marginBottom: 4 } : bubble}
        >
          {lines.map((l, i) => (
            <span key={i} style={{ display: "block" }}>
              {l}
            </span>
          ))}
        </span>
      ) : null}
    </Tag>
  );
}
