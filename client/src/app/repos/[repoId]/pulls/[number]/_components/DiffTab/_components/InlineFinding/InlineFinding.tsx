/* InlineFinding — a Smart Diff finding rendered under its own line in the
   diff (D7: simpler than FindingCard — left severity bar, severity word on
   the right, one-line collapse). Not a FindingCard reuse; FindingCard stays
   untouched. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Button, Markdown, SEV } from "@devdigest/ui";
import type { FindingRecord, FindingActionKind } from "@devdigest/shared";
import { SEVERITY_LABEL_KEY } from "../../constants";
import { s, chevronFor } from "./styles";

export function InlineFinding({
  finding,
  pending,
  onAction,
}: {
  finding: FindingRecord;
  pending: boolean;
  onAction: (action: FindingActionKind) => void;
}) {
  const t = useTranslations("prReview");
  // Starts expanded (S6 default); the header alone still collapses to one
  // informative line (severity, title, state tags) when toggled.
  const [collapsed, setCollapsed] = React.useState(false);
  const sev = SEV[finding.severity];
  const SevIcon = Icon[sev.icon];
  const accepted = !!finding.accepted_at;
  const dismissed = !!finding.dismissed_at;
  const muted = accepted || dismissed;

  return (
    <div data-finding-id={finding.id} style={s.card(sev.c, muted)}>
      <div
        style={s.header}
        onClick={() => setCollapsed((c) => !c)}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        aria-label={collapsed ? t("smartDiff.expandFinding") : t("smartDiff.collapseFinding")}
        title={collapsed ? t("smartDiff.expandFinding") : t("smartDiff.collapseFinding")}
      >
        <Icon.ChevronRight size={13} style={chevronFor(!collapsed)} />
        <SevIcon size={14} style={{ color: sev.c, flexShrink: 0 }} />
        <span style={s.title(muted)}>{finding.title}</span>
        {accepted && <span style={s.tag}>{t("finding.accepted")}</span>}
        {dismissed && <span style={s.tag}>{t("finding.dismissed")}</span>}
        <span style={{ ...s.severityWord, color: sev.c }}>
          {t(`smartDiff.severity.${SEVERITY_LABEL_KEY[finding.severity]}`)}
        </span>
      </div>

      {!collapsed && (
        <div style={s.body}>
          <Markdown>{finding.rationale}</Markdown>
          <div style={s.actions}>
            <Button
              kind="secondary"
              size="sm"
              icon="Check"
              disabled={pending}
              active={accepted}
              onClick={() => onAction("accept")}
            >
              {t("finding.accept")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="X"
              disabled={pending}
              active={dismissed}
              onClick={() => onAction("dismiss")}
            >
              {t("finding.dismiss")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
