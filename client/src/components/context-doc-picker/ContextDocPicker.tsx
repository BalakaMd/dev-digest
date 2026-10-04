/* ContextDocPicker — attach project documents (specs / docs / insights) to an
   agent or a skill. Every effective document of the repository is a row with a
   checkbox; attached rows can be reordered (the order is the prompt order) by
   the handle or with ↑/↓ on the focused handle. Each change saves the full
   ordered list; a failed save restores the last saved list.

   The drag runs on pointer events, not HTML5 drag-and-drop (see client
   INSIGHTS 2026-09-24): a captured pointer works with mouse, touch and tests. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { useContextDocs } from "../../lib/hooks/context-docs";
import { ContextDocPreviewDrawer } from "../context-doc-preview";
import { ContextDocRow } from "./ContextDocRow";
import { simulateBudget } from "./budget";
import {
  arrangeRows,
  attachedPaths,
  buildRows,
  countAttached,
  countRows,
  dropIndexAt,
  injectedRows,
  matchesPath,
  move,
  stepTarget,
  toggle,
  type DocRow,
  type InheritedDoc,
} from "./context-doc-rows";
import { s } from "./styles";

export interface ContextDocPickerProps {
  /** Active repository; null renders the "no repository" state. */
  repoId: string | null;
  title: string;
  /** Attached paths, in prompt order. */
  attached: string[];
  /** Documents the owner inherits (an agent's skills); shown after the attached ones. */
  inherited?: InheritedDoc[];
  /** Persist the full ordered list. A rejection restores the last saved list. */
  onSave: (paths: string[]) => Promise<unknown>;
  saving?: boolean;
  counterMode?: "of" | "only";
  /** Replaces the default order hint. */
  hint?: React.ReactNode;
  /** Rendered under the token footer. */
  footer?: React.ReactNode;
}

