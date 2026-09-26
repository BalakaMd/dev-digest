/* CreateConventionSkillModal — turns the accepted conventions into skills.
   The server builds the drafts (one skill, or one per category); everything —
   name, description, type, enabled, and the markdown body — is editable here
   before saving. Every Create makes NEW skills. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Icon, Modal, Skeleton } from "@devdigest/ui";
import type { ConventionSkillDraft, ConventionSkillSplit } from "@devdigest/shared";
import { useConventionSkillDrafts, useCreateConventionSkills } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";
import { DraftFields } from "./_components/DraftFields";
import { isDraftValid, toCreateInput } from "./draft-model";
import { s } from "./styles";

const SPLITS: readonly ConventionSkillSplit[] = ["single", "category"];

export function CreateConventionSkillModal({
  repoId,
  repoName,
  acceptedCount,
  onClose,
}: {
  repoId: string;
  repoName: string;
  acceptedCount: number;
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const tCat = useTranslations("conventions.category");
  const router = useRouter();
  const toast = useToast();
  const [split, setSplit] = React.useState<ConventionSkillSplit>("single");
  const [active, setActive] = React.useState(0);
  // Edits are kept per split: switching back and forth never loses them, and
  // until the user types, the server draft is shown as-is.
  const [edits, setEdits] = React.useState<Partial<Record<ConventionSkillSplit, ConventionSkillDraft[]>>>({});
  const drafts = useConventionSkillDrafts(repoId, split, true);
  const create = useCreateConventionSkills(repoId);

  const current = edits[split] ?? drafts.data ?? [];
  const activeIndex = Math.min(active, Math.max(0, current.length - 1));
  const draft = current[activeIndex];
  const valid = current.length > 0 && current.every(isDraftValid);

  const updateDraft = (next: ConventionSkillDraft) =>
    setEdits({ ...edits, [split]: current.map((d, i) => (i === activeIndex ? next : d)) });

  const chooseSplit = (next: ConventionSkillSplit) => {
    setSplit(next);
    setActive(0);
  };

  const submit = async () => {
    try {
      const skills = await create.mutateAsync(toCreateInput(current));
      toast.success(t("modal.created", { count: skills.length }));
      onClose();
      router.push("/skills");
    } catch {
      // Surfaced by the global mutation-error toast (lib/providers.tsx).
    }
  };

  return (
    <Modal
      width={820}
      title={t("modal.title")}
      subtitle={draft?.name}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>
            <Icon.GitCommit size={13} />
            {t("modal.footer")}
          </span>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Sparkles"
            onClick={submit}
            disabled={!valid || create.isPending}
            loading={create.isPending}
          >
            {create.isPending
              ? t("modal.creating")
              : current.length > 1
                ? t("modal.createMany", { count: current.length })
                : t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.content}>
        <div style={s.banner}>
          <Icon.Wrench size={14} style={s.bannerIcon} />
          <span>
            {t.rich("modal.banner", {
              count: acceptedCount,
              repo: repoName,
              b: (chunks) => <strong>{chunks}</strong>,
              hl: (chunks) => <span style={s.repo}>{chunks}</span>,
            })}
          </span>
        </div>

        <div style={s.splitRow} role="radiogroup">
          {SPLITS.map((sp) => (
            <button
              key={sp}
              type="button"
              role="radio"
              aria-checked={split === sp}
              onClick={() => chooseSplit(sp)}
              style={s.splitBtn(split === sp)}
            >
              {sp === "single" ? t("modal.splitSingle") : t("modal.splitCategory")}
            </button>
          ))}
        </div>

        {current.length > 1 && (
          <div style={s.tabs} role="tablist">
            {current.map((d, i) => (
              <button
                key={`${d.category}-${i}`}
                type="button"
                role="tab"
                aria-selected={i === activeIndex}
                onClick={() => setActive(i)}
                style={s.tab(i === activeIndex, isDraftValid(d))}
              >
                {d.category ? tCat(d.category) : d.name}
                <span style={s.tabCount}>{d.convention_ids.length}</span>
              </button>
            ))}
          </div>
        )}

        {drafts.isLoading && !edits[split] ? (
          <div style={s.loading}>
            <Skeleton height={38} />
            <Skeleton height={38} />
            <Skeleton height={220} />
          </div>
        ) : drafts.isError && !edits[split] ? (
          <ErrorState body={t("modal.loadError")} onRetry={() => void drafts.refetch()} />
        ) : draft ? (
          <DraftFields key={`${split}-${activeIndex}`} draft={draft} onChange={updateDraft} />
        ) : null}
      </div>
    </Modal>
  );
}
