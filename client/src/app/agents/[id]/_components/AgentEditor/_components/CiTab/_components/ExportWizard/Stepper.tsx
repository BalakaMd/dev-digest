/* Stepper — "Target → Preview → Configure → Install". The current step carries
   aria-current="step"; done steps show a check icon plus a hidden "completed" text and
   later steps "not yet reached", so no state is conveyed by colour alone (AC-2, NFR-3). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { STEP_IDS, type StepId } from "./constants";
import { s } from "./styles";

export function Stepper({ current }: { current: StepId }) {
  const t = useTranslations("ci.exportWizard");
  const at = STEP_IDS.indexOf(current);
  return (
    <ol style={s.stepper} aria-label={t("stepperLabel")}>
      {STEP_IDS.map((id, i) => {
        const done = i < at;
        const isCurrent = i === at;
        const color = done ? "var(--ok)" : isCurrent ? "var(--accent)" : "var(--bg-elevated)";
        return (
          <React.Fragment key={id}>
            <li style={s.stepItem} aria-current={isCurrent ? "step" : undefined} data-step={id}>
              <span
                aria-hidden
                style={{
                  ...s.stepDot,
                  background: color,
                  color: i <= at ? "#fff" : "var(--text-muted)",
                  border: i > at ? "1px solid var(--border-strong)" : "none",
                }}
              >
                {done ? <Icon.Check size={13} /> : i + 1}
              </span>
              <span
                style={{
                  ...s.stepLabel,
                  fontWeight: isCurrent ? 600 : 500,
                  color: i <= at ? "var(--text-primary)" : "var(--text-muted)",
                }}
              >
                {t(`steps.${id}`)}
              </span>
              <span style={s.visuallyHidden}>
                {done ? t("stepDone") : isCurrent ? t("stepCurrent") : t("stepPending")}
              </span>
            </li>
            {i < STEP_IDS.length - 1 && (
              <li aria-hidden role="presentation" style={{ ...s.stepLine, background: done ? "var(--ok)" : "var(--border-strong)" }} />
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}
