/* VersioningTab — every content change is a version. Each older version can be
   diffed against the CURRENT body, or restored — which writes its body forward
   as a new version, so the history stays append-only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { ConfirmDialog } from "../../../../../../../components/confirm-dialog";
import { useRestoreSkillVersion, useSkillVersions } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { diffLines, diffStat } from "./line-diff";
import { s } from "./styles";

export function VersioningTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [openDiff, setOpenDiff] = React.useState<number | null>(null);
  const [restoring, setRestoring] = React.useState<SkillVersion | null>(null);

  if (isError) return <ErrorState body={t("versions.loadError")} onRetry={() => void refetch()} />;
  if (isLoading || !versions) return <Skeleton height={220} />;

  const confirmRestore = async (version: SkillVersion) => {
    try {
      const saved = await restore.mutateAsync({ id: skill.id, version: version.version });
      toast.success(t("versions.restored", { from: version.version, version: saved.version }));
      setRestoring(null);
      setOpenDiff(null);
    } catch {
      // Surfaced by the global mutation-error toast (lib/providers.tsx).
    }
  };

  return (
    <div>
      {restoring && (
        <ConfirmDialog
          tone="primary"
          title={t("versions.restoreTitle", { version: restoring.version })}
          body={t("versions.restoreBody", { version: restoring.version })}
          confirmLabel={t("versions.restore")}
          pending={restore.isPending}
          onConfirm={() => void confirmRestore(restoring)}
          onCancel={() => setRestoring(null)}
        />
      )}
      <div style={s.titleRow}>
        <h2 style={s.title}>{t("versions.title")}</h2>
        <Badge color="var(--text-secondary)">{versions.length}</Badge>
      </div>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>

      <div style={s.list}>
        {versions.map((v) => {
          const isCurrent = v.version === skill.version;
          const lines = isCurrent ? [] : diffLines(v.body, skill.body);
          const stat = diffStat(lines);
          return (
            <div key={v.version} data-testid={`version-${v.version}`}>
              <div style={s.row(isCurrent)}>
                <span className="mono" style={s.versionBadge}>
                  v{v.version}
                </span>
                <span style={s.date}>{new Date(v.created_at).toLocaleString()}</span>
                {isCurrent ? (
                  <Badge color="var(--ok)" dot>
                    {t("versions.current")}
                  </Badge>
                ) : (
                  <span className="mono" style={s.stat}>
                    {t("versions.stat", { added: stat.added, removed: stat.removed })}
                  </span>
                )}
                <span style={{ flex: 1 }} />
                {!isCurrent && (
                  <>
                    <Button
                      kind="ghost"
                      size="sm"
                      icon="Eye"
                      onClick={() => setOpenDiff(openDiff === v.version ? null : v.version)}
                    >
                      {openDiff === v.version ? t("versions.hideDiff") : t("versions.diff")}
                    </Button>
                    <Button
                      kind="secondary"
                      size="sm"
                      icon="History"
                      onClick={() => setRestoring(v)}
                      disabled={restore.isPending}
                    >
                      {t("versions.restore")}
                    </Button>
                  </>
                )}
              </div>
              {openDiff === v.version && (
                <div style={s.diff}>
                  <div style={s.diffTitle}>
                    {t("versions.diffTitle", { version: v.version, current: skill.version })}
                  </div>
                  {stat.added + stat.removed === 0 ? (
                    <div style={s.diffEmpty}>{t("versions.noChanges")}</div>
                  ) : (
                    <div className="mono" style={s.diffBody}>
                      {lines.map((line, i) => (
                        <div key={i} data-kind={line.kind} style={s.diffLine(line.kind)}>
                          {line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "} {line.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
