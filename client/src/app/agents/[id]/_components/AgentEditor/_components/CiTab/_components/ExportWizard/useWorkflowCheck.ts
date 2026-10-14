/* useWorkflowCheck — debounced server check of the current workflow text (YAML error,
   risky constructs, secret leaks; AC-23, AC-68, AC-74) plus the "I understand the risk"
   acknowledgement. A result counts only for the exact inputs it was computed for. */
"use client";

import { useEffect, useMemo, useState } from "react";
import type { CiCheckResult, CiRisk } from "@devdigest/shared";
import { useCiCheck } from "../../../../../../../../../lib/hooks/ci";
import { CHECK_DEBOUNCE_MS } from "./constants";
import type { GeneratedFor } from "./helpers";

/** Why the workflow cannot be installed yet, as a `blocked.*` message key; null when fine. */
export type CheckBlock = "checking" | "checkFailed" | "yamlError" | "secretLeak" | "ackRisk" | null;

interface Checked {
  key: string;
  result: CiCheckResult | null;
}

export function useWorkflowCheck(agentId: string, enabled: boolean, choices: GeneratedFor, workflow: string) {
  const { mutateAsync } = useCiCheck(agentId);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [nonce, setNonce] = useState(0);
  const [ackedKey, setAckedKey] = useState<string | null>(null);

  const key = JSON.stringify([choices.repo, choices.triggers, choices.postAs, workflow, nonce]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      let result: CiCheckResult | null = null;
      try {
        result = await mutateAsync({
          repo: choices.repo,
          triggers: choices.triggers,
          post_as: choices.postAs,
          workflow,
        });
      } catch {
        result = null;
      }
      if (!cancelled) setChecked({ key, result });
    }, CHECK_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `key` encodes every input read above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, mutateAsync]);

  const current = enabled && checked?.key === key;
  const result = current ? checked.result : null;
  const failed = current && checked.result === null;
  const risks: CiRisk[] = useMemo(() => (result?.risks ?? []).filter((r) => r.risk), [result]);
  const risksKey = JSON.stringify(risks.map((r) => [r.kind, r.detail]));
  const riskAcknowledged = risks.length > 0 && ackedKey === risksKey;

  let block: CheckBlock = null;
  if (!enabled) block = null;
  else if (failed) block = "checkFailed";
  else if (!result) block = "checking";
  else if (result.yaml_error) block = "yamlError";
  else if (result.leaks.length > 0) block = "secretLeak";
  else if (risks.length > 0 && !riskAcknowledged) block = "ackRisk";

  return {
    result,
    risks,
    block,
    checking: enabled && !current,
    riskAcknowledged,
    setRiskAcknowledged: (on: boolean) => setAckedKey(on ? risksKey : null),
    recheck: () => setNonce((n) => n + 1),
  };
}
