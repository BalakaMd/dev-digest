/* SmartDiffGroup — one role group's header (role label, hint, file count, and
   once a review exists, a dot + count of files with findings) plus its
   collapsible body. The children are the group's FileCards (composition —
   this component knows nothing about how a file is rendered); it only hands
   them the group's "collapse / expand all files" command. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { SmartDiffRole } from "@devdigest/shared";
import type { FileOpenCommand } from "@/components/diff-viewer";
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
  /** Renders the group's files; `openCommand` is null until the user asks. */
  children: (openCommand: FileOpenCommand | null) => React.ReactNode;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(!defaultCollapsed);
  const [openCommand, setOpenCommand] = React.useState<FileOpenCommand | null>(null);
  // Offer "Expand all" only right after "Collapse all"; otherwise collapse.
  const filesCollapsed = openCommand?.open === false;

  function toggleAllFiles(e: React.MouseEvent) {
    e.stopPropagation(); // the header itself toggles the group
    setOpen(true); // collapsing files should leave the file list visible
    setOpenCommand({ open: filesCollapsed });
  }
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
          <Button
            kind="ghost"
            size="sm"
            icon="ChevronsUpDown"
            aria-pressed={filesCollapsed}
            onClick={toggleAllFiles}
          >
            {filesCollapsed ? t("smartDiff.expandAll") : t("smartDiff.collapseAll")}
          </Button>
        </span>
      </div>
      {open && <div style={s.body}>{children(openCommand)}</div>}
    </div>
  );
}
