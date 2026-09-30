/* BlastSymbolRow — one changed symbol as a collapsible tree node: its callers
   (file:line, deep-linked to GitHub), then the HTTP endpoints and, separately,
   the crons that depend on it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrBlastRadiusResponse } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

type Downstream = PrBlastRadiusResponse["downstream"][number];

export function BlastSymbolRow({
  item,
  repoFullName,
  sha,
  defaultOpen = false,
}: {
  item: Downstream;
  /** `owner/repo`; null renders callers as plain text. */
  repoFullName: string | null;
  sha: string;
  defaultOpen?: boolean;
}) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div style={s.row}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={s.toggle}>
        <Icon.ChevronRight size={14} style={s.chevron(open)} />
        <span style={s.name}>{item.symbol}</span>
        <span style={s.count}>{t("callerCount", { count: item.callers.length })}</span>
      </button>
      {open && (
        <div style={s.body}>
          <ul style={s.callers}>
            {item.callers.map((c, i) => {
              const ref = `${c.file}:${c.line}`;
              return (
                <li key={`${ref}-${c.name}-${i}`} style={s.caller}>
                  <Icon.CornerDownRight size={12} style={s.callerIcon} />
                  {repoFullName ? (
                    <a
                      href={githubBlobUrl(repoFullName, sha, c.file, c.line)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t("openOnGithub")}
                      style={s.callerLink}
                    >
                      {ref}
                    </a>
                  ) : (
                    <span style={s.callerRef}>{ref}</span>
                  )}
                </li>
              );
            })}
          </ul>
          {item.endpoints_affected.length > 0 && (
            <div style={s.group}>
              <div style={s.groupLabel}>{t("endpointsLabel")}</div>
              <div style={s.chips}>
                {item.endpoints_affected.map((e) => (
                  <span key={e} style={s.chip}>
                    {e}
                  </span>
                ))}
              </div>
            </div>
          )}
          {item.crons_affected.length > 0 && (
            <div style={s.group}>
              <div style={s.groupLabel}>{t("cronsLabel")}</div>
              <div style={s.chips}>
                {item.crons_affected.map((c) => (
                  <span key={c} style={s.chipCron}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
