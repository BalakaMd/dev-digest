/* SkillsTab — every skill in the workspace, each with an enable toggle and its
   type label. Enabled skills are linked to this agent and come first, in the
   order their blocks appear in the prompt; only they can be dragged (or moved
   with ↑/↓) to reorder. Each change saves the full ordered set immediately. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Badge, EmptyState, ErrorState, Icon, Skeleton, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { SkillTypeBadge } from "../../../../../../../components/skill-type-badge";
import { useAgentSkills, useSetAgentSkills, useSkills } from "../../../../../../../lib/hooks/skills";
import { buildRows, countActive, matchesName, moveRow, toSkillIds, toggleRow, type SkillRow } from "./skill-rows";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const all = useSkills();
  const linked = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills();

  // Optimistic rows while a save is in flight; the server copy otherwise.
  const [optimistic, setOptimistic] = React.useState<SkillRow[] | null>(null);
  const inFlight = React.useRef(0);
  const [query, setQuery] = React.useState("");
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const [dragOver, setDragOver] = React.useState<number | null>(null);

  const rows = optimistic ?? (all.data && linked.data ? buildRows(all.data, linked.data) : []);

  const persist = (next: SkillRow[]) => {
    setOptimistic(next);
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
  const enabledCount = rows.filter((r) => r.enabled).length;

  const endDrag = () => {
    setDragFrom(null);
    setDragOver(null);
  };

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
          return (
            <div
              key={row.id}
              data-testid={`skill-row-${row.name}`}
              data-enabled={row.enabled}
              draggable={draggable}
              onDragStart={(e) => {
                if (!draggable) return;
                e.dataTransfer.effectAllowed = "move";
                // Firefox refuses to start a drag without some payload.
                e.dataTransfer.setData("text/plain", row.id);
                setDragFrom(index);
              }}
              onDragOver={(e) => {
                if (dragFrom === null || !row.enabled) return;
                e.preventDefault();
                setDragOver(index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null && row.enabled && dragFrom !== index) persist(moveRow(rows, dragFrom, index));
                endDrag();
              }}
              onDragEnd={endDrag}
              style={s.row(row.enabled, dragOver === index && dragFrom !== index)}
            >
              <span
                style={s.handle(draggable)}
                aria-label={draggable ? t("skills.dragHandle", { name: row.name }) : undefined}
                aria-hidden={!draggable}
              >
                <Icon.Menu size={14} />
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
                    onClick={() => persist(moveRow(rows, index, index - 1))}
                    disabled={index === 0}
                    aria-label={t("skills.moveUp", { name: row.name })}
                    title={t("skills.moveUp", { name: row.name })}
                    style={s.iconButton(index === 0)}
                  >
                    <Icon.ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => persist(moveRow(rows, index, index + 1))}
                    disabled={index === enabledCount - 1}
                    aria-label={t("skills.moveDown", { name: row.name })}
                    title={t("skills.moveDown", { name: row.name })}
                    style={s.iconButton(index === enabledCount - 1)}
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
