/* One installation of the agent: repository, target, status text, latest run verdict,
   installed version, time of the last status change and, when the agent moved on
   since the export, the "Config out of date" badge with an "Update" action (AC-40, AC-69).
   Every status is text, never colour alone (NFR-3). */
"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { CiInstallation } from "@devdigest/shared";
import { formatRelative } from "./helpers";
import { s } from "./styles";

export function InstallationRow({
  installation,
  outOfDate,
  disabled,
  onUpdate,
}: {
  installation: CiInstallation;
  outOfDate: boolean;
  /** Update is not available (the agent is not an OpenRouter agent, AC-8). */
  disabled: boolean;
  onUpdate: (installation: CiInstallation) => void;
}) {
  const t = useTranslations("ci");
  const locale = useLocale();
  const run = installation.latest_run;
  return (
    <li style={s.row} data-testid={`ci-installation-${installation.id}`}>
      <Icon.GitBranch size={16} aria-hidden />
      <span style={s.repo} className="mono">
        {installation.repo}
      </span>
      <div style={s.meta}>
        <Badge icon="Workflow">{t("ciTab.target")}</Badge>
        <Badge>{t(`ciTab.status.${installation.status}`)}</Badge>
        <Badge>
          {t("ciTab.latestRun")}: {run ? t(`runs.verdict.${run.verdict}`) : t("ciTab.noRunYet")}
        </Badge>
        <Badge mono>{t("ciTab.version", { version: installation.exported_agent_version })}</Badge>
        {outOfDate && (
          <Badge color="var(--warn, #9a6700)" icon="AlertTriangle">
            {t("ciTab.outOfDate")}
          </Badge>
        )}
        <span style={s.muted}>
          {t("ciTab.changed", { when: formatRelative(installation.status_changed_at, Date.now(), locale) })}
        </span>
        {outOfDate && (
          <Button
            size="sm"
            icon="RefreshCw"
            disabled={disabled}
            aria-label={t("ciTab.updateFor", { repo: installation.repo })}
            onClick={() => onUpdate(installation)}
          >
            {t("ciTab.update")}
          </Button>
        )}
      </div>
    </li>
  );
}
