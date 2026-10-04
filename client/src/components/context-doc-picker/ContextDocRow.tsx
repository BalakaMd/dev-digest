/* ContextDocRow — one document row of the picker: handle, checkbox, name,
   folder, badges, tokens and the Preview button. Presentational; the picker
   owns selection, order and drag state. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { ContextDocType } from "@devdigest/shared";
import type { DocRow } from "./context-doc-rows";
import { s } from "./styles";

const TYPE_COLORS: Record<ContextDocType, string> = {
  specs: "var(--accent)",
  docs: "var(--ok)",
  insights: "var(--warn)",
};

export interface RowHandleProps {
  active: boolean;
  grabbing: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLSpanElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLSpanElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLSpanElement>) => void;
  onPointerCancel: () => void;
  onLostPointerCapture: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLSpanElement>) => void;
  refCallback: (el: HTMLSpanElement | null) => void;
}

export interface ContextDocRowProps {
  row: DocRow;
  maxKb: number;
  /** The attachment cap when it is reached (the checkbox cannot be turned on), else null. */
  cappedAt: number | null;
  dropTarget: boolean;
  dragging: boolean;
  handle: RowHandleProps;
  rowRef: (el: HTMLDivElement | null) => void;
  onToggle: (attached: boolean) => void;
  onPreview: () => void;
}

export function ContextDocRow({
  row,
  maxKb,
  cappedAt,
  dropTarget,
  dragging,
  handle,
  rowRef,
  onToggle,
  onPreview,
}: ContextDocRowProps) {
  const t = useTranslations("contextDocs");
  // Inherited documents are read-only here: they come from a skill (AC-46).
  const inherited = !row.attached && row.via !== null;
  const blocked = inherited || (!row.attached && (row.tooLarge || cappedAt !== null));
  return (
    <div
      ref={rowRef}
      data-testid={`context-row-${row.path}`}
      data-attached={row.attached}
      style={s.row(row.attached, dropTarget, dragging)}
    >
      <span
        role={handle.active ? "button" : undefined}
        tabIndex={handle.active ? 0 : undefined}
        ref={handle.refCallback}
        data-testid={`context-handle-${row.path}`}
        aria-label={handle.active ? t("picker.dragHandle", { path: row.path }) : undefined}
        aria-hidden={!handle.active}
        style={s.handle(handle.active, handle.grabbing)}
        onPointerDown={handle.onPointerDown}
        onPointerMove={handle.onPointerMove}
        onPointerUp={handle.onPointerUp}
        onPointerCancel={handle.onPointerCancel}
        onLostPointerCapture={handle.onLostPointerCapture}
        onKeyDown={handle.onKeyDown}
      >
        <Icon.Menu size={14} />
      </span>
      <input
        type="checkbox"
        checked={row.attached}
        disabled={blocked}
        onChange={(e) => onToggle(e.target.checked)}
        aria-label={row.path}
        title={
          inherited
            ? t("picker.via", { skill: row.via })
            : row.tooLarge && !row.attached
            ? t("picker.tooLargeTitle", { kb: maxKb })
            : cappedAt !== null && !row.attached
              ? t("picker.limitReached", { max: cappedAt })
              : undefined
        }
        style={s.checkbox}
      />
      <span className="mono" style={s.name} title={row.path}>
        {row.name}
      </span>
      {row.folder && (
        <span className="mono" style={s.folder}>
          {row.folder}
        </span>
      )}
      {row.via && <span style={s.folder}>{t("picker.via", { skill: row.via })}</span>}
      <span style={s.spacer} />
      {row.tooLarge && (
        <span style={s.badge("var(--warn)")} title={t("picker.tooLargeTitle", { kb: maxKb })}>
          {t("picker.tooLarge")}
        </span>
      )}
      {row.missing && (
        <span style={s.badge("var(--crit)")} title={t("picker.missingTitle")}>
          {t("picker.missing")}
        </span>
      )}
      {row.local && <span style={s.badge("var(--text-secondary)")}>{t("picker.local")}</span>}
      {row.overridesRepo && (
        <span style={s.badge("var(--accent)")} title={t("picker.overridesRepoTitle")}>
          {t("picker.overridesRepo")}
        </span>
      )}
      {row.type && (
        <span className="mono" style={s.badge(TYPE_COLORS[row.type])}>
          {row.type}
        </span>
      )}
      {row.tokens !== null && (
        <span className="mono tnum" style={s.tokens}>
          {t("picker.tokens", { count: row.tokens })}
        </span>
      )}
      {!row.missing && (
        <button
          type="button"
          onClick={onPreview}
          aria-label={t("picker.previewLabel", { path: row.path })}
          style={s.previewBtn}
        >
          <Icon.Eye size={13} />
          {t("picker.preview")}
        </button>
      )}
    </div>
  );
}
