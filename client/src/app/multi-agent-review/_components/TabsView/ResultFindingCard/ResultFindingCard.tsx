/* ResultFindingCard — one finding on the multi-agent result page. Collapsed:
   severity, title, file:line, confidence. Expanded: rationale and suggested fix
   (vendor Markdown, never raw HTML), "also flagged by", Accept / Dismiss,
   "Turn into eval case" and a disabled "Learn". No "Reply to author" (spec NG-7).
   Decisions go out through callbacks; no data fetching here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge, CategoryTag, Button, Markdown, type Severity, type Category } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { EvalCaseButton } from "@/components/eval-case-button";
import { decisionButtonStyle } from "@/lib/finding-decision-style";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

export interface ResultFindingCardProps {
  finding: FindingRecord;
  /** Names of the other agents with a finding in the same group (empty: none). */
  alsoFlaggedBy?: string[];
  onAccept: (findingId: string) => void;
  onDismiss: (findingId: string) => void;
  /** A decision request for this finding is in flight. */
  pending?: boolean;
  /** Name of an eval case already made from this finding. */
  evalCaseName?: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
  defaultExpanded?: boolean;
}

function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

export function ResultFindingCard({
  finding: f,
  alsoFlaggedBy = [],
  onAccept,
  onDismiss,
  pending,
  evalCaseName,
  repoFullName,
  headSha,
  defaultExpanded = false,
}: ResultFindingCardProps) {
  const t = useTranslations("multiAgentTabs");
  const tc = useTranslations("multiAgentCommon");
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const bodyId = React.useId();
  const learnHintId = React.useId();
  const accepted = !!f.accepted_at;
  const dismissed = !!f.dismissed_at;
  const decided = accepted || dismissed;
  const percent = Math.round(f.confidence * 100);
  const href =
    repoFullName && headSha
      ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
      : undefined;
  const location = `${f.file}:${lineLabel(f)}`;

  return (
    <div data-finding-id={f.id} style={s.card(f.severity, decided)}>
      <button
        type="button"
        style={s.header}
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => setExpanded((e) => !e)}
      >
        <SeverityBadge severity={f.severity as Severity} compact />
        <span style={s.headerMain}>
          <span style={s.titleRow}>
            <span style={s.title(dismissed)}>{f.title}</span>
            <CategoryTag category={f.category as Category} />
            {accepted && <span style={s.tagOk}>{t("finding.accepted")}</span>}
            {dismissed && <span style={s.tag}>{t("finding.dismissed")}</span>}
          </span>
          <span style={s.metaRow}>
            <span className="mono" style={s.location}>
              {location}
            </span>
            <span className="mono tnum" style={s.confidence}>
              {t("finding.confidence", { percent })}
            </span>
          </span>
        </span>
        <Icon.ChevronDown size={16} aria-hidden="true" style={s.chevron(expanded)} />
      </button>

      {alsoFlaggedBy.length > 0 && (
        <div style={{ ...s.also, padding: "0 16px 12px" }}>
          {tc("alsoFlaggedBy", { names: alsoFlaggedBy.join(", ") })}
        </div>
      )}

      {expanded && (
        <div id={bodyId} style={s.body}>
          {href && (
            <a href={href} target="_blank" rel="noopener noreferrer" className="mono" style={s.location}>
              {location}
            </a>
          )}
          <div style={s.prose}>
            <Markdown>{f.rationale}</Markdown>
          </div>
          {f.suggestion && (
            <div style={s.suggestionWrap}>
              <div style={s.suggestionLabel}>{t("finding.suggestedFix")}</div>
              <div style={s.prose}>
                <Markdown>{f.suggestion}</Markdown>
              </div>
            </div>
          )}

          <div style={s.actions}>
            <Button
              kind="ghost"
              size="sm"
              icon="Check"
              disabled={pending}
              active={accepted}
              aria-pressed={accepted}
              style={decisionButtonStyle("accept", accepted)}
              onClick={() => onAccept(f.id)}
            >
              {t("finding.accept")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="X"
              disabled={pending}
              active={dismissed}
              aria-pressed={dismissed}
              style={decisionButtonStyle("dismiss", dismissed)}
              onClick={() => onDismiss(f.id)}
            >
              {t("finding.dismiss")}
            </Button>
            <div style={s.learnWrap}>
              <Button kind="ghost" size="sm" icon="Brain" disabled aria-describedby={learnHintId}>
                {t("finding.learn")}
              </Button>
              <span id={learnHintId} style={s.hint}>
                {t("finding.learnUnavailable")}
              </span>
            </div>
            <EvalCaseButton findingId={f.id} decided={decided} existingCaseName={evalCaseName} />
          </div>
        </div>
      )}
    </div>
  );
}
