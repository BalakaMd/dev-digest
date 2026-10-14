/* Target step: the CI target (GitHub Actions only) and the repository picker (AC-5…7, AC-66). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { useCiInstallations } from "../../../../../../../../../../lib/hooks/ci";
import { useActiveRepo } from "../../../../../../../../../../lib/repo-context";
import { EXPORT_PROVIDER } from "../../../constants";
import { IMPORT_REPO_HREF, TARGETS } from "../constants";
import { s } from "../styles";
import type { StepProps } from "./types";

export function TargetStep({ agent, wizard }: StepProps) {
  const t = useTranslations("ci.exportWizard");
  const { repos, reposLoaded } = useActiveRepo();
  const installations = useCiInstallations(agent.id);
  const installed = new Set((installations.data ?? []).map((i) => i.repo));
  const emptyId = React.useId();
  const noRepos = reposLoaded && repos.length === 0;
  // A preselected repo (Update CI config) that is not in the list must still be shown.
  const names = repos.map((r) => r.full_name);
  if (wizard.state.repo && !names.includes(wizard.state.repo)) names.unshift(wizard.state.repo);

  return (
    <>
      {agent.provider !== EXPORT_PROVIDER && (
        <div role="alert" style={s.error}>
          {t("blocked.notOpenRouter")}
        </div>
      )}
      <fieldset style={s.fieldset}>
        <legend style={s.sectionLabel}>{t("targetLegend")}</legend>
        <div style={s.cardGrid}>
          {TARGETS.map((target) => {
            const selected = wizard.state.target === target.id;
            const nameId = `ci-target-${target.id}-name`;
            const descId = `ci-target-${target.id}-desc`;
            const I = Icon[target.icon];
            return (
              <label
                key={target.id}
                style={{ ...s.card, ...(selected ? s.cardSelected : {}), ...(target.enabled ? {} : s.cardDisabled) }}
              >
                <span style={s.cardHead}>
                  <input
                    type="radio"
                    name="ci-target"
                    value={target.id}
                    checked={selected}
                    disabled={!target.enabled}
                    readOnly
                    aria-labelledby={nameId}
                    aria-describedby={descId}
                    onChange={() => {}}
                  />
                  <I size={18} aria-hidden />
                  <span id={nameId} style={s.cardName}>
                    {t(`targets.${target.id}`)}
                  </span>
                  {target.recommended && <Badge color="var(--accent)">{t("recommended")}</Badge>}
                  {!target.enabled && <Badge>{t("targets.comingSoon")}</Badge>}
                </span>
                <span id={descId} style={s.cardDesc}>
                  {target.enabled ? t(`targets.${target.id}Desc`) : t("targets.comingSoon")}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset style={s.fieldset} aria-describedby={noRepos ? emptyId : undefined}>
        <legend style={s.sectionLabel}>{t("repoLabel")}</legend>
        {noRepos ? (
          <p id={emptyId} style={s.muted}>
            {t("noRepositories")}{" "}
            <Link href={IMPORT_REPO_HREF} style={s.link}>
              {t("importRepository")}
            </Link>
          </p>
        ) : (
          <div style={s.repoList}>
            {names.map((name, i) => (
              <label key={name} style={s.repoRow}>
                <input
                  type="radio"
                  name="ci-repo"
                  value={name}
                  checked={wizard.state.repo === name}
                  onChange={() => wizard.setRepo(name)}
                  data-autofocus={i === 0 ? "" : undefined}
                />
                <span className="mono">{name}</span>
                {installed.has(name) && <Badge>{t("installed")}</Badge>}
              </label>
            ))}
          </div>
        )}
      </fieldset>
    </>
  );
}
