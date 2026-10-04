"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Skeleton } from "@devdigest/ui";
import type { Verdict } from "@devdigest/shared";
import { useBrief, useBriefGenerating, useBriefSettings, useGenerateBrief } from "@/lib/hooks/brief";
import { usePrReviews } from "@/lib/hooks/reviews";
import { ApiError } from "@/lib/api";
import { VerdictBanner } from "../VerdictBanner";
import { latestVerdictReview } from "./helpers";
import { s, layout } from "./styles";
import { BriefText } from "./_components/BriefText";
import { RiskAreas } from "./_components/RiskAreas";
import { ReviewFocus } from "./_components/ReviewFocus";
import { BriefNotices, type BriefFailure } from "./_components/BriefNotices";
import { BriefProvenance } from "./_components/BriefProvenance";
import { LiveRegion, useAnnouncer } from "./_components/LiveRegion";

interface PrBriefBlockProps {
  prId: string | null;
  repoId: string;
  number: number | string;
  /** Existing Intent card; shown inside the block once a brief is stored (AC-7). */
  intent: React.ReactNode;
  /** Existing Blast radius card; shown inside the block once a brief is stored (AC-7). */
  blast: React.ReactNode;
}

function toFailure(error: unknown): BriefFailure | null {
  if (!error) return null;
  if (error instanceof ApiError && error.status === 409) return { kind: "running" };
  return { kind: "failed", message: error instanceof Error ? error.message : String(error) };
}

/** PR Brief: verdict banner, summary, Risk areas, Review focus; generation only on request. */
export function PrBriefBlock({ prId, repoId, number, intent, blast }: PrBriefBlockProps) {
  const t = useTranslations("brief");
  const { data } = useBrief(prId);
  const generate = useGenerateBrief(prId);
  const generating = useBriefGenerating(prId);
  const { provider, missingKey, tourLanguage } = useBriefSettings();
  const { data: reviews } = usePrReviews(prId);
  const { message, announce } = useAnnouncer();

  const brief = data?.brief ?? null;
  const review = latestVerdictReview(reviews);
  const failure = toFailure(generate.error);
  const busyOrBlocked = !prId || generating || missingKey;

  const start = () => {
    announce(t("live.started"));
    generate.mutate(undefined, {
      onSuccess: () => announce(t("live.succeeded")),
      onError: () => announce(t("live.failed")),
    });
  };

  return (
    <section style={layout.block} aria-labelledby="pr-brief-heading">
      <LiveRegion message={message} />
      <div style={layout.head}>
        <h2 id="pr-brief-heading" style={{ ...s.heading, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon.FileText size={14} />
          {t("block.title")}
        </h2>
        <div style={layout.actions}>
          {generating && brief && <span style={layout.status}>{t("regenerating")}</span>}
          <Button
            kind={brief ? "secondary" : "primary"}
            size="sm"
            icon="RefreshCw"
            disabled={busyOrBlocked}
            aria-busy={generating}
            onClick={start}
          >
            {brief ? t("regenerate") : t("generate")}
          </Button>
        </div>
      </div>

      <BriefNotices
        brief={brief}
        stale={data?.stale ?? false}
        tourLanguage={tourLanguage}
        missingKeyProvider={missingKey ? provider : null}
        failure={failure}
        retryDisabled={busyOrBlocked}
        onRetry={start}
      />

      {review && review.verdict && (
        <VerdictBanner
          verdict={review.verdict as Verdict}
          summary={review.summary}
          score={review.score}
          findingsCount={review.findings.length}
          blockers={review.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length}
          agentName={review.agent_name}
        />
      )}

      {!brief && generating && (
        <div style={layout.skeleton} aria-hidden="true">
          <Skeleton height={16} width="80%" />
          <Skeleton height={120} />
          <Skeleton height={80} />
        </div>
      )}

      {brief && (
        <>
          <p style={layout.summary}>
            <BriefText language={brief.language}>{brief.summary}</BriefText>
          </p>
          <BriefProvenance brief={brief} />
          <div style={layout.columns}>
            <div style={layout.cell}>
              {intent}
              <div style={layout.panel}>
                <RiskAreas risks={brief.risks} language={brief.language} repoId={repoId} number={number} />
              </div>
            </div>
            <div style={layout.cell}>{blast}</div>
          </div>
          <div style={layout.panel}>
            <ReviewFocus items={brief.review_focus} language={brief.language} repoId={repoId} number={number} />
          </div>
        </>
      )}
    </section>
  );
}
