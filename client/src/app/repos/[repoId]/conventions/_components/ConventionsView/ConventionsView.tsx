/* ConventionsView — /repos/:repoId/conventions. Run Scan (first time) or
   ReScan extracts the repo's house conventions; each candidate card can be
   accepted, rejected or edited in place, and once at least one is accepted
   "Create skill" turns them into skills through an editable modal. Rejected
   cards sit behind the "Rejected (N)" filter, where they can be restored. */
"use client";

import React from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useConventions, useExtractConventions, useUpdateConvention } from "@/lib/hooks/conventions";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { categoryCounts } from "./convention-categories";
import { CategoryFilter, type ConventionFilter } from "./_components/CategoryFilter";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateConventionSkillModal } from "./_components/CreateConventionSkillModal";
import { s } from "./styles";

export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions");
  const format = useFormatter();
  // Re-render once a minute so "last scan 3 minutes ago" stays true.
  const now = useNow({ updateInterval: 60_000 });
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const [filter, setFilter] = React.useState<ConventionFilter>(null);
  const [creating, setCreating] = React.useState(false);

  const repoName = activeRepo?.name ?? t("page.repoFallback");
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const scan = data?.scan ?? null;
  const candidates = data?.candidates ?? [];
  const rejected = data?.rejected ?? [];
  const accepted = candidates.filter((c) => c.status === "accepted");
  const categories = categoryCounts(candidates);
  // A filter whose cards are all gone (a category fully rejected, the last
  // rejected card restored) falls back to All.
  const activeFilter: ConventionFilter =
    filter === "rejected"
      ? rejected.length > 0
        ? "rejected"
        : null
      : filter && categories.some((c) => c.category === filter)
        ? filter
        : null;
  const showingRejected = activeFilter === "rejected";
  const visible = showingRejected
    ? rejected
    : activeFilter
      ? candidates.filter((c) => c.category === activeFilter)
      : candidates;

  const runScan = () => extract.mutate();
  const patch = (c: ConventionCandidate, p: Parameters<typeof update.mutate>[0]["patch"]) =>
    update.mutate({ id: c.id, patch: p });

  return (
    <AppShell crumb={crumb}>
      {creating && (
        <CreateConventionSkillModal
          repoId={repoId}
          repoName={repoName}
          acceptedCount={accepted.length}
          onClose={() => setCreating(false)}
        />
      )}

      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span style={s.repo}>{repoName}</span>
            </h1>
            <p style={s.subtitle}>
              {scan
                ? `${t("page.scanSummary", {
                    files: scan.sample_files.length,
                    when: format.relativeTime(new Date(scan.created_at), now),
                  })} · ${t("page.scanDropped", { dropped: scan.dropped_unverified })}`
                : t("page.subtitle")}
            </p>
          </div>
          {scan && (
            <Button icon="RefreshCw" onClick={runScan} loading={extract.isPending} disabled={extract.isPending}>
              {extract.isPending ? t("page.scanning") : t("page.rescan")}
            </Button>
          )}
        </div>

        {isLoading && (
          <div style={s.list}>
            <Skeleton height={150} />
            <Skeleton height={150} />
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => void refetch()} />}

        {data && !scan && (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={extract.isPending ? t("page.scanning") : t("page.runScan")}
            onCta={runScan}
            ctaLoading={extract.isPending}
          />
        )}

        {scan && (candidates.length > 0 || rejected.length > 0) && (
          <div style={s.toolbar}>
            <CategoryFilter
              total={candidates.length}
              categories={categories}
              rejectedCount={rejected.length}
              active={activeFilter}
              onChange={setFilter}
            />
            <span style={s.acceptedCount}>
              {t("page.acceptedCount", { accepted: accepted.length, total: candidates.length })}
            </span>
            {accepted.length > 0 && (
              <Button kind="primary" icon="Sparkles" onClick={() => setCreating(true)}>
                {t("page.createSkill")}
              </Button>
            )}
          </div>
        )}

        {scan && !showingRejected && candidates.length === 0 && (
          <EmptyState icon="ListChecks" title={t("page.noCandidates.title")} body={t("page.noCandidates.body")} />
        )}

        {showingRejected && <p style={s.hint}>{t("page.rejectedHint")}</p>}

        {scan && visible.length > 0 && (
          <div style={s.list}>
            {visible.map((c) => (
              <ConventionCard
                key={c.id}
                candidate={c}
                onToggleAccept={() => patch(c, { status: c.status === "accepted" ? "pending" : "accepted" })}
                onReject={() => patch(c, { status: "rejected" })}
                onSave={(edit) => patch(c, edit)}
                onRestore={() => patch(c, { status: "pending" })}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
