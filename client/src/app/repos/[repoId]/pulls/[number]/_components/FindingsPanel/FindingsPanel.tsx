/* FindingsPanel — severity counters + severity filter + hide-low-confidence +
   j/k navigation + FindingCard list, wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState, Badge, Icon, SEV, type Severity } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { FILTER_SEVERITIES, KEY_TO_ACTION, SEVERITY_ORDER } from "./constants";
import { severityCounts, visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  // Deep link: /pulls/N?tab=findings&severity=CRITICAL pre-applies the filter
  // (the PR list's findings chips navigate here). Unknown values are ignored.
  const urlSeverity = useSearchParams().get("severity");
  const [hideLow, setHideLow] = React.useState(false);
  const [severityFilter, setSeverityFilter] = React.useState<string | null>(
    urlSeverity && urlSeverity in SEVERITY_ORDER ? urlSeverity : null,
  );
  const [focusIdx, setFocusIdx] = React.useState(0);

  const counts = React.useMemo(() => severityCounts(findings), [findings]);
  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, severityFilter),
    [findings, hideLow, severityFilter],
  );

  // Click a filter to keep only that severity; click the active one to show all.
  const toggleSeverity = (sev: string) => {
    setSeverityFilter((cur) => (cur === sev ? null : sev));
    setFocusIdx(0);
  };

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  return (
    <div>
      {counts.length > 0 && (
        <>
          <div style={s.counterRow} role="group" aria-label={t("panel.severityCounters")}>
            {counts.map(([sev, count]) => (
              <Badge
                key={sev}
                icon={SEV[sev as Severity]?.icon}
                color={SEV[sev as Severity]?.c}
                bg={SEV[sev as Severity]?.bg}
              >
                {count} {sev}
              </Badge>
            ))}
          </div>
          <div style={s.filterRow} role="group" aria-label={t("panel.severityFilters")}>
            {FILTER_SEVERITIES.map((sev) => {
              const active = severityFilter === sev;
              const SevIcon = Icon[SEV[sev].icon];
              return (
                <button
                  key={sev}
                  type="button"
                  aria-pressed={active}
                  title={
                    active
                      ? t("panel.showAllSeverities")
                      : t("panel.showOnlySeverity", { severity: sev })
                  }
                  onClick={() => toggleSeverity(sev)}
                  style={s.filterButton(active, SEV[sev].c, SEV[sev].bg)}
                >
                  <SevIcon size={13} style={{ color: SEV[sev].c }} />
                  {SEV[sev].label}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div style={s.toolbar}>
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
