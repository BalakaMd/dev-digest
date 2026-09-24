/* ConfigTab — edit name, description, type and body. Saving a content change
   bumps the skill's version and snapshots the body (see Versioning). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { isDraftComplete, type SkillDraft } from "../../../../../skill-model";
import { SkillFields } from "../../../../../_components/SkillFields";

const toDraft = (skill: Skill): SkillDraft => ({
  name: skill.name,
  description: skill.description,
  type: skill.type,
  body: skill.body,
});

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const [draft, setDraft] = React.useState<SkillDraft>(() => toDraft(skill));

  // A new version (save, restore) or another skill resets the form to the server copy.
  const [syncedKey, setSyncedKey] = React.useState(`${skill.id}:${skill.version}`);
  const key = `${skill.id}:${skill.version}`;
  if (key !== syncedKey) {
    setSyncedKey(key);
    setDraft(toDraft(skill));
  }

  const saved = toDraft(skill);
  const dirty = (Object.keys(saved) as (keyof SkillDraft)[]).some((k) => draft[k] !== saved[k]);

  const save = async () => {
    try {
      const next = await update.mutateAsync({ id: skill.id, patch: { ...draft, name: draft.name.trim() } });
      toast.success(t("editor.saved", { version: next.version }));
    } catch {
      // Surfaced by the global mutation-error toast (lib/providers.tsx).
    }
  };

  return (
    <div>
      <SkillFields draft={draft} onChange={setDraft} bodyRows={18} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Button
          kind="primary"
          icon="Check"
          onClick={save}
          disabled={!dirty || !isDraftComplete(draft) || update.isPending}
          loading={update.isPending}
        >
          {update.isPending ? t("editor.saving") : t("editor.save")}
        </Button>
        {dirty && <Badge color="var(--warn)">{t("editor.unsaved")}</Badge>}
      </div>
    </div>
  );
}
