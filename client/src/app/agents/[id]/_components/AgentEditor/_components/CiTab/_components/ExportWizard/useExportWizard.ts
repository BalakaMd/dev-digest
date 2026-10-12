/* useExportWizard — state of the Export to CI wizard (reducer) and the cross-step logic:
   navigation over the registered steps, why "Continue" is blocked, and regenerating
   the workflow file when the Configure choices moved on (AC-3, AC-16, AC-42).
   State survives Back because it lives here, above the step components. */
"use client";

import { useCallback, useEffect, useMemo, useReducer } from "react";
import type { Agent, CiPostAs, CiPreview, CiTrigger } from "@devdigest/shared";
import { useCiInstall, useCiPreview } from "../../../../../../../../../lib/hooks/ci";
import { EXPORT_PROVIDER, type WizardInitial } from "../../constants";
import { DEFAULT_POST_AS, DEFAULT_TARGET, DEFAULT_TRIGGERS, STEP_IDS, type StepId } from "./constants";
import { sameChoices, sortTriggers, workflowOf, type GeneratedFor } from "./helpers";
import { useWorkflowCheck, type CheckBlock } from "./useWorkflowCheck";

export interface WizardState {
  step: StepId;
  target: string;
  /** "owner/name"; empty until chosen. */
  repo: string;
  triggers: CiTrigger[];
  postAs: CiPostAs;
  /** The last generated preview (files incl. the workflow); null until a step generates it. */
  preview: CiPreview | null;
  /** Current workflow text, edited or not. */
  workflow: string;
  /** The workflow text as generated; `workflow !== baseline` means "edited". */
  baseline: string;
  /** The choices `preview` was generated for; null until the first generation. */
  generatedFor: GeneratedFor | null;
}

export type WizardAction =
  | { type: "repo"; repo: string }
  | { type: "trigger"; trigger: CiTrigger }
  | { type: "postAs"; postAs: CiPostAs }
  | { type: "step"; step: StepId }
  | { type: "workflow"; text: string }
  | { type: "generated"; preview: CiPreview; generatedFor: GeneratedFor };

export function initWizardState(initial?: WizardInitial): WizardState {
  return {
    step: "target",
    target: DEFAULT_TARGET,
    repo: initial?.repo ?? "",
    triggers: sortTriggers(initial?.triggers ?? DEFAULT_TRIGGERS),
    postAs: initial?.postAs ?? DEFAULT_POST_AS,
    preview: null,
    workflow: "",
    baseline: "",
    generatedFor: null,
  };
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "repo":
      return { ...state, repo: action.repo };
    case "trigger": {
      const on = state.triggers.includes(action.trigger);
      const next = on ? state.triggers.filter((t) => t !== action.trigger) : [...state.triggers, action.trigger];
      return { ...state, triggers: sortTriggers(next) };
    }
    case "postAs":
      return { ...state, postAs: action.postAs };
    case "step":
      return { ...state, step: action.step };
    case "workflow":
      return { ...state, workflow: action.text };
    case "generated": {
      const text = workflowOf(action.preview);
      return { ...state, preview: action.preview, workflow: text, baseline: text, generatedFor: action.generatedFor };
    }
  }
}

/** Message key (under `ci.exportWizard`) naming why "Continue" is disabled, or null. */
export type BlockReason = "noRepository" | "selectTrigger" | "notOpenRouter" | "generating" | Exclude<CheckBlock, null> | null;

export interface UseExportWizardArgs {
  agent: Agent;
  initial?: WizardInitial;
  /** Registered step ids, in order; navigation skips the others. */
  registered: readonly StepId[];
  /** Preselected repository ("owner/name") when `initial` gives none; null while unknown. */
  defaultRepo: string | null;
}

export function useExportWizard({ agent, initial, registered, defaultRepo }: UseExportWizardArgs) {
  const [state, dispatch] = useReducer(wizardReducer, initial, initWizardState);
  const preview = useCiPreview(agent.id);
  const { mutateAsync } = preview;
  const install = useCiInstall(agent.id);

  // Preselect the active repository once it is known (AC-7); never overrides a choice.
  useEffect(() => {
    if (!state.repo && defaultRepo) dispatch({ type: "repo", repo: defaultRepo });
  }, [state.repo, defaultRepo]);

  const order = useMemo(() => STEP_IDS.filter((id) => registered.includes(id)), [registered]);
  const index = order.indexOf(state.step);
  const previousStep = index > 0 ? order[index - 1]! : null;
  const nextStep = index >= 0 && index < order.length - 1 ? order[index + 1]! : null;

  const choices: GeneratedFor = useMemo(
    () => ({ repo: state.repo, triggers: state.triggers, postAs: state.postAs }),
    [state.repo, state.triggers, state.postAs],
  );
  const edited = state.preview !== null && state.workflow !== state.baseline;
  /** The workflow was generated for other choices than the current ones. */
  const stale = state.generatedFor !== null && !sameChoices(state.generatedFor, choices);

  const check = useWorkflowCheck(agent.id, state.preview !== null, choices, state.workflow);

  let blockReason: BlockReason = null;
  if (agent.provider !== EXPORT_PROVIDER) blockReason = "notOpenRouter";
  else if (state.step === "target" && !state.repo) blockReason = "noRepository";
  else if (state.step === "configure" && state.triggers.length === 0) blockReason = "selectTrigger";
  else if (state.step === "preview") blockReason = state.preview ? check.block : "generating";

  const go = useCallback((step: StepId | null) => step && dispatch({ type: "step", step }), []);

  /** (Re)generate the files for the current choices; replaces the workflow text. */
  const regenerate = useCallback(async () => {
    const result = await mutateAsync({ repo: choices.repo, triggers: choices.triggers, post_as: choices.postAs });
    dispatch({ type: "generated", preview: result, generatedFor: choices });
    return result;
  }, [mutateAsync, choices]);

  return {
    state,
    dispatch,
    edited,
    stale,
    /** Edits kept over changed Configure choices: the Install step must say so (AC-67). */
    configNotApplied: edited && stale,
    blockReason,
    /** The workflow check (debounced) and the risk acknowledgement; its `block` gates Install. */
    check,
    /** The install request: its pending state locks Back and closing, success ends the flow. */
    install,
    installing: install.isPending,
    choices,
    isFirst: previousStep === null,
    regenerate,
    regenerating: preview.isPending,
    regenerateError: preview.error,
    resetRegenerateError: preview.reset,
    setRepo: (repo: string) => dispatch({ type: "repo", repo }),
    toggleTrigger: (trigger: CiTrigger) => dispatch({ type: "trigger", trigger }),
    setPostAs: (postAs: CiPostAs) => dispatch({ type: "postAs", postAs }),
    setWorkflow: (text: string) => dispatch({ type: "workflow", text }),
    setGenerated: (p: CiPreview, generatedFor: GeneratedFor) => dispatch({ type: "generated", preview: p, generatedFor }),
    goNext: () => go(nextStep),
    goBack: () => go(previousStep),
  };
}

export type ExportWizardApi = ReturnType<typeof useExportWizard>;
