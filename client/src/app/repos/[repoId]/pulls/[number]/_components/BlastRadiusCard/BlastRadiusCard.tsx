/* BlastRadiusCard — PR impact map on the Overview tab: headline counts, then
   every changed symbol with callers as a collapsible tree, and the endpoints
   and crons that depend on it. Shows a marker (with a Resync button) when the
   repo-intel index is not usable. Read-only; no LLM involved. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Card, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { usePrBlastRadius } from "@/lib/hooks/blast";
import { useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { RESYNC_ALLOWED_REASONS, RESYNC_POLL_MAX_MS, RESYNC_POLL_MS } from "./constants";
import { blastCounts, callerLinkSha, symbolsWithoutCallers } from "./blast-model";
import { BlastSymbolRow } from "./_components/BlastSymbolRow";
import { s } from "./styles";

export function BlastRadiusCard({
  prId,
  repoId,
  repoFullName,
  headSha,
}: {
  prId: string | null;
  repoId: string;
  repoFullName: string | null;
  headSha: string;
}) {
  const t = useTranslations("blast");
  const [polling, setPolling] = React.useState(false);
  const [showNoCallers, setShowNoCallers] = React.useState(false);
  const { data, isLoading, isError, error, refetch } = usePrBlastRadius(prId, {
    pollMs: polling ? RESYNC_POLL_MS : false,
  });
  const resync = useResyncRepoIntel(repoId);

  // Polling ends when the map is no longer degraded, or after the cap.
  const stillDegraded = data?.degraded ?? true;
  React.useEffect(() => {
    if (!polling) return;
    if (!stillDegraded) {
      setPolling(false);
      return;
    }
    const timer = setTimeout(() => setPolling(false), RESYNC_POLL_MAX_MS);
    return () => clearTimeout(timer);
  }, [polling, stillDegraded]);

  const startResync = () =>
    resync.mutate(undefined, { onSuccess: () => setPolling(true) });

  if (isLoading) {
    return (
      <Card style={s.card}>
        <SectionLabel icon="Layers">{t("title")}</SectionLabel>
        <Skeleton height={16} width={240} style={{ marginBottom: 10 }} />
        <Skeleton height={60} />
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card style={s.card}>
        <SectionLabel icon="Layers">{t("title")}</SectionLabel>
        <p style={s.errorText}>{error instanceof ApiError ? error.message : t("loadError")}</p>
        <Button kind="secondary" size="sm" icon="RefreshCw" onClick={() => refetch()} style={{ marginTop: 12 }}>
          {t("retry")}
        </Button>
      </Card>
    );
  }

  const counts = blastCounts(data);
  const noCallers = symbolsWithoutCallers(data);
  const sha = callerLinkSha(data, headSha);
  const reason = data.degraded_reason;
  const canResync = reason != null && RESYNC_ALLOWED_REASONS.includes(reason);
  const stats: { key: "symbols" | "callers" | "endpoints" | "crons"; icon: "Code" | "CornerDownRight" | "Globe" | "Clock" }[] = [
    { key: "symbols", icon: "Code" },
    { key: "callers", icon: "CornerDownRight" },
    { key: "endpoints", icon: "Globe" },
    { key: "crons", icon: "Clock" },
  ];

  return (
    <Card style={s.card}>
      <SectionLabel icon="Layers">{t("title")}</SectionLabel>

      {data.degraded && (
        <div style={s.degraded} role="status" data-testid="blast-degraded">
          <div style={s.degradedTitle}>
            <Icon.AlertTriangle size={14} />
            {t("degraded.title")}
          </div>
          {reason && <p style={s.degradedReason}>{t(`degraded.reason.${reason}`)}</p>}
          {canResync && (
            <div style={s.degradedActions}>
              <Button
                kind="secondary"
                size="sm"
                icon="RefreshCw"
                onClick={startResync}
                loading={resync.isPending}
                disabled={resync.isPending || polling}
              >
                {resync.isPending || polling ? t("resyncing") : t("resync")}
              </Button>
              {polling && <span>{t("resyncStarted")}</span>}
              {resync.isError && <span>{t("resyncError")}</span>}
            </div>
          )}
        </div>
      )}

      <div style={s.statsRow}>
        {stats.map(({ key, icon }) => {
          const StatIcon = Icon[icon];
          return (
            <span key={key} style={s.stat} data-testid={`blast-stat-${key}`}>
              <StatIcon size={13} />
              <span style={s.statValue}>{counts[key]}</span>
              {t(`stat.${key}`, { count: counts[key] })}
            </span>
          );
        })}
      </div>

      {data.downstream.length === 0 ? (
        <p style={s.emptyText}>{t("noDownstream", { count: data.changed_symbols.length })}</p>
      ) : (
        <div style={s.list}>
          {data.downstream.map((item, i) => (
            <BlastSymbolRow
              key={`${item.symbol}-${i}`}
              item={item}
              repoFullName={repoFullName}
              sha={sha}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      )}

      {noCallers.length > 0 && data.downstream.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={showNoCallers}
            onClick={() => setShowNoCallers((o) => !o)}
            style={s.noCallersToggle}
          >
            <Icon.ChevronRight size={13} style={{ transform: showNoCallers ? "rotate(90deg)" : "none" }} />
            {t("symbolsWithoutCallers", { count: noCallers.length })}
          </button>
          {showNoCallers && (
            <ul style={s.noCallersList}>
              {noCallers.map((name) => (
                <li key={name} style={s.noCallersItem}>
                  {name}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