export function ContextDocPicker({
  repoId,
  title,
  attached,
  inherited,
  onSave,
  saving = false,
  counterMode = "of",
  hint,
  footer,
}: ContextDocPickerProps) {
  const t = useTranslations("contextDocs");
  const list = useContextDocs(repoId);

  // Layout the user last saw, optimistic attached paths while saving, and the
  // last layout that reached the server (restored when a save fails).
  const [order, setOrder] = React.useState<string[] | null>(null);
  const [pending, setPending] = React.useState<string[] | null>(null);
  const lastSavedOrder = React.useRef<string[] | null>(null);
  const inFlight = React.useRef(0);
  const [status, setStatus] = React.useState<"idle" | "saved" | "error">("idle");
  const [announce, setAnnounce] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [previewRow, setPreviewRow] = React.useState<DocRow | null>(null);
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const [dragOver, setDragOver] = React.useState<number | null>(null);
  const dragRef = React.useRef<number | null>(null);
  const rowEls = React.useRef(new Map<string, HTMLDivElement>());
  const handleEls = React.useRef(new Map<string, HTMLSpanElement>());
  const focusPath = React.useRef<string | null>(null);

  // Keep keyboard focus on the handle that just moved a row.
  React.useEffect(() => {
    if (focusPath.current) handleEls.current.get(focusPath.current)?.focus();
    focusPath.current = null;
  });

  const docs = list.data?.docs;
  const rows = React.useMemo(
    () => (docs ? arrangeRows(buildRows({ docs, attached: pending ?? attached, inherited }), order) : []),
    [docs, pending, attached, inherited, order],
  );

  const persist = (next: DocRow[]) => {
    const paths = attachedPaths(next);
    setOrder(next.map((r) => r.path));
    setPending(paths);
    setStatus("idle");
    inFlight.current += 1;
    onSave(paths)
      .then(() => {
        lastSavedOrder.current = next.map((r) => r.path);
        setStatus("saved");
      })
      .catch(() => {
        setOrder(lastSavedOrder.current);
        setStatus("error");
      })
      .finally(() => {
        inFlight.current -= 1;
        if (inFlight.current === 0) setPending(null);
      });
  };

  if (!repoId) {
    return (
      <EmptyState
        icon="Folder"
        title={t("picker.noRepoTitle")}
        body={
          <>
            {t("picker.noRepoBody")} <Link href="/onboarding">{t("picker.noRepoCta")}</Link>
          </>
        }
      />
    );
  }
  if (list.isError) {
    return <ErrorState body={t("picker.loadError")} onRetry={() => void list.refetch()} />;
  }
  if (list.isLoading || !list.data) {
    return (
      <div style={s.list} aria-busy="true">
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }
  const data = list.data;
  if (data.state === "not_cloned") {
    return <EmptyState icon="Folder" title={t("picker.notClonedTitle")} body={t("picker.notClonedBody")} />;
  }
  if (rows.length === 0) {
    const globs = data.search_globs.join(", ");
    return (
      <EmptyState
        icon="FileText"
        title={t("picker.emptyTitle")}
        body={globs ? t("picker.emptyBody", { globs }) : t("picker.emptyNoGlobs")}
      />
    );
  }

  const attachedCount = countAttached(rows);
  const { max_attachments: maxAttachments, max_doc_bytes: maxBytes, token_budget: budgetLimit } = data.limits;
  const cappedAt = attachedCount >= maxAttachments ? maxAttachments : null;
  const reorderable = query.trim().length === 0;
  const visible = rows.filter((r) => matchesPath(r, query));
  const budget = simulateBudget(
    injectedRows(rows).map((r) => ({ path: r.path, tokens: r.tokens ?? 0 })),
    budgetLimit,
  );

  const overBudget = budget.skipped.length > 0;

  const endDrag = () => {
    dragRef.current = null;
    setDragFrom(null);
    setDragOver(null);
  };
  const targetAt = (y: number) =>
    dropIndexAt(
      rows.map((r) => rowEls.current.get(r.path)?.getBoundingClientRect().top ?? 0),
      y,
    );
  const moveTo = (from: number, to: number) => {
    if (to === from) return;
    const next = move(rows, from, to);
    if (next === rows) return;
    setAnnounce(t("picker.movedTo", { path: rows[from]!.path, n: attachedPaths(next).indexOf(rows[from]!.path) + 1 }));
    persist(next);
  };

  return (
    <div>
      <div style={s.header}>
        <h2 style={s.title}>{title}</h2>
        <Badge color="var(--accent)" bg="var(--accent-bg)">
          {counterMode === "of"
            ? t("picker.attachedOf", { attached: attachedCount, total: countRows(rows) })
            : t("picker.attachedOnly", { attached: attachedCount })}
        </Badge>
        <div style={s.search}>
          <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("picker.filterPlaceholder")}
            aria-label={t("picker.filterPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>
      <p style={s.hint}>{hint ?? t("picker.orderHint")}</p>
      {data.truncated && <p style={s.notice}>{t("picker.truncated")}</p>}
      {!reorderable && <p style={s.notice}>{t("picker.reorderOff")}</p>}
      {visible.length === 0 && <p style={s.notice}>{t("picker.noMatch", { query })}</p>}

      <div style={s.list}>
        {visible.map((row) => {
          const index = rows.indexOf(row);
          const active = reorderable && row.attached;
          return (
            <ContextDocRow
              key={row.path}
              row={row}
              maxKb={Math.round(maxBytes / 1024)}
              cappedAt={cappedAt}
              dropTarget={dragOver === index && dragFrom !== index}
              dragging={dragFrom === index}
              rowRef={(el) => {
                if (el) rowEls.current.set(row.path, el);
                else rowEls.current.delete(row.path);
              }}
              onToggle={(on) => persist(toggle(rows, row.path, on))}
              onPreview={() => setPreviewRow(row)}
              handle={{
                active,
                grabbing: dragFrom === index,
                refCallback: (el) => {
                  if (el) handleEls.current.set(row.path, el);
                  else handleEls.current.delete(row.path);
                },
                onPointerDown: (e) => {
                  if (!active || e.button !== 0) return;
                  e.preventDefault();
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  dragRef.current = index;
                  setDragFrom(index);
                  setDragOver(index);
                },
                onPointerMove: (e) => {
                  if (dragRef.current !== null) setDragOver(targetAt(e.clientY));
                },
                onPointerUp: (e) => {
                  const from = dragRef.current;
                  if (from === null) return;
                  const to = targetAt(e.clientY);
                  endDrag();
                  moveTo(from, to);
                },
                onPointerCancel: endDrag,
                onLostPointerCapture: () => {
                  if (dragRef.current !== null) endDrag();
                },
                onKeyDown: (e) => {
                  if (!active || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
                  e.preventDefault();
                  const target = stepTarget(rows, index, e.key === "ArrowUp" ? -1 : 1);
                  if (target === null) return;
                  focusPath.current = row.path;
                  moveTo(index, target);
                },
              }}
            />
          );
        })}
      </div>

      {budget.skipped.length > 0 && (
        <p style={s.warn}>
          {t("picker.budgetSkipped", { limit: budgetLimit, paths: budget.skipped.join(", ") })}
        </p>
      )}
      {status === "error" && (
        <p role="alert" style={s.alert}>
          {t("picker.saveFailed")}
        </p>
      )}
      <div style={s.footer}>
        <span className="mono tnum" style={s.total}>
          {t("picker.budgetTotal", { count: budget.total })}
        </span>
        <span className="mono tnum">{t("picker.budgetOf", { limit: budgetLimit })}</span>
        <div
          role="progressbar"
          aria-label={t("picker.budgetBar")}
          aria-valuemin={0}
          aria-valuemax={budgetLimit}
          aria-valuenow={Math.min(budget.total, budgetLimit)}
          aria-valuetext={`${t("picker.budgetTotal", { count: budget.total })} ${t("picker.budgetOf", { limit: budgetLimit })}`}
          data-over-budget={overBudget}
          style={s.barTrack}
        >
          <div style={s.barFill(Math.min(100, (budget.total / Math.max(1, budgetLimit)) * 100), overBudget)} />
        </div>
        <span style={s.spacer}>{t("picker.budgetLine")}</span>
      </div>
      {footer}
      <div aria-live="polite" style={s.live}>
        {saving || inFlight.current > 0 ? t("picker.saving") : status === "saved" ? t("picker.saved") : announce}
      </div>

      {previewRow && (
        <ContextDocPreviewDrawer
          repoId={repoId}
          path={previewRow.path}
          source={previewRow.local ? "local" : "repo"}
          onClose={() => setPreviewRow(null)}
        />
      )}
    </div>
  );
}
