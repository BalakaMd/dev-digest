/* PriorPrsAccordion — collapsed-by-default block under the blast radius:
   earlier merged PRs that touched the same files, from GET /pulls/:id/history.
   Always present; loading, error, degraded and empty each show their own text.
   Titles, authors, file paths and notes are server data, rendered as text. */
"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge, Button, Icon, Skeleton } from "@devdigest/ui";
import { usePrHistory } from "@/lib/hooks/history";
import { githubPrUrl } from "@/lib/github-urls";
import { PRIOR_PR_MAX_FILES } from "./constants";
import { s } from "./styles";

export function PriorPrsAccordion({
  prId,
  repoFullName,
}: {
  prId: string | null;
  repoFullName: string | null;
}) {
  const t = useTranslations("blast");
  const format = useFormatter();
  const [open, setOpen] = React.useState(false);
  const { data, isLoading, isError, refetch } = usePrHistory(prId);

  const count = data && !data.degraded ? data.history.length : null;

  return (
    <section style={s.root}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={s.toggle}>
        <Icon.ChevronRight size={13} style={{ transform: open ? "rotate(90deg)" : "none" }} />
        <Icon.History size={13} />
        {t("prior.title")}
        {count != null && (
          <span role="img" aria-label={t("prior.count", { count })}>
            <Badge>{count}</Badge>
          </span>
        )}
      </button>

      {open && (
        <div style={s.body}>
          {isLoading ? (
            <Skeleton height={40} />
          ) : isError || !data ? (
            <>
              <p style={s.errorText}>{t("prior.loadError")}</p>
              <div>
                <Button kind="secondary" size="sm" icon="RefreshCw" onClick={() => refetch()}>
                  {t("retry")}
                </Button>
              </div>
            </>
          ) : data.degraded ? (
            <p style={s.text}>{data.degraded_reason ? t(`prior.degraded.${data.degraded_reason}`) : t("prior.empty")}</p>
          ) : data.history.length === 0 ? (
            <p style={s.text}>{t("prior.empty")}</p>
          ) : (
            <ul style={s.list}>
              {data.history.map((pr) => {
                const label = `#${pr.pr_number} ${pr.title}`;
                return (
                  <li key={pr.pr_number} style={s.item}>
                    <span style={s.titleLine}>
                      {repoFullName ? (
                        <a
                          href={githubPrUrl(repoFullName, pr.pr_number)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={s.link}
                        >
                          {label}
                        </a>
                      ) : (
                        label
                      )}
                    </span>
                    <span style={s.meta}>
                      {t("prior.byAuthor", { author: pr.author })}
                      {" · "}
                      {t("prior.mergedOn", {
                        date: format.dateTime(new Date(pr.merged_at), { dateStyle: "medium" }),
                      })}
                    </span>
                    {pr.files_overlap.length > 0 && (
                      <div style={s.files}>
                        <span style={s.meta}>{t("prior.filesLabel")}</span>
                        {pr.files_overlap.slice(0, PRIOR_PR_MAX_FILES).map((f) => (
                          <code key={f} style={s.file}>
                            {f}
                          </code>
                        ))}
                        {pr.files_overlap.length > PRIOR_PR_MAX_FILES && (
                          <span style={s.meta} title={pr.files_overlap.slice(PRIOR_PR_MAX_FILES).join("\n")}>
                            {t("prior.moreFiles", { count: pr.files_overlap.length - PRIOR_PR_MAX_FILES })}
                          </span>
                        )}
                      </div>
                    )}
                    {pr.notes && <p style={s.notes}>{pr.notes}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
