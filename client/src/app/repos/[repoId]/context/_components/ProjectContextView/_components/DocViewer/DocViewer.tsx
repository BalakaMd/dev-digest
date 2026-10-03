/* DocViewer — right panel: file name, Preview/Edit toggle (Edit only for local
   documents — repository documents are read-only, AC-67), "Used by N agents",
   Coverage ring and the rendered document or the editor. Mounted with a key of
   `source:path`, so the mode resets when another document is selected. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { ContextDocEntry } from "@devdigest/shared";
import { ContextDocPreview } from "@/components/context-doc-preview";
import { useContextDocUsage } from "@/lib/hooks/context-docs";
import { fileName } from "../../doc-groups";
import { CoverageRing } from "../CoverageRing";
import { DocEditor } from "../DocEditor";

const seg = (active: boolean, disabled?: boolean): React.CSSProperties => ({
  padding: "4px 12px",
  fontSize: 12.5,
  fontWeight: 600,
  borderRadius: 5,
  border: "none",
  background: active ? "var(--bg-hover)" : "transparent",
  color: active ? "var(--text-primary)" : "var(--text-muted)",
  opacity: disabled ? 0.55 : 1,
  cursor: disabled ? "not-allowed" : "pointer",
});

export interface DocViewerProps {
  repoId: string;
  doc: ContextDocEntry;
  /** Runs `leave` at once, or after the unsaved-changes prompt when dirty. */
  guard: (leave: () => void) => void;
  onDirtyChange: (dirty: boolean) => void;
  onDelete: (doc: ContextDocEntry) => void;
  onSaved: () => void;
  onConflict: () => void;
}

export function DocViewer({ repoId, doc, guard, onDirtyChange, onDelete, onSaved, onConflict }: DocViewerProps) {
  const t = useTranslations("projectContext");
  const usage = useContextDocUsage(repoId, doc.path);
  const [editing, setEditing] = React.useState(false);
  const isLocal = doc.source === "local";
  const hintId = React.useId();

  return (
    <>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 22px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <h1 className="mono" style={{ fontSize: 14, fontWeight: 600, overflowWrap: "anywhere" }} title={doc.path}>
          {fileName(doc.path)}
        </h1>
        <div
          role="group"
          aria-label={t("viewer.modeLabel")}
          style={{ display: "inline-flex", padding: 2, borderRadius: 7, border: "1px solid var(--border)" }}
        >
          <button
            type="button"
            style={seg(!editing)}
            aria-pressed={!editing}
            onClick={() => editing && guard(() => setEditing(false))}
          >
            {t("viewer.preview")}
          </button>
          <button
            type="button"
            style={seg(editing, !isLocal)}
            aria-pressed={editing}
            disabled={!isLocal}
            aria-describedby={isLocal ? undefined : hintId}
            title={isLocal ? undefined : t("viewer.editUnavailable")}
            onClick={() => setEditing(true)}
          >
            {t("viewer.edit")}
          </button>
        </div>
        {!isLocal && (
          <span id={hintId} style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {t("viewer.editUnavailable")}
          </span>
        )}
        {isLocal && !editing && (
          <Button kind="ghost" size="sm" icon="Trash" onClick={() => onDelete(doc)}>
            {t("viewer.delete")}
          </Button>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-secondary)" }}>
            <Icon.Cpu size={14} />
            {usage.data
              ? t("viewer.usedBy", { count: usage.data.used_by_agents })
              : usage.isError
                ? t("viewer.usageError")
                : t("viewer.usageLoading")}
          </span>
          {usage.data && <CoverageRing pct={usage.data.coverage_pct} />}
        </div>
      </header>
      {editing ? (
        <DocEditor
          repoId={repoId}
          folder={doc.folder}
          name={fileName(doc.path)}
          existing
          onSaved={() => {
            setEditing(false);
            onSaved();
          }}
          onCancel={() => guard(() => setEditing(false))}
          onDirtyChange={onDirtyChange}
          onConflict={onConflict}
        />
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "22px 28px" }}>
          <ContextDocPreview repoId={repoId} path={doc.path} source={doc.source} />
        </div>
      )}
    </>
  );
}
