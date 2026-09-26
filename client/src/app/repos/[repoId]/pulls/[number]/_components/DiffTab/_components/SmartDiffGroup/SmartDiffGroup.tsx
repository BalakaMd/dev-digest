/* SmartDiffGroup — one role group's header (role label, hint, file count, and
   once a review exists, a dot + count of files with findings) plus its
   collapsible body. The children are the group's FileCards (composition —
   this component knows nothing about how a file is rendered). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { SmartDiffRole } from "@devdigest/shared";
import { ROLE_I18N } from "../../constants";
import { s, chevronFor } from "./styles";

export function SmartDiffGroup({
  role,
  filesCount,
  filesWithFindings,
  defaultCollapsed,
  children,
}: {
  role: SmartDiffRole;
  filesCount: number;
  /** Files (not findings) in this group with >=1 finding; null before any review. */
  filesWithFindings: number | null;
  defaultCollapsed: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(!defaultCollapsed);
  const roleI18n = ROLE_I18N[role];

  return (
    <div style={s.wrap}>
      <div style={s.header} onClick={() => setOpen((o) => !o)}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <span style={s.label}>{t(roleI18n.label)}</span>
        <span style={s.hint}>{t(roleI18n.hint)}</span>
        <span style={s.right}>
          {/* A zero count is not a signal worth a dot — only show once there's
              at least one file with a finding (prototype behaviour). */}
          {filesWithFindings != null && filesWithFindings > 0 && (
            <>
              <span aria-label={String(filesWithFindings)} title={String(filesWithFindings)} style={s.dot} />
              <span>{filesWithFindings}</span>
            </>
          )}
          <span>{t("smartDiff.filesCount", { count: filesCount })}</span>
        </span>
      </div>
      {open && <div style={s.body}>{children}</div>}
    </div>
  );
}
