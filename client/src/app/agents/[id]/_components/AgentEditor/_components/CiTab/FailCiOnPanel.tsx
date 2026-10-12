/* "Fail CI on" — the same agent field as the Config tab's selector; saving creates a
   new agent version exactly as a Config save does (AC-44). The note under it says a
   changed value reaches a repository only after its CI config is updated (AC-45). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, SelectInput } from "@devdigest/ui";
import type { Agent, CiFailOn } from "@devdigest/shared";
import { useUpdateAgent } from "../../../../../../../lib/hooks/agents";
import { useToast } from "../../../../../../../lib/toast";
import { FAIL_ON_VALUES } from "./constants";
import { s } from "./styles";

export function FailCiOnPanel({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const ta = useTranslations("agents");
  const toast = useToast();
  const update = useUpdateAgent();
  const [value, setValue] = React.useState<CiFailOn>(agent.ci_fail_on);
  const noteId = React.useId();

  // Follow the stored value when the agent changes or a save lands elsewhere.
  React.useEffect(() => setValue(agent.ci_fail_on), [agent.id, agent.ci_fail_on]);

  const options = FAIL_ON_VALUES.map((v) => ({ value: v, label: ta(`config.ciFailOnOptions.${v}`) }));
  const save = () =>
    update.mutate(
      { id: agent.id, patch: { ci_fail_on: value } },
      { onSuccess: (data) => toast.success(t("ciTab.failOn.saved", { version: data.version })) },
    );

  return (
    <section style={s.panel} aria-labelledby={`${noteId}-h`}>
      <h3 id={`${noteId}-h`} style={s.panelTitle}>
        {t("ciTab.failOn.heading")}
      </h3>
      <div style={s.failOnRow}>
        <div style={s.failOnSelect} role="group" aria-label={t("ciTab.failOn.label")} aria-describedby={noteId}>
          <SelectInput value={value} onChange={(v) => setValue(v as CiFailOn)} options={options} />
        </div>
        <Button
          kind="primary"
          icon="Check"
          onClick={save}
          disabled={update.isPending || value === agent.ci_fail_on}
        >
          {update.isPending ? t("ciTab.failOn.saving") : t("ciTab.failOn.save")}
        </Button>
      </div>
      <p id={noteId} style={{ ...s.muted, margin: 0 }}>
        {t("ciTab.failOn.note")}
      </p>
    </section>
  );
}
