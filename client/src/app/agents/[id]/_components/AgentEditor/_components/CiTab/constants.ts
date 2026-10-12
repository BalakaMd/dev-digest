import type { Agent, CiFailOn, CiPostAs, CiTrigger } from "@devdigest/shared";

/** The "Fail CI on" values, in the order of the Config tab's selector. */
export const FAIL_ON_VALUES: readonly CiFailOn[] = ["never", "critical", "warning", "any"];

/** Provider an agent must use to be exported (CI runs go through OpenRouter, AC-8). */
export const EXPORT_PROVIDER = "openrouter";

/** The `?tab=` value of the Config tab (target of the AC-8 link). */
export const CONFIG_TAB_KEY = "config";

/** Filter value meaning "every installation" in the history filter. */
export const ALL_INSTALLATIONS = "";

/** Preselection handed to the wizard when it opens for an existing installation (AC-42). */
export interface WizardInitial {
  repo: string;
  triggers: CiTrigger[];
  postAs: CiPostAs;
}

/** Props contract of the Export wizard (S12): `ExportWizard({ agent, initial?, onClose })`. */
export interface WizardProps {
  agent: Agent;
  initial?: WizardInitial;
  onClose: () => void;
}
