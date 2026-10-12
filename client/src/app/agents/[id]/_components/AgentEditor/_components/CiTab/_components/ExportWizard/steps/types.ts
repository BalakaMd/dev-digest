import type React from "react";
import type { Agent } from "@devdigest/shared";
import type { ExportWizardApi } from "../useExportWizard";

/** Props every wizard step component receives. */
export interface StepProps {
  agent: Agent;
  wizard: ExportWizardApi;
  /** Closes the dialog without the discard question (Install's "Done"). */
  onClose: () => void;
}

/** A registered step: its body, and whether it draws its own footer (Install does). */
export interface StepDefinition {
  Component: React.ComponentType<StepProps>;
  /** Hide the shell's Back/Continue footer; the step renders its own actions. */
  ownFooter?: boolean;
}
