/* CaseResultDrawer — one eval run's case results (SPEC-06 AC-39, 40, 67): a list of the
   run's cases with pass / fail / error as text + icon, and per case its expectations
   (type, file, lines), the findings that passed grounding with matched yes/no, the
   findings the grounding gate dropped with their reasons and, for an errored case, its
   error message. Stored text (names, titles, files, reasons, errors) is rendered as
   plain text; only a finding's rationale goes through the safe Markdown renderer (NFR-3). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Drawer, ErrorState, Icon, Markdown, Skeleton } from "@devdigest/ui";
import type { EvalCaseRun, EvalCaseRunDetail, EvalSuiteRun } from "@devdigest/shared";
import { useEvalCaseRun, useEvalRun } from "../../../../../../lib/hooks/eval";
import { formatRunTime } from "../../../../../../lib/format";
import { s } from "./styles";

export interface CaseResultDrawerProps {
  run: EvalSuiteRun;
  onClose: () => void;
}

const typeKey = (type: string) => (type === "must_find" ? "caseResult.expectationMustFind" : "caseResult.expectationMustNotFlag");

type Tone = "pass" | "fail" | "error";
const toneOf = (c: { status: "ok" | "error"; passed: boolean | null }): Tone =>
  c.status === "error" ? "error" : c.passed ? "pass" : "fail";

function Outcome({ tone }: { tone: Tone }) {
  const t = useTranslations("eval");
  const I = tone === "pass" ? Icon.CheckCircle : tone === "fail" ? Icon.XCircle : Icon.AlertTriangle;
  return (
    <span style={s.state(tone)}>
      <I size={14} aria-hidden="true" />
      {tone === "pass" ? t("caseResult.passed") : tone === "fail" ? t("caseResult.failed") : t("caseResult.errored")}
    </span>
  );
}

function CaseList({ cases, onOpen }: { cases: EvalCaseRun[]; onOpen: (c: EvalCaseRun) => void }) {
  const t = useTranslations("eval");
  if (cases.length === 0) return <p style={s.muted}>{t("caseResult.casesEmpty")}</p>;
  return (
    <ul style={s.list} aria-label={t("caseResult.casesHeading")}>
      {cases.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            style={s.caseBtn}
            aria-label={t("caseResult.openCase", { name: c.case_name })}
            onClick={() => onOpen(c)}
          >
            <span style={s.caseRow}>
              <span style={s.name}>{c.case_name}</span>
              <Outcome tone={toneOf(c)} />
            </span>
            {c.case_id == null && <span style={s.muted}>{t("caseResult.deleted")}</span>}
            {c.status === "error" && <span style={s.error}>{t("caseResult.error", { message: c.error ?? "" })}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function CaseDetail({ detail }: { detail: EvalCaseRunDetail }) {
  const t = useTranslations("eval");
  const tone = toneOf(detail);
  const matchOf = (i: number) => detail.expectation_matches.find((m) => m.expectation_index === i);
  return (
    <div style={s.root}>
      <div>
        <h3 style={s.heading}>{t("caseResult.outcome")}</h3>
        <Outcome tone={tone} />
        {detail.status === "error" && <p style={s.error}>{t("caseResult.error", { message: detail.error ?? "" })}</p>}
        {detail.case_id == null && <p style={s.muted}>{t("caseResult.deleted")}</p>}
      </div>

      <section aria-labelledby="case-result-expected">
        <h3 id="case-result-expected" style={s.heading}>
          {t("caseResult.expected")}
        </h3>
        <ul style={s.list}>
          {detail.expectations.map((e, i) => {
            const m = matchOf(i);
            return (
              <li key={i} style={s.card}>
                <span>
                  <strong>{t(typeKey(e.type))}</strong>{" "}
                  <span style={s.mono}>{t("caseResult.lines", { file: e.file, start: e.start_line, end: e.end_line })}</span>
                </span>
                {m && <span style={s.muted}>{m.matched ? t("caseResult.expectationMet") : t("caseResult.expectationNotMet")}</span>}
              </li>
            );
          })}
        </ul>
      </section>

      {detail.status === "ok" && (
        <>
          <section aria-labelledby="case-result-returned">
            <h3 id="case-result-returned" style={s.heading}>
              {t("caseResult.returned")}
            </h3>
            {detail.findings.length === 0 ? (
              <p style={s.muted}>{t("caseResult.noFindings")}</p>
            ) : (
              <ul style={s.list}>
                {detail.findings.map((f, i) => (
                  <li key={i} style={s.card}>
                    <span>
                      <strong>{f.title}</strong>
                    </span>
                    <span style={s.mono}>{t("caseResult.lines", { file: f.file, start: f.start_line, end: f.end_line })}</span>
                    <span style={s.state(f.matched ? "pass" : "fail")}>
                      {f.matched ? t("caseResult.matched") : t("caseResult.unmatched")}
                    </span>
                    {f.rationale && (
                      <div style={s.rationale}>
                        <Markdown>{f.rationale}</Markdown>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="case-result-dropped">
            <h3 id="case-result-dropped" style={s.heading}>
              {t("caseResult.dropped")}
            </h3>
            {detail.dropped.length === 0 ? (
              <p style={s.muted}>{t("caseResult.noDropped")}</p>
            ) : (
              <ul style={s.list}>
                {detail.dropped.map((d, i) => (
                  <li key={i} style={s.card}>
                    <strong>{d.title}</strong>
                    <span style={s.mono}>{t("caseResult.lines", { file: d.file, start: d.start_line, end: d.end_line })}</span>
                    <span style={s.muted}>{t("caseResult.droppedReason", { reason: d.reason })}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function CaseResultDrawer({ run, onClose }: CaseResultDrawerProps) {
  const t = useTranslations("eval");
  const [open, setOpen] = React.useState<EvalCaseRun | null>(null);
  const runDetail = useEvalRun(run.id);
  const caseDetail = useEvalCaseRun(run.id, open?.id);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const when = formatRunTime(run.started_at);
  const scored = run.cases_total - run.cases_errored;

  return (
    <Drawer
      width={640}
      title={open ? t("caseResult.title", { name: open.case_name }) : t("caseResult.runTitle", { when })}
      subtitle={
        open
          ? undefined
          : `${t("caseResult.runSubtitle", { version: run.agent_version, passed: run.cases_passed, scored })} · ${t("caseResult.scoredCount", { count: run.cases_errored })}`
      }
      onClose={onClose}
    >
      <div style={s.root}>
        {open ? (
          <>
            <button type="button" style={s.back} onClick={() => setOpen(null)}>
              {t("caseResult.back")}
            </button>
            {caseDetail.isLoading ? (
              <div aria-busy="true" aria-label={t("caseResult.loading")}>
                <Skeleton height={120} />
              </div>
            ) : caseDetail.isError || !caseDetail.data ? (
              <ErrorState
                title={t("caseResult.caseLoadError")}
                body={caseDetail.error?.message ?? ""}
                onRetry={() => caseDetail.refetch()}
              />
            ) : (
              <CaseDetail detail={caseDetail.data} />
            )}
          </>
        ) : runDetail.isLoading ? (
          <div aria-busy="true" aria-label={t("caseResult.loading")}>
            <Skeleton height={120} />
          </div>
        ) : runDetail.isError || !runDetail.data ? (
          <ErrorState
            title={t("caseResult.casesLoadError")}
            body={runDetail.error?.message ?? ""}
            onRetry={() => runDetail.refetch()}
          />
        ) : (
          <CaseList cases={runDetail.data.cases} onOpen={setOpen} />
        )}
      </div>
    </Drawer>
  );
}
