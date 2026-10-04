"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  /** PR Brief block — the first section. */
  brief: React.ReactNode;
  /** True once a brief is stored: Intent and Blast radius then live inside the brief block. */
  briefStored: boolean;
  /** Intent card, rendered on the left while no brief is stored. */
  intent: React.ReactNode;
  /** Blast radius card, rendered on the right while no brief is stored. */
  blast: React.ReactNode;
  /** Short message of a rejected deep link (AC-19); announced politely. */
  navNotice?: string | null;
}

export function OverviewTab({ prBody, brief, briefStored, intent, blast, navNotice }: OverviewTabProps) {
  return (
    <>
      <div role="status" aria-live="polite" style={navNotice ? s.notice : s.noticeHidden}>
        {navNotice}
      </div>
      {brief}
      {!briefStored && (
        <div style={s.cards}>
          <div style={s.cell}>{intent}</div>
          <div style={s.cell}>{blast}</div>
        </div>
      )}
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
