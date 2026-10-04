"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@devdigest/ui";
import { s } from "./styles";

/** Collapsible tour section. The heading is a programmatic focus target for ToC navigation. */
export function SectionCard({
  id,
  title,
  icon,
  children,
}: {
  id: string;
  title: string;
  icon: IconName;
  children: React.ReactNode;
}) {
  const t = useTranslations("onboardingSections");
  const [open, setOpen] = React.useState(true);
  const Glyph = Icon[icon];
  const bodyId = `${id}-body`;
  return (
    <section aria-labelledby={`${id}-heading`} style={s.card}>
      <header style={s.header}>
        <span style={s.iconBox} aria-hidden>
          <Glyph size={16} />
        </span>
        <h2 id={id} tabIndex={-1} style={s.title}>
          <span id={`${id}-heading`}>{title}</span>
        </h2>
        <button
          type="button"
          style={s.toggle}
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={t(open ? "card.collapse" : "card.expand", { title })}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <Icon.ChevronDown size={16} style={s.flip} /> : <Icon.ChevronDown size={16} />}
        </button>
      </header>
      <div id={bodyId} hidden={!open} style={s.body}>
        {children}
      </div>
    </section>
  );
}
