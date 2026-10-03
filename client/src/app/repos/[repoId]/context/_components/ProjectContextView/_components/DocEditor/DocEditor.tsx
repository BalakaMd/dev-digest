/* DocEditor — markdown source editor for a local document (AC-66, AC-68,
   AC-85). `existing` loads the stored content and saves with its version as
   `base_version`; a draft (new file) starts empty and creates on first Save
   without one. Reports dirtiness upward for the unsaved-changes guard. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { ContextDocContent } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useContextDocContent, useSaveLocalDoc } from "@/lib/hooks/context-docs";
import { ConflictNotice } from "../ConflictNotice";

export interface DocEditorProps {
  repoId: string;
  /** Repo-relative folder ("" = root) and file name of the target. */
  folder: string;
  name: string;
  /** true: edit the stored local document; false: unsaved draft of a new one. */
  existing: boolean;
  onSaved: (saved: ContextDocContent) => void;
  /** Cancel / leave — the owner decides whether to ask first. */
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onConflict?: () => void;
}

interface Newer {
  content: string;
  version: string;
}

function newerFrom(err: unknown): Newer | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const d = err.details as { current_content?: unknown; current_version?: unknown } | undefined;
  if (typeof d?.current_content !== "string" || typeof d.current_version !== "string") return null;
  return { content: d.current_content, version: d.current_version };
}

export function DocEditor(props: DocEditorProps) {
  const t = useTranslations("projectContext.editor");
  const stored = useContextDocContent(props.repoId, props.existing ? joinPath(props.folder, props.name) : null, "local");
  if (props.existing) {
    if (stored.isLoading) return <div style={{ padding: 22 }} aria-busy="true" aria-label={t("loading")}><Skeleton height={160} /></div>;
    if (!stored.data) return <ErrorState body={t("loadError")} onRetry={() => void stored.refetch()} />;
    return <EditorForm {...props} initial={stored.data.content} initialVersion={stored.data.version} />;
  }
  return <EditorForm {...props} initial="" initialVersion={undefined} />;
}

function joinPath(folder: string, name: string) {
  return folder ? `${folder}/${name}` : name;
}

function EditorForm({
  repoId,
  folder,
  name,
  existing,
  initial,
  initialVersion,
  onSaved,
  onCancel,
  onDirtyChange,
  onConflict,
}: DocEditorProps & { initial: string; initialVersion: string | undefined }) {
  const t = useTranslations("projectContext.editor");
  const save = useSaveLocalDoc(repoId);
  const [text, setText] = React.useState(initial);
  const [baseVersion, setBaseVersion] = React.useState(initialVersion);
  const [newer, setNewer] = React.useState<Newer | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // The owner's unsaved-changes flag is pushed from the event handlers; only the
  // unmount (save, discard, switching documents) clears it here.
  const clearDirty = React.useRef(onDirtyChange);
  clearDirty.current = onDirtyChange;
  React.useEffect(() => () => clearDirty.current(false), []);

  const edit = (next: string) => {
    setText(next);
    onDirtyChange(next !== initial);
  };
  const submit = () => {
    setError(null);
    save.mutate(
      { folder, name, content: text, ...(existing && baseVersion ? { base_version: baseVersion } : {}) },
      {
        onSuccess: (saved) => {
          onDirtyChange(false);
          onSaved(saved);
        },
        onError: (err) => {
          const n = newerFrom(err);
          if (n) {
            setNewer(n);
            onConflict?.();
          } else setError(err instanceof Error ? err.message : t("saveError"));
        },
      },
    );
  };

  const take = (content: string | null) => {
    if (!newer) return;
    setBaseVersion(newer.version);
    if (content !== null) edit(content);
    setNewer(null);
  };

  const label = existing ? t("label", { name }) : t("draftLabel", { name });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 22px", flex: 1, minHeight: 0 }}>
      {!existing && <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-muted)" }}>{t("newDraftHint", { folder: folder || "/" })}</p>}
      {newer && <ConflictNotice content={newer.content} onUseNewer={() => take(newer.content)} onKeepMine={() => take(null)} />}
      <textarea
        aria-label={label}
        className="mono"
        value={text}
        spellCheck={false}
        onChange={(e) => edit(e.target.value)}
        style={{
          flex: 1,
          minHeight: 260,
          width: "100%",
          resize: "none",
          padding: "10px 12px",
          borderRadius: 7,
          border: "1px solid var(--border-strong)",
          background: "var(--bg-elevated)",
          color: "var(--text-primary)",
          fontSize: 13,
          lineHeight: 1.55,
        }}
      />
      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--crit)" }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <Button kind="primary" icon="Check" onClick={submit} loading={save.isPending} disabled={save.isPending}>
          {save.isPending ? t("saving") : t("save")}
        </Button>
        <Button kind="ghost" onClick={onCancel} disabled={save.isPending}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
