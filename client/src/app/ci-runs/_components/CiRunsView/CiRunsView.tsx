/* CiRunsView — /ci-runs: every CI run of the workspace, newest first (SPEC-09 AC-47…AC-52).
   Opening the page triggers one refresh from GitHub (AC-59); a degraded refresh keeps
   the stored runs and shows a notice instead of an error. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { CiRunItem } from "@devdigest/shared";
import { AppShell } from "../../../../components/app-shell";
import { CiRunsTable } from "../../../../components/ci-runs-table";
import { useCiRuns } from "../../../../lib/hooks";
import { CiRunDetails } from "./CiRunDetails";
import { s } from "./styles";

export function CiRunsView() {
  const t = useTranslations("ci");
  const runs = useCiRuns();
  const [selected, setSelected] = React.useState<CiRunItem | null>(null);
  const { refresh } = runs;
  const degraded = refresh.data?.degraded ? (refresh.data.message ?? t("runs.degradedFallback")) : null;

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("runs.title")}</h1>
            <p style={s.subtitle}>{t("runs.subtitle")}</p>
          </div>
          <Button kind="secondary" icon="RefreshCw" loading={refresh.isPending} onClick={() => refresh.mutate()}>
            {refresh.isPending ? t("runs.refreshing") : t("runs.refresh")}
          </Button>
        </div>

        <div role="status" aria-live="polite">
          {degraded && (
            <div style={s.notice} data-testid="ci-degraded">
              {t("runs.degraded", { message: degraded })}
            </div>
          )}
        </div>

        {runs.isLoading ? (
          <div aria-busy="true" aria-label={t("runs.loading")} style={s.list}>
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        ) : runs.isError ? (
          <ErrorState title={t("runs.loadError")} body={runs.error.message} onRetry={() => runs.refetch()} />
        ) : runs.items.length === 0 ? (
          <EmptyState
            icon="Workflow"
            title={t("runs.emptyTitle")}
            body={
              <>
                {t("runs.emptyBody")}{" "}
                <Link href="/agents" style={s.link}>
                  {t("runs.emptyLink")}
                </Link>
              </>
            }
          />
        ) : (
          <>
            <CiRunsTable items={runs.items} onOpen={setSelected} />
            {runs.hasNextPage && (
              <div style={s.more}>
                <Button kind="secondary" loading={runs.isFetchingNextPage} onClick={() => runs.fetchNextPage()}>
                  {t("runs.loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      {selected && <CiRunDetails run={selected} onClose={() => setSelected(null)} />}
    </AppShell>
  );
}
