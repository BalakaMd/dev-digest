/* SkillsTab — every skill in the workspace, each with an enable toggle and its
   type label. Enabled skills are linked to this agent; their order in the list
   is the order of their blocks in the prompt (numbered #1, #2, …). A toggle
   never moves a row; only enabled rows can be dragged by the handle (or moved
   with ↑/↓). Each change saves the full ordered set immediately.

   The drag runs on pointer events, not HTML5 drag-and-drop: native DnD proved
   unreliable in Chrome and never fires for synthesised input, while a captured
   pointer works the same with a mouse, a pen, a finger, or an automated test. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Badge, EmptyState, ErrorState, Icon, Skeleton, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { SkillTypeBadge } from "../../../../../../../components/skill-type-badge";
import { useAgentSkills, useSetAgentSkills, useSkills } from "../../../../../../../lib/hooks/skills";
import {
  arrangeRows,
  buildRows,
  countActive,
  dropIndexAt,
  matchesName,
  moveRow,
  promptPositions,
  stepTarget,
  toSkillIds,
  toggleRow,
  type SkillRow,
} from "./skill-rows";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const all = useSkills();
  const linked = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills();

  // Optimistic rows while a save is in flight; the server copy otherwise,
  // laid out the way the user last saw it so a refetch never reshuffles rows.
  const [optimistic, setOptimistic] = React.useState<SkillRow[] | null>(null);
  const [layout, setLayout] = React.useState<string[] | null>(null);
  const inFlight = React.useRef(0);
  const [query, setQuery] = React.useState("");
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const [dragOver, setDragOver] = React.useState<number | null>(null);
  // The drag origin also lives in a ref: pointer events arrive faster than
  // React re-renders, so handlers must not read it from a stale closure.
  const dragRef = React.useRef<number | null>(null);
  const rowEls = React.useRef(new Map<string, HTMLDivElement>());

  const rows =
    optimistic ?? (all.data && linked.data ? arrangeRows(buildRows(all.data, linked.data), layout) : []);

  const persist = (next: SkillRow[]) => {
    setOptimistic(next);
    setLayout(next.map((r) => r.id));
    inFlight.current += 1;
    setSkills.mutate(
      { agentId: agent.id, skillIds: toSkillIds(next) },
      {
        onSettled: () => {
          inFlight.current -= 1;
          if (inFlight.current === 0) setOptimistic(null);
        },
      },
    );
  };

  // Reordering while a filter hides rows would move a skill past hidden
  // neighbours, so drag and ↑/↓ are only offered on the unfiltered list.
  const reorderable = query.trim().length === 0;
  const positions = promptPositions(rows);

  const endDrag = () => {
    dragRef.current = null;
    setDragFrom(null);
    setDragOver(null);
  };

  /** The row a pointer at `y` would drop onto. */
  const targetAt = (y: number) =>
    dropIndexAt(
      rows.map((r) => rowEls.current.get(r.id)?.getBoundingClientRect().top ?? 0),
      y,
    );

  if (all.isError || linked.isError) {
    return (
      <ErrorState
        body={t("skills.loadError")}
        onRetry={() => {
          void all.refetch();
          void linked.refetch();
        }}
      />
    );
  }
  if (all.isLoading || linked.isLoading) {
    return (
      <div style={s.list}>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="Sparkles"
        title={t("skills.emptyTitle")}
        body={t("skills.emptyBody")}
        cta={t("skills.emptyCta")}
        onCta={() => router.push("/skills")}
      />
    );
  }

  const visible = rows.filter((r) => matchesName(r, query));

  return (
    <div>
      <div style={s.header}>
        <h2 style={s.title}>{t("skills.title")}</h2>
        <Badge color="var(--accent)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { linked: countActive(rows), total: rows.length })}
        </Badge>
        <div style={s.search}>
          <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      {visible.length === 0 && <p style={s.hint}>{t("skills.noMatch", { query })}</p>}
      <div style={s.list}>
        {visible.map((row) => {
          const index = rows.indexOf(row);
          const draggable = reorderable && row.enabled;
          const position = positions.get(row.id);
          const up = stepTarget(rows, index, -1);
          const down = stepTarget(rows, index, 1);
          return (
            <div
              key={row.id}
              ref={(el) => {
                if (el) rowEls.current.set(row.id, el);
                else rowEls.current.delete(row.id);
              }}
              data-testid={`skill-row-${row.name}`}
              data-enabled={row.enabled}
              data-draggable={draggable}
              style={s.row(row.enabled, dragOver === index && dragFrom !== index, dragFrom === index)}
            >
              <span
                data-testid={`skill-handle-${row.name}`}
                style={s.handle(draggable, dragFrom === index)}
                aria-label={draggable ? t("skills.dragHandle", { name: row.name }) : undefined}
                aria-hidden={!draggable}
                onPointerDown={(e) => {
                  if (!draggable || e.button !== 0) return;
                  // No text selection, no native drag of the icon.
                  e.preventDefault();
                  // Keep receiving moves and the release even off the handle.
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  dragRef.current = index;
                  setDragFrom(index);
                  setDragOver(index);
                }}
                onPointerMove={(e) => {
                  if (dragRef.current === null) return;
                  setDragOver(targetAt(e.clientY));
                }}
                onPointerUp={(e) => {
                  const from = dragRef.current;
                  if (from === null) return;
                  const to = targetAt(e.clientY);
                  endDrag();
                  if (to !== from) persist(moveRow(rows, from, to));
                }}
                onPointerCancel={endDrag}
                onLostPointerCapture={() => {
                  if (dragRef.current !== null) endDrag();
                }}
              >
                <Icon.Menu size={14} />
              </span>
              <span
                style={s.position}
                title={position ? t("skills.positionTitle", { n: position }) : undefined}
                aria-hidden={!position}
              >
                {position ? t("skills.position", { n: position }) : ""}
              </span>
              <Toggle on={row.enabled} onChange={(on) => persist(toggleRow(rows, row.id, on))} size={14} />
              <span className="mono" style={s.name(row.enabled && !row.globallyEnabled)} title={row.description}>
                {row.name}
              </span>
              {row.enabled && !row.globallyEnabled && (
                <span style={s.globalOff}>{t("skills.disabledGlobally")}</span>
              )}
              <SkillTypeBadge type={row.type} />
              {draggable && (
                <span style={s.orderBtns}>
                  <button
                    type="button"
                    onClick={() => up !== null && persist(moveRow(rows, index, up))}
                    disabled={up === null}
                    aria-label={t("skills.moveUp", { name: row.name })}
                    title={t("skills.moveUp", { name: row.name })}
                    style={s.iconButton(up === null)}
                  >
                    <Icon.ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => down !== null && persist(moveRow(rows, index, down))}
                    disabled={down === null}
                    aria-label={t("skills.moveDown", { name: row.name })}
                    title={t("skills.moveDown", { name: row.name })}
                    style={s.iconButton(down === null)}
                  >
                    <Icon.ArrowDown size={13} />
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
