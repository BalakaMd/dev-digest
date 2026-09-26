/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  cs,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { partitionAnnotations, type FileAnnotations } from "../annotations";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** Annotation node(s) anchored to a given parsed line (RIGHT=new, LEFT=old). */
function annotationForLine(ln: Line, anchored: Map<string, React.ReactNode>): React.ReactNode {
  if (anchored.size === 0) return undefined;
  const nodes: React.ReactNode[] = [];
  for (const key of keysForLine(ln)) {
    const node = anchored.get(key);
    if (node !== undefined) nodes.push(<React.Fragment key={key}>{node}</React.Fragment>);
  }
  return nodes.length > 0 ? nodes : undefined;
}

/** The line decoration (if any) for a given parsed line — first match wins;
    a line hosts at most one bar/label pair regardless of how many findings
    anchor to it. */
function decorForLine(
  ln: Line,
  lineDecor: ReadonlyMap<string, { color: string; label: React.ReactNode }> | undefined,
): { color: string; label: React.ReactNode } | undefined {
  if (!lineDecor) return undefined;
  for (const key of keysForLine(ln)) {
    const decor = lineDecor.get(key);
    if (decor) return decor;
  }
  return undefined;
}

/** A caller's "open/close every file" request. A new object is a new request,
    so issuing the same `open` twice still re-applies it after manual toggles. */
export interface FileOpenCommand {
  open: boolean;
}

export function FileCard({
  file,
  commenting,
  annotations,
  openCommand,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  annotations?: FileAnnotations;
  openCommand?: FileOpenCommand | null;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    openCommand?.open ?? (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  // Apply a new command during render (no effect); the user can still toggle
  // the file by hand until the next command arrives.
  const [appliedCommand, setAppliedCommand] = React.useState(openCommand);
  if (openCommand !== appliedCommand) {
    setAppliedCommand(openCommand);
    if (openCommand) setOpen(openCommand.open);
  }
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Keys every rendered line can host a thread/annotation on, shared by both.
  const renderedKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) keys.add(k);
    return keys;
  }, [lines]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, renderedKeys]);

  // Same split for caller-supplied annotations (e.g. Smart Diff findings).
  const { anchored, unanchoredKeys } = React.useMemo(() => {
    if (!annotations)
      return { anchored: new Map<string, React.ReactNode>(), unanchoredKeys: [] as string[] };
    return partitionAnnotations(annotations.byKey, renderedKeys);
  }, [annotations, renderedKeys]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        {annotations?.marker}
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                annotation={annotationForLine(ln, anchored)}
                decor={decorForLine(ln, annotations?.lineDecor)}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {annotations && unanchoredKeys.length > 0 && (
            <div style={cs.outdatedWrap}>
              <span style={cs.outdatedTitle}>{annotations.unanchoredTitle}</span>
              {unanchoredKeys.map((key) => (
                <React.Fragment key={key}>{annotations.byKey.get(key)}</React.Fragment>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
