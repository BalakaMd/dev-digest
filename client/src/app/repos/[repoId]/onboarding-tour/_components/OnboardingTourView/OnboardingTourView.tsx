/* OnboardingTourView — /repos/:repoId/onboarding-tour. Shows the stored tour
   (or the empty / progress / blocked / missing-key state) from one GET, starts
   a generation with POST, and keeps the page-level polite live region. Opening
   the page never starts a generation (AC-17, AC-22). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import type { OnboardingTourState } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useGenerateOnboardingTour, useOnboardingTour } from "@/lib/hooks/onboarding-tour";
import { useRepoNotFound } from "@/lib/repo-context";
import { ArchitectureSection } from "./_components/ArchitectureSection";
import { CriticalPathsSection } from "./_components/CriticalPathsSection";
import { FirstTasksSection } from "./_components/FirstTasksSection";
import { GenerateEmpty } from "./_components/GenerateEmpty";
import { LiveRegion } from "./_components/LiveRegion";
import { NoData } from "./_components/NoData";
import { ReadingPathSection } from "./_components/ReadingPathSection";
import { RunSection } from "./_components/RunSection";
import { SectionCard } from "./_components/SectionCard";
import { TourHeader } from "./_components/TourHeader";
import { TourNotices } from "./_components/TourNotices";
import { TourToc } from "./_components/TourToc";
import { copyText } from "./_components/clipboard";
import { useAnnouncer } from "./_components/useAnnouncer";
import { SECTIONS } from "./constants";
import { rejectionFrom } from "./helpers";
import { s } from "./styles";
import { useTourNavigation } from "./useTourNavigation";

const SECTION_IDS = SECTIONS.map((x) => x.id);

export function OnboardingTourView({ repoId }: { repoId: string }) {
  const t = useTranslations("onboarding");
  const ts = useTranslations("onboardingSections");
  const repoNotFound = useRepoNotFound(repoId);
  const query = useOnboardingTour(repoId);
  const generate = useGenerateOnboardingTour(repoId);
  const { message, announce } = useAnnouncer();

  const state = query.data;
  const tour = state?.tour ?? null;
  const status = state?.generation.status;
  const running = status === "running" || generate.isPending;
  const rejection = generate.isError ? rejectionFrom(generate.error) : null;

  const blocked = state?.blocked ?? (rejection?.kind === "blocked" ? rejection.blocked : null);
  const missingKey =
    state?.missing_key?.provider ?? (rejection?.kind === "missing_key" ? rejection.provider : null);
  const failure =
    status === "failed"
      ? (state?.generation.error ?? "")
      : rejection?.kind === "error"
        ? rejection.message
        : null;
  const disabled = running || !!blocked || !!missingKey;

  const nav = useTourNavigation(SECTION_IDS, !!tour);

  // Announce start / success / failure when the generation status changes (AC-18, AC-19, AC-20).
  const prev = React.useRef<{ status: string | undefined; generatedAt: string | null }>({
    status: undefined,
    generatedAt: null,
  });
  React.useEffect(() => {
    if (!state) return;
    const before = prev.current;
    const generatedAt = state.tour?.generated_at ?? null;
    if (before.status !== undefined) {
      if (state.generation.status === "running" && before.status !== "running") announce(t("live.started"));
      else if (before.status === "running" && state.generation.status === "failed") announce(t("live.failed"));
      else if (before.status === "running" && generatedAt && generatedAt !== before.generatedAt) {
        announce(t("live.done"));
      }
    } else if (state.generation.status === "running") {
      announce(t("live.started"));
    }
    prev.current = { status: state.generation.status, generatedAt };
  }, [state, announce, t]);

  const start = () => {
    generate.mutate(undefined, {
      onError: () => announce(t("live.failed")),
    });
  };

  const share = async () => {
    const ok = await copyText(nav.shareUrl());
    announce(ok ? t("share.copied") : t("share.failed"));
  };

  const fullName = state?.repo.full_name ?? "";
  const crumb = [{ label: fullName || t("title"), mono: !!fullName, href: `/repos/${repoId}/pulls` }, { label: t("title") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  let body: React.ReactNode;
  let aside: React.ReactNode = null;
  if (query.isLoading) {
    body = (
      <div style={s.skeletons} aria-busy="true">
        <Skeleton height={34} />
        <Skeleton height={20} />
        <Skeleton height={200} />
      </div>
    );
  } else if (!state) {
    body = <ErrorState title={t("loadError.title")} onRetry={() => void query.refetch()} />;
  } else {
    const notices = (
      <TourNotices
        blocked={blocked}
        missingKeyProvider={missingKey}
        regenerating={running && !!tour}
        error={tour || failure !== null ? failure : null}
        retryDisabled={disabled}
        onRetry={start}
      />
    );
    if (!tour) {
      body = (
        <main style={s.main}>
          {notices}
          {running ? (
            <div style={s.progress} role="status" aria-busy="true">
              <Skeleton height={20} />
              <strong>{t("generating.title")}</strong>
              <span style={s.progressBody}>{t("generating.body")}</span>
            </div>
          ) : (
            <GenerateEmpty
              title={t("generate.title")}
              body={t("generate.body")}
              cta={t("generate.cta")}
              onCta={start}
              disabled={disabled}
            />
          )}
        </main>
      );
    } else {
      aside = (
        <aside style={s.aside}>
          <TourToc
            items={SECTIONS.map((x) => ({ id: x.id, label: ts(`sections.${x.labelKey}`) }))}
            activeId={nav.activeId}
            onSelect={nav.select}
          />
        </aside>
      );
      body = (
        <main style={s.main}>
          <TourHeader
            fullName={fullName}
            generatedAt={tour.generated_at}
            indexedFiles={tour.indexed_files}
            languageChanged={state.language_changed}
            indexChanged={state.index_changed}
            regenerateDisabled={disabled}
            regenerating={running}
            onRegenerate={start}
            onShare={() => void share()}
          />
          {notices}
          <div style={s.sections}>{renderSections(state, tour, disabled, start, announce, ts)}</div>
        </main>
      );
    }
  }

  return (
    <AppShell crumb={crumb}>
      <LiveRegion message={message} />
      <div style={s.page}>
        {aside}
        {body}
      </div>
    </AppShell>
  );
}

function renderSections(
  state: OnboardingTourState,
  tour: NonNullable<OnboardingTourState["tour"]>,
  disabled: boolean,
  regenerate: () => void,
  announce: (m: string) => void,
  ts: ReturnType<typeof useTranslations>,
) {
  const common = {
    language: tour.language,
    fullName: state.repo.full_name,
    branch: state.repo.default_branch,
    onRegenerate: regenerate,
    regenerateDisabled: disabled,
  };
  const bodies = {
    architecture: tour.architecture ? (
      <ArchitectureSection architecture={tour.architecture} language={tour.language} />
    ) : (
      <NoData onRegenerate={regenerate} regenerateDisabled={disabled} />
    ),
    "critical-paths": <CriticalPathsSection items={tour.critical_paths} {...common} />,
    run: <RunSection commands={tour.run.commands} announce={announce} />,
    "reading-path": <ReadingPathSection items={tour.reading_path} {...common} />,
    "first-tasks": <FirstTasksSection items={tour.first_tasks} {...common} />,
  };
  return SECTIONS.map((x) => (
    <SectionCard key={x.id} id={x.id} icon={x.icon} title={ts(`sections.${x.labelKey}`)}>
      {bodies[x.id]}
    </SectionCard>
  ));
}
