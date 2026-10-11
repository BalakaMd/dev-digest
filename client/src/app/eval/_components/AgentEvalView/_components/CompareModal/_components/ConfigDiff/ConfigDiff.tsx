/* ConfigDiff — the difference between the two compared agent configurations
   (SPEC-06 AC-32): a line diff of the system prompt, provider/model when they
   differ and the linked skills added, removed or reordered. The prompt is stored
   user text, so each line is rendered as plain text in a <pre> (NFR-3), with a
   +/− marker so the change does not rest on colour (NFR-5). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalCompareConfigDiff } from "@devdigest/shared";
import { s } from "./styles";

const MARKER = { same: " ", add: "+", del: "−" } as const;

export function ConfigDiff({
  diff,
  olderVersion,
  newerVersion,
  skippedSkills = [],
}: {
  diff: EvalCompareConfigDiff;
  olderVersion: number;
  newerVersion: number;
  /** Skills Promote could not restore (they no longer exist); listed with the skills. */
  skippedSkills?: string[];
}) {
  const t = useTranslations("eval");
  const { system_prompt: prompt, provider, model, skills } = diff;
  const promptChanged = prompt.some((l) => l.kind !== "same");
  const skillsChanged = skills.added.length > 0 || skills.removed.length > 0 || skills.reordered;
  const nothing = !promptChanged && !provider && !model && !skillsChanged;
  return (
    <section aria-labelledby="eval-config-diff-title" style={s.root}>
      <h3 id="eval-config-diff-title" style={s.heading}>
        {t("compare.config")}
      </h3>
      {nothing && <p style={s.muted}>{t("compare.noConfigChange")}</p>}

      {(provider || model) && (
        <div>
          {provider && (
            <div style={s.row}>
              <span style={s.label}>{t("compare.provider")}</span>
              <span style={s.mono}>{t("compare.providerChange", { older: provider.older, newer: provider.newer })}</span>
            </div>
          )}
          {model && (
            <div style={s.row}>
              <span style={s.label}>{t("compare.model")}</span>
              <span style={s.mono}>{t("compare.providerChange", { older: model.older, newer: model.newer })}</span>
            </div>
          )}
        </div>
      )}

      {(skillsChanged || skippedSkills.length > 0) && (
        <div data-testid="skills-diff">
          <div style={s.row}>
            <span style={s.label}>{t("compare.skillsHeading")}</span>
          </div>
          {skills.added.length > 0 && (
            <div style={s.row}>
              <span style={s.label}>{t("compare.skillsAdded")}</span>
              <span>{skills.added.join(", ")}</span>
            </div>
          )}
          {skills.removed.length > 0 && (
            <div style={s.row}>
              <span style={s.label}>{t("compare.skillsRemoved")}</span>
              <span>{skills.removed.join(", ")}</span>
            </div>
          )}
          {skills.reordered && (
            <div style={s.row}>
              <span style={s.label}>{t("compare.skillsReordered")}</span>
            </div>
          )}
          {skippedSkills.length > 0 && (
            <div style={s.row} role="status">
              <span>{t("compare.promoteSkippedIds", { skills: skippedSkills.join(", ") })}</span>
            </div>
          )}
        </div>
      )}

      {prompt.length > 0 && (
        <div>
          <h4 style={s.heading}>{t("compare.systemPrompt")}</h4>
          <div style={s.legend}>
            <span>{t("compare.legendOlder", { version: olderVersion })}</span>
            <span>{t("compare.legendNewer", { version: newerVersion })}</span>
          </div>
          {!promptChanged && <p style={s.muted}>{t("compare.promptNoChange")}</p>}
          <pre style={s.pre} aria-label={t("compare.systemPrompt")}>
            {prompt.map((l, i) => (
              <code key={i} style={s.line(l.kind)}>
                <span style={s.marker}>{MARKER[l.kind]}</span>
                {l.text}
              </code>
            ))}
          </pre>
        </div>
      )}
    </section>
  );
}
