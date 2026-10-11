/* FilterSelect — the native <select> of the dashboard header (agent switcher, period
   filter) without the browser arrow: room on the right and the kit's chevron, so the
   arrow does not stick to the border. Stays a real <select> (keyboard, a11y, tests). */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export function FilterSelect({
  "aria-label": ariaLabel,
  value,
  onChange,
  children,
}: {
  "aria-label": string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <span style={s.wrap}>
      <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} style={s.select}>
        {children}
      </select>
      <Icon.ChevronsUpDown size={14} style={s.icon} aria-hidden />
    </span>
  );
}
