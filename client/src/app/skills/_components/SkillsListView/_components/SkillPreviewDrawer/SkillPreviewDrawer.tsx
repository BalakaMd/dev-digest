/* SkillPreviewDrawer — the side panel opened by clicking a skill card: its
   directive description, the rendered body, which agents use it, and the way
   into the full editor at /skills/:id. Read-only by design. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, Markdown, Skeleton } from "@devdigest/ui";
import type { SkillSummary } from "@devdigest/shared";
import { SkillTypeBadge } from "../../../../../../components/skill-type-badge";
import { useSkillAgents } from "../../../../../../lib/hooks/skills";
import { isImported } from "../../../../skill-model";
import { s } from "./styles";

export function SkillPreviewDrawer({ skill, onClose }: { skill: SkillSummary; onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const agents = useSkillAgents(skill.id);

  return (
    <Drawer
      width={640}
      title={<span className="mono">{skill.name}</span>}
      subtitle={t("drawer.subtitle", { type: t(`type.${skill.type}`), version: skill.version })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="primary" icon="ExternalLink" onClick={() => router.push(`/skills/${skill.id}`)}>
            {t("drawer.open")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.badges}>
          <SkillTypeBadge type={skill.type} />
          {isImported(skill) && (
            <Badge color="var(--warn)" icon="Upload">
              {t("card.imported")}
            </Badge>
          )}
          <Badge color="var(--text-secondary)" mono>
            {t("card.version", { version: skill.version })}
          </Badge>
        </div>
        {!skill.enabled && <div style={s.notice}>{t("drawer.disabled")}</div>}
        {isImported(skill) && <div style={s.notice}>{t("import.trust")}</div>}

        <section>
          <h3 style={s.sectionTitle}>{t("drawer.description")}</h3>
          <p style={s.description}>{skill.description}</p>
        </section>

        <section>
          <h3 style={s.sectionTitle}>{t("drawer.usedBy")}</h3>
          {agents.isLoading ? (
            <Skeleton height={20} width={200} />
          ) : agents.data && agents.data.length > 0 ? (
            <div style={s.agents}>
              {agents.data.map((a) => (
                <Badge key={a.id} icon="Cpu" color="var(--text-primary)">
                  {a.name}
                </Badge>
              ))}
            </div>
          ) : (
            <p style={s.muted}>{t("drawer.notLinked")}</p>
          )}
        </section>

        <section>
          <h3 style={s.sectionTitle}>{t("drawer.body")}</h3>
          <div style={s.markdown}>
            <Markdown>{skill.body}</Markdown>
          </div>
        </section>
      </div>
    </Drawer>
  );
}
