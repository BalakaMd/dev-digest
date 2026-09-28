/* IntentCard — what the classifier derived this PR is meant to do: a quoted
   summary plus in-scope / out-of-scope columns, the confidence level, every
   source considered (with the unavailable ones called out), and a
   derive/re-derive control. Rendered above the tab body on Overview and
   Findings, before the review results (Q7). With `collapsible` (the Agent runs
   tab) it starts folded to its header — title, confidence, stale marker — and
   the body opens on click. */
"use client";

import React from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Badge, Button, Card, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { usePrIntent, useDeriveIntent } from "@/lib/hooks/intent";
import { CONFIDENCE_COLOR, splitSources } from "./helpers";
import { s } from "./styles";

export function IntentCard({
  prId,
  collapsible = false,
}: {
  prId: string | null;
  /** Start folded to the header; the body opens on click. */
  collapsible?: boolean;
}) {
  const t = useTranslations("intent");
  const [open, setOpen] = React.useState(!collapsible);
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const { data, isLoading, isError, error, refetch } = usePrIntent(prId);
  const derive = useDeriveIntent(prId);

  const header = (right?: React.ReactNode) =>
    collapsible ? (
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={s.toggle(open)}>
        <Icon.Sparkles size={14} style={s.toggleIcon} />
        <span style={s.toggleTitle}>{t("title")}</span>
        <span style={s.toggleRight}>
          {right}
          <Icon.ChevronDown size={15} style={s.chevron(open)} />
        </span>
      </button>
    ) : (
      <SectionLabel icon="Sparkles" right={right}>
        {t("title")}
      </SectionLabel>
    );

  if (isLoading) {
    return (
      <Card style={s.card}>
        {header()}
        {open && (
          <>
            <Skeleton height={16} width={280} style={{ marginBottom: 10 }} />
            <Skeleton height={60} />
          </>
        )}
      </Card>
    );
  }

  if (isError) {
    return (
      <Card style={s.card}>
        {header()}
        {open && (
          <>
            <p style={s.errorText}>{error instanceof ApiError ? error.message : t("loadError")}</p>
            <Button kind="secondary" size="sm" icon="RefreshCw" onClick={() => refetch()} style={{ marginTop: 12 }}>
              {t("retry")}
            </Button>
          </>
        )}
      </Card>
    );
  }

  const intent = data?.intent ?? null;
  const deriving = derive.isPending;
  const mutationError =
    derive.isError && (derive.error instanceof ApiError ? derive.error.message : t("deriveError"));

  if (!intent) {
    return (
      <Card style={s.card}>
        {header()}
        {open && (
          <>
            <p style={s.emptyText}>{t("empty")}</p>
            <p style={s.emptyHint}>{t("emptyHint")}</p>
            {mutationError && <p style={s.errorText}>{mutationError}</p>}
            <Button
              kind="secondary"
              size="sm"
              icon="Sparkles"
              onClick={() => derive.mutate()}
              loading={deriving}
              disabled={deriving}
            >
              {deriving ? t("deriving") : t("derive")}
            </Button>
          </>
        )}
      </Card>
    );
  }

  const confColor = CONFIDENCE_COLOR[intent.confidence];
  const { available, unavailable } = splitSources(intent.sources);

  return (
    <Card style={s.card}>
      {header(
        <>
          {collapsible && intent.stale && (
            <Badge color="var(--warn)" bg="var(--warn-bg)">
              {t("staleBadge")}
            </Badge>
          )}
          <Badge color={confColor.color} bg={confColor.bg}>
            {t("confidenceLabel")}: {t(`confidence.${intent.confidence}`)}
          </Badge>
        </>,
      )}

      {open && (
        <>
          <p style={s.summary}>&ldquo;{intent.summary}&rdquo;</p>

          <div style={s.columns}>
            <div style={s.column}>
              <div style={s.columnHeader}>
                <Icon.Check size={13} style={s.inScopeIcon} />
                {t("inScope")}
              </div>
              {intent.in_scope.length === 0 ? (
                <p style={s.emptyList}>{t("emptyList")}</p>
              ) : (
                <ul style={s.list}>
                  {intent.in_scope.map((item, i) => (
                    <li key={i} style={s.listItem}>
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div style={s.column}>
              <div style={s.columnHeader}>
                <Icon.X size={13} style={s.outOfScopeIcon} />
                {t("outOfScope")}
              </div>
              {intent.out_of_scope.length === 0 ? (
                <p style={s.emptyList}>{t("emptyList")}</p>
              ) : (
                <ul style={s.list}>
                  {intent.out_of_scope.map((item, i) => (
                    <li key={i} style={s.listItem}>
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div style={s.sourcesSection}>
            <div style={s.sourcesTitle}>{t("sources.title")}</div>
            <div style={s.sourcesList}>
              {available.map((src, i) => (
                <span key={`available-${i}`} style={s.sourceTag}>
                  {t(`sources.kind.${src.kind}`)} · {src.ref} — {t(`sources.status.${src.status}`)}
                </span>
              ))}
              {unavailable.map((src, i) => (
                <span key={`unavailable-${i}`} style={s.sourceTagUnavailable}>
                  <Icon.AlertTriangle size={11} />
                  {t(`sources.kind.${src.kind}`)} · {src.ref} — {t(`sources.status.${src.status}`)}
                </span>
              ))}
            </div>
            {unavailable.length > 0 && <p style={s.missingContext}>{t("missingContext")}</p>}
          </div>

          {intent.stale && <p style={s.staleWarning}>{t("stale")}</p>}
          {mutationError && <p style={s.errorText}>{mutationError}</p>}

          <div style={s.footer}>
            <span style={s.footerMeta}>
              {t("derivedBy", {
                model: intent.model ?? "—",
                when: format.relativeTime(new Date(intent.derived_at), now),
              })}
            </span>
            <Button
              kind={intent.stale ? "primary" : "ghost"}
              size="sm"
              icon="RefreshCw"
              onClick={() => derive.mutate()}
              loading={deriving}
              disabled={deriving}
            >
              {deriving ? t("deriving") : t("rederive")}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
