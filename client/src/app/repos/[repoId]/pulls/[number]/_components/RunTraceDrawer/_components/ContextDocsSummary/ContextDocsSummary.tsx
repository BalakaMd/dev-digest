/* ContextDocsSummary — per-document token list and skipped list of the
   `## Project context` block, shown under its prompt segment. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import { s } from "../../styles";

type TraceContext = NonNullable<RunTrace["context"]>;

export function ContextDocsSummary({ context }: { context: TraceContext }) {
  const t = useTranslations("runs");
  const reasonLabel = (reason: string) =>
    t.has(`trace.context.reason.${reason}`) ? t(`trace.context.reason.${reason}`) : reason;
  return (
    <div style={s.ctxSummary}>
      {context.docs.map((d) => (
        <div key={`${d.source}:${d.path}`} style={s.ctxRow}>
          <span className="mono" style={s.spec}>
            {d.path}
          </span>
          {d.source === "local" && <span style={s.localMark}>{t("trace.config.local")}</span>}
          <span className="mono" style={s.promptMeta}>
            {t("trace.context.docTokens", { count: d.tokens })}
          </span>
        </div>
      ))}
      {context.skipped.length > 0 && (
        <>
          <div style={s.ctxSkippedTitle}>{t("trace.context.skippedTitle")}</div>
          {context.skipped.map((d) => (
            <div key={d.path} style={s.ctxRow}>
              <span className="mono" style={s.spec}>
                {d.path}
              </span>
              <span style={s.promptMeta}>{reasonLabel(d.reason)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
