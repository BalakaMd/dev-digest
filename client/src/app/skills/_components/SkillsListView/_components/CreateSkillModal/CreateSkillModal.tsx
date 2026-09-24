/* CreateSkillModal — "Add → Create": name, directive description, type and a
   markdown body. Creates the skill at version 1 and opens it in the editor. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { useCreateSkill } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { EMPTY_DRAFT, isDraftComplete, type SkillDraft } from "../../../../skill-model";
import { SkillFields } from "../../../SkillFields";

export function CreateSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const create = useCreateSkill();
  const [draft, setDraft] = React.useState<SkillDraft>(EMPTY_DRAFT);

  const submit = async () => {
    try {
      const skill = await create.mutateAsync({ ...draft, name: draft.name.trim(), source: "manual" });
      toast.success(t("form.created", { name: skill.name }));
      onClose();
      router.push(`/skills/${skill.id}`);
    } catch {
      // Surfaced by the global mutation-error toast (lib/providers.tsx).
    }
  };

  return (
    <Modal
      width={720}
      title={t("form.createTitle")}
      subtitle={t("form.createSubtitle")}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button kind="ghost" onClick={onClose}>
            {t("form.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Check"
            onClick={submit}
            disabled={!isDraftComplete(draft) || create.isPending}
            loading={create.isPending}
          >
            {create.isPending ? t("form.creating") : t("form.create")}
          </Button>
        </div>
      }
    >
      <div style={{ padding: "18px 24px 4px" }}>
        <SkillFields draft={draft} onChange={setDraft} />
      </div>
    </Modal>
  );
}
