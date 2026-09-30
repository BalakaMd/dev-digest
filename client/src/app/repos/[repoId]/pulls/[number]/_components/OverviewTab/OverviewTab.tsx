"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  /** Intent card, rendered on the left. */
  intent: React.ReactNode;
  /** Blast radius card, rendered on the right. */
  blast: React.ReactNode;
}

export function OverviewTab({ prBody, intent, blast }: OverviewTabProps) {
  return (
    <>
      <div style={s.cards}>
        <div style={s.cell}>{intent}</div>
        <div style={s.cell}>{blast}</div>
      </div>
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
