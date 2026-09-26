/* constants.ts — Smart Diff display config for the DiffTab. Domain enums are
   derived from the shared contract (`SmartDiffRole`/`Severity`) so a missing
   role or severity fails typecheck rather than silently rendering nothing. */
import type { SmartDiffRole, Severity } from "@devdigest/shared";

/** i18n keys (relative to the "prReview" namespace) for each role's header. */
export const ROLE_I18N: Record<SmartDiffRole, { label: string; hint: string }> = {
  core: { label: "smartDiff.coreLabel", hint: "smartDiff.coreHint" },
  tests: { label: "smartDiff.testsLabel", hint: "smartDiff.testsHint" },
  wiring: { label: "smartDiff.wiringLabel", hint: "smartDiff.wiringHint" },
  docs: { label: "smartDiff.docsLabel", hint: "smartDiff.docsHint" },
  boilerplate: { label: "smartDiff.boilerplateLabel", hint: "smartDiff.boilerplateHint" },
};

/** Groups that start collapsed in "Files changed" (Q3 default). */
export const COLLAPSED_ROLES: ReadonlySet<SmartDiffRole> = new Set(["docs", "boilerplate"]);

/** Maps a finding's severity to the `smartDiff.severity.*` i18n key. */
export const SEVERITY_LABEL_KEY: Record<Severity, "blocker" | "warning" | "suggestion"> = {
  CRITICAL: "blocker",
  WARNING: "warning",
  SUGGESTION: "suggestion",
};
