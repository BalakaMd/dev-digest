/* ContextTab — the agent's project documents: its own attachments plus the
   ones inherited from its enabled skills ("via <skill>"). Saving replaces the
   whole ordered list. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Agent } from "@devdigest/shared";
import { ContextDocPicker } from "../../../../../../../components/context-doc-picker";
import { useSetAgentContextDocs } from "../../../../../../../lib/hooks/agents";
import { useAgentSkills } from "../../../../../../../lib/hooks/skills";
import { useActiveRepo } from "../../../../../../../lib/repo-context";
import { inheritedDocs } from "./inherited-docs";

const NO_DOCS: string[] = [];

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { repoId } = useActiveRepo();
  const skills = useAgentSkills(agent.id);
  const save = useSetAgentContextDocs();
  const attached = agent.context_docs ?? NO_DOCS;
  const inherited = React.useMemo(() => inheritedDocs(skills.data ?? [], attached), [skills.data, attached]);

  return (
    <ContextDocPicker
      repoId={repoId}
      title={t("editor.context.title")}
      attached={attached}
      inherited={inherited}
      onSave={(paths) => save.mutateAsync({ id: agent.id, paths })}
      saving={save.isPending}
    />
  );
}
