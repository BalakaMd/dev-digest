/* Step registry: wizard steps by id. Navigation visits registered steps only, so the
   stepper keeps showing all four while a step without a component is skipped. */
import type { StepId } from "../constants";
import { ConfigureStep } from "./ConfigureStep";
import { InstallStep } from "./InstallStep";
import { PreviewStep } from "./PreviewStep";
import { TargetStep } from "./TargetStep";
import type { StepDefinition } from "./types";

export const STEPS: Partial<Record<StepId, StepDefinition>> = {
  target: { Component: TargetStep },
  preview: { Component: PreviewStep },
  configure: { Component: ConfigureStep },
  install: { Component: InstallStep, ownFooter: true },
};
