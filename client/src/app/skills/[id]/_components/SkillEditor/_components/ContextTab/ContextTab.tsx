/* ContextTab — the skill's project documents. Any agent using the skill
   inherits them. Saving replaces the whole ordered list (version unchanged). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { ContextDocPicker } from "../../../../../../../components/context-doc-picker";
import { useSetSkillContextDocs } from "../../../../../../../lib/hooks/skills";
import { useActiveRepo } from "../../../../../../../lib/repo-context";
import { serializedContext } from "./serialize";

const NO_DOCS: string[] = [];

export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const tDocs = useTranslations("contextDocs");
  const { repoId } = useActiveRepo();
  const save = useSetSkillContextDocs();
  const attached = skill.context_docs ?? NO_DOCS;

  return (
    <ContextDocPicker
      repoId={repoId}
      title={t("editor.context.title")}
      attached={attached}
      counterMode="only"
      hint={
        <>
          <span>{tDocs("picker.orderHint")}</span> <span>{t("editor.context.inherit")}</span>
        </>
      }
      onSave={(paths) => save.mutateAsync({ id: skill.id, paths })}
      saving={save.isPending}
      footer={
        <section aria-labelledby="skill-context-serialized">
          <h3 id="skill-context-serialized" style={{ fontSize: 11, letterSpacing: 0.8, color: "var(--text-muted)", margin: "20px 0 8px" }}>
            {t("editor.context.serializesAs")}
          </h3>
          <pre className="mono" style={{ margin: 0, padding: "14px 16px", fontSize: 12, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated, var(--bg-subtle))", color: "var(--text-secondary)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {serializedContext(attached)}
          </pre>
        </section>
      }
    />
  );
}
