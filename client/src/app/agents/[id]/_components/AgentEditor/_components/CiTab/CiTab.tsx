/* CiTab — the agent's CI deployment: installations, "Fail CI on", run history
   (SPEC-09 AC-38…45, AC-69, AC-8, AC-58, EC-34). "Add to CI" / "Add repository" /
   "Update" open the Export wizard through the `Wizard` slot (contract: WizardProps). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, Skeleton, SelectInput } from "@devdigest/ui";
import type { Agent, CiInstallation } from "@devdigest/shared";
import { CiRunsTable } from "../../../../../../../components/ci-runs-table";
import { useCiInstallations, useCiRuns } from "../../../../../../../lib/hooks/ci";
import { ExportWizard } from "./_components/ExportWizard";
import { ALL_INSTALLATIONS, CONFIG_TAB_KEY, EXPORT_PROVIDER, type WizardInitial, type WizardProps } from "./constants";
import { FailCiOnPanel } from "./FailCiOnPanel";
import { countInstalled, isOutOfDate, toWizardInitial } from "./helpers";
import { InstallationRow } from "./InstallationRow";
import { s } from "./styles";
import { UpdateTargetDialog } from "./UpdateTargetDialog";

/** Wizard state: closed, or open with an optional preselection. */
type WizardState = { initial?: WizardInitial } | null;

export function CiTab({
  agent,
  onTab,
  Wizard = ExportWizard,
}: {
  agent: Agent;
  /** Switch the editor tab (the AC-8 link to Config). */
  onTab?: (tab: string) => void;
  /** The Export wizard; defaults to the real one, tests may swap it. */
  Wizard?: React.ComponentType<WizardProps>;
}) {
  const t = useTranslations("ci");
  const installations = useCiInstallations(agent.id);
  const [filter, setFilter] = React.useState(ALL_INSTALLATIONS);
  const runs = useCiRuns({ agentId: agent.id, installationId: filter || null });
  const [wizard, setWizard] = React.useState<WizardState>(null);
  const [picking, setPicking] = React.useState(false);
  const reasonId = React.useId();

  const items: CiInstallation[] = installations.data ?? [];
  const exportable = agent.provider === EXPORT_PROVIDER;
  const openWizard = (initial?: WizardInitial) => {
    setPicking(false);
    setWizard({ initial });
  };
  const onUpdateConfig = () => {
    if (items.length === 1) openWizard(toWizardInitial(items[0]!));
    else setPicking(true);
  };
  const reasonProps = exportable ? {} : { "aria-describedby": reasonId };

  const refreshDegraded = runs.refresh.data?.degraded
    ? (runs.refresh.data.message ?? t("ciTab.history.degradedFallback"))
    : null;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("ciTab.heading")}</h2>
        {items.length > 0 && <Badge dot>{t("ciTab.badgeActive", { count: countInstalled(items) })}</Badge>}
        <div style={s.headerActions}>
          {items.length > 0 && (
            <Button icon="RefreshCw" disabled={!exportable} onClick={onUpdateConfig} {...reasonProps}>
              {t("ciTab.updateConfig")}
            </Button>
          )}
          <Button kind="primary" icon="Plus" disabled={!exportable} onClick={() => openWizard()} {...reasonProps}>
            {t("ciTab.addToCi")}
          </Button>
        </div>
      </div>

      {!exportable && (
        <div id={reasonId} style={s.reason}>
          <span>{t("ciTab.notOpenRouter")}</span>
          <button type="button" style={s.linkBtn} onClick={() => onTab?.(CONFIG_TAB_KEY)}>
            {t("ciTab.openConfig")}
          </button>
        </div>
      )}
      {!agent.enabled && <div style={s.notice}>{t("ciTab.disabledAgent")}</div>}

      {picking && (
        <UpdateTargetDialog
          installations={items}
          onPick={(i) => openWizard(toWizardInitial(i))}
          onCancel={() => setPicking(false)}
        />
      )}

      {installations.isLoading ? (
        <div role="status" aria-label={t("ciTab.loading")}>
          <Skeleton height={48} />
        </div>
      ) : installations.isError ? (
        <ErrorState title={t("ciTab.loadError")} />
      ) : items.length === 0 ? (
        <div style={s.empty}>
          <h3 style={s.emptyTitle}>{t("ciTab.emptyTitle")}</h3>
          <p style={s.emptyBody}>{t("ciTab.emptyBody")}</p>
        </div>
      ) : (
        <ul style={s.list} aria-label={t("ciTab.listLabel")}>
          {items.map((i) => (
            <InstallationRow
              key={i.id}
              installation={i}
              outOfDate={isOutOfDate(agent.version, i)}
              disabled={!exportable}
              onUpdate={(inst) => openWizard(toWizardInitial(inst))}
            />
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <button
          type="button"
          style={s.addRow}
          disabled={!exportable}
          onClick={() => openWizard()}
          {...reasonProps}
        >
          <Icon.Plus size={14} aria-hidden />
          {t("ciTab.addRepository")}
        </button>
      )}

      <FailCiOnPanel agent={agent} />

      <section aria-labelledby="ci-history-h" style={s.wrap}>
        <div style={s.sectionTitle}>
          <h3 id="ci-history-h" style={s.h3}>
            {t("ciTab.history.heading")}
          </h3>
          <div style={s.headerActions}>
            {items.length > 1 && (
              <div role="group" aria-label={t("ciTab.history.filterLabel")}>
                <SelectInput
                  mono={false}
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: ALL_INSTALLATIONS, label: t("ciTab.history.filterAll") },
                    ...items.map((i) => ({ value: i.id, label: i.repo })),
                  ]}
                />
              </div>
            )}
            <Button
              size="sm"
              icon="RefreshCw"
              loading={runs.refresh.isPending}
              onClick={() => runs.refresh.mutate()}
            >
              {runs.refresh.isPending ? t("ciTab.history.refreshing") : t("ciTab.history.refresh")}
            </Button>
          </div>
        </div>
        {refreshDegraded && (
          <div style={s.notice} role="status" data-testid="ci-degraded">
            {t("ciTab.history.degraded", { message: refreshDegraded })}
          </div>
        )}
        {runs.isError ? (
          <ErrorState title={t("ciTab.history.loadError")} />
        ) : runs.isLoading ? (
          <Skeleton height={48} />
        ) : runs.items.length === 0 ? (
          <p style={s.muted}>{t("ciTab.history.empty")}</p>
        ) : (
          <>
            <CiRunsTable items={runs.items} hideAgent caption={t("ciTab.history.caption")} />
            {runs.hasNextPage && (
              <Button onClick={() => runs.fetchNextPage()} loading={runs.isFetchingNextPage}>
                {t("ciTab.history.loadMore")}
              </Button>
            )}
          </>
        )}
      </section>

      {wizard && Wizard && <Wizard agent={agent} initial={wizard.initial} onClose={() => setWizard(null)} />}
    </div>
  );
}
