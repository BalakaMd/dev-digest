/* SkillEditor — /skills/:id: header + three tabs over one skill (Config,
   Preview, Versioning). Tab state lives in ?tab=, like the agent editor. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Tabs, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge } from "../../../../../components/skill-type-badge";
import { useUpdateSkill } from "../../../../../lib/hooks/skills";
import { isImported } from "../../../skill-model";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { VersioningTab } from "./_components/VersioningTab";
import { EDITOR_TABS } from "./constants";
import { s } from "./styles";

export function SkillEditor({ skill, tab, onTab }: { skill: Skill; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("skills");
  const update = useUpdateSkill();
  const tabs = EDITOR_TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
        <h1 className="mono" style={s.name}>
          {skill.name}
        </h1>
        <SkillTypeBadge type={skill.type} />
        <Badge color="var(--text-secondary)" icon="History" mono>
          {t("card.version", { version: skill.version })}
        </Badge>
        {isImported(skill) && (
          <Badge color="var(--warn)" icon="Upload">
            {t("card.imported")}
          </Badge>
        )}
        <span style={s.enabled}>
          {t("editor.enabled")}
          <Toggle on={skill.enabled} onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })} />
        </span>
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 28px" />
      </div>
      <div style={s.body}>
        {tab === "config" && <ConfigTab skill={skill} />}
        {tab === "preview" && <PreviewTab skill={skill} />}
        {tab === "versioning" && <VersioningTab skill={skill} />}
      </div>
    </div>
  );
}
