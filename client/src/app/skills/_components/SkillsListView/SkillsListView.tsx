/* /skills — the Skills grid. Cards (name, type, description, enable toggle,
   version, agent count, delete); clicking one opens a read-only preview in a
   side drawer, from which the full editor at /skills/:id is one click away.
   "Add" offers Create (modal) or Import (.md / .zip, preview before save). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { SkillSummary } from "@devdigest/shared";
import { AppShell } from "../../../../components/app-shell";
import { ConfirmDialog } from "../../../../components/confirm-dialog";
import { useDeleteSkill, useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";
import { matchesSkillQuery } from "../../skill-model";
import { SkillCard } from "./_components/SkillCard";
import { SkillPreviewDrawer } from "./_components/SkillPreviewDrawer";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { ImportSkillModal } from "./_components/ImportSkillModal";
import { s } from "./styles";

type Dialog = { kind: "create" } | { kind: "import" } | { kind: "delete"; skill: SkillSummary } | null;

export function SkillsListView() {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const [search, setSearch] = React.useState("");
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<Dialog>(null);

  const all = skills ?? [];
  const list = all.filter((sk) => matchesSkillQuery(sk, search));
  // Read the previewed skill from the live list so a toggle shows up in the drawer.
  const previewed = all.find((sk) => sk.id === previewId) ?? null;

  const confirmDelete = async (skill: SkillSummary) => {
    try {
      await del.mutateAsync(skill.id);
      toast.success(t("delete.deleted"));
      if (previewId === skill.id) setPreviewId(null);
      setDialog(null);
    } catch {
      // Surfaced by the global mutation-error toast (lib/providers.tsx).
    }
  };

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {dialog?.kind === "create" && <CreateSkillModal onClose={() => setDialog(null)} />}
      {dialog?.kind === "import" && <ImportSkillModal onClose={() => setDialog(null)} />}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={t("delete.title")}
          body={t("delete.body", { name: dialog.skill.name })}
          confirmLabel={t("delete.confirm")}
          pending={del.isPending}
          onConfirm={() => void confirmDelete(dialog.skill)}
          onCancel={() => setDialog(null)}
        />
      )}
      {previewed && <SkillPreviewDrawer skill={previewed} onClose={() => setPreviewId(null)} />}

      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.heading")}</h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("page.searchPlaceholder")}
              aria-label={t("page.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
          <Dropdown
            width={250}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.menu.create"), icon: "Edit", onClick: () => setDialog({ kind: "create" }) },
              { label: t("page.menu.import"), icon: "Upload", onClick: () => setDialog({ kind: "import" }) },
            ]}
          />
        </div>

        {isLoading && (
          <div style={s.grid}>
            <Skeleton height={120} />
            <Skeleton height={120} />
            <Skeleton height={120} />
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => void refetch()} />}
        {!isLoading && !isError && all.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => setDialog({ kind: "create" })}
          />
        )}
        {all.length > 0 && list.length === 0 && <p style={s.noMatch}>{t("page.noMatch", { query: search })}</p>}
        {list.length > 0 && (
          <div style={s.grid}>
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === previewId}
                onOpen={() => setPreviewId(sk.id)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                onDelete={() => setDialog({ kind: "delete", skill: sk })}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
