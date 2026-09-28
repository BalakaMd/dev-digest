"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Skeleton, Badge, SEV } from "@devdigest/ui";
import { DiffViewer, FileCard, type DiffCommentApi, type FileAnnotations } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews, useFindingAction } from "@/lib/hooks/reviews";
import { usePrSmartDiff } from "@/lib/hooks/smart-diff";
import { notify } from "@/lib/toast";
import type { FindingActionKind, PrFile } from "@devdigest/shared";
import { SmartDiffGroup } from "./_components/SmartDiffGroup";
import { InlineFinding } from "./_components/InlineFinding";
import { COLLAPSED_ROLES, SEVERITY_LABEL_KEY } from "./constants";
import {
  buildRoleGroups,
  countFilesWithFindings,
  findingsByFile,
  groupFindingsByAnchor,
  latestReviewPerAgent,
  mostSevereFinding,
} from "./smart-diff-model";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const reviewsQuery = usePrReviews(prId);
  const smartQuery = usePrSmartDiff(prId);
  const action = useFindingAction();

  const [order, setOrder] = React.useState<"smart" | "original">("smart");
  // D6: no effect — derived below as `commentsChoice ?? hasFindings`.
  const [commentsChoice, setCommentsChoice] = React.useState<boolean | null>(null);

  const latest = React.useMemo(
    () => latestReviewPerAgent(reviewsQuery.data ?? []),
    [reviewsQuery.data],
  );
  const byFile = React.useMemo(() => findingsByFile(latest), [latest]);
  const hasReview = latest.length > 0;
  const totalFindings = React.useMemo(
    () => latest.reduce((n, r) => n + r.findings.length, 0),
    [latest],
  );
  const hasFindings = totalFindings > 0;
  const showComments = commentsChoice ?? hasFindings;

  const commentCount = comments?.length ?? 0;
  const toggleCount = commentCount + totalFindings;

  const groups = React.useMemo(
    () => (smartQuery.data ? buildRoleGroups(smartQuery.data, files) : null),
    [smartQuery.data, files],
  );

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setCommentsChoice(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  function annotationsFor(file: PrFile): FileAnnotations | undefined {
    const findings = byFile.get(file.path);
    const marker =
      findings && findings.length > 0 ? (
        <span
          aria-label={t("smartDiff.fileHasFindings")}
          title={t("smartDiff.fileHasFindings")}
          style={s.fileMarker}
        />
      ) : undefined;

    const grouped = groupFindingsByAnchor(findings ?? []);

    const byKey = new Map<string, React.ReactNode>();
    if (showComments) {
      for (const [key, list] of grouped) {
        byKey.set(
          key,
          <React.Fragment>
            {list.map((f) => (
              <InlineFinding
                key={f.id}
                finding={f}
                pending={action.isPending && action.variables?.findingId === f.id}
                onAction={(act: FindingActionKind) =>
                  action.mutate({ findingId: f.id, action: act, prId: prId ?? undefined })
                }
              />
            ))}
          </React.Fragment>,
        );
      }
    }

    // The line's own colour + severity pill is a fact about the code, not a
    // comment — it stays visible even while the comments toggle hides the
    // InlineFinding cards above.
    const lineDecor = new Map<string, { color: string; label: React.ReactNode }>();
    for (const [key, list] of grouped) {
      const top = mostSevereFinding(list);
      const sev = SEV[top.severity];
      lineDecor.set(key, {
        color: sev.c,
        label: (
          <Badge icon={sev.icon} color={sev.c} bg={sev.bg} style={s.lineDecorBadge}>
            {t(`smartDiff.severity.${SEVERITY_LABEL_KEY[top.severity]}`)}
          </Badge>
        ),
      });
    }

    return { byKey, unanchoredTitle: t("smartDiff.findingsOutsideDiff"), marker, lineDecor };
  }

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={s.toolbar}>
            <Button kind="ghost" size="sm" onClick={() => setOrder((o) => (o === "smart" ? "original" : "smart"))}>
              {order === "smart" ? t("smartDiff.originalOrder") : t("smartDiff.smartOrder")}
            </Button>
            {toggleCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setCommentsChoice(!showComments)}
              >
                {showComments
                  ? t("smartDiff.hideComments", { count: toggleCount })
                  : t("smartDiff.showComments", { count: toggleCount })}
              </Button>
            )}
          </div>
        }
      >
        {t("smartDiff.title", { count: filesCount })}
      </SectionLabel>

      {!hasReview && reviewsQuery.isFetched && <div style={s.hint}>{t("smartDiff.reviewNotRun")}</div>}

      {order === "original" ? (
        <DiffViewer files={files} commenting={commenting} annotationsFor={annotationsFor} />
      ) : smartQuery.isLoading ? (
        <Skeleton height={200} />
      ) : smartQuery.isError || !groups ? (
        <>
          <div style={s.hint}>{t("smartDiff.groupingUnavailable")}</div>
          <DiffViewer files={files} commenting={commenting} annotationsFor={annotationsFor} />
        </>
      ) : (
        <div style={s.groupsWrap}>
          {groups.map((g) => (
            <SmartDiffGroup
              key={g.role}
              role={g.role}
              filesCount={g.files.length}
              filesWithFindings={hasReview ? countFilesWithFindings(g.files, byFile) : null}
              defaultCollapsed={COLLAPSED_ROLES.has(g.role)}
            >
              {(openCommand) =>
                g.files.map((file) => (
                  <FileCard
                    key={file.path}
                    file={file}
                    commenting={commenting}
                    annotations={annotationsFor(file)}
                    openCommand={openCommand}
                  />
                ))
              }
            </SmartDiffGroup>
          ))}
        </div>
      )}
    </section>
  );
}
