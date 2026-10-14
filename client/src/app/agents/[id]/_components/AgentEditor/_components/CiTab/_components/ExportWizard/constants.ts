import type { CiPostAs, CiTrigger } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/* Local copies of the shared enums: the client imports types only from @devdigest/shared
   (a value import blanks the page, see client/INSIGHTS.md). */

/** The wizard steps in order; the stepper always shows all four. */
export const STEP_IDS = ["target", "preview", "configure", "install"] as const;
export type StepId = (typeof STEP_IDS)[number];

export const TRIGGER_VALUES: readonly CiTrigger[] = ["opened", "synchronize", "reopened"];
/** Selected by default (AC-24); `reopened` is optional. */
export const DEFAULT_TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize"];

export const POST_AS_VALUES: readonly CiPostAs[] = ["github_review", "pr_comment", "none"];
export const DEFAULT_POST_AS: CiPostAs = "github_review";
/** The post-as option shown with the "recommended" badge (AC-27). */
export const RECOMMENDED_POST_AS: CiPostAs = "github_review";

export interface TargetOption {
  id: "gha" | "circle" | "jenkins" | "cli";
  icon: IconName;
  /** Only GitHub Actions has a generator (NG-10). */
  enabled: boolean;
  recommended?: boolean;
}

export const TARGETS: readonly TargetOption[] = [
  { id: "gha", icon: "Workflow", enabled: true, recommended: true },
  { id: "circle", icon: "RefreshCw", enabled: false },
  { id: "jenkins", icon: "Settings", enabled: false },
  { id: "cli", icon: "Command", enabled: false },
];
export const DEFAULT_TARGET: TargetOption["id"] = "gha";

/** Where the user imports a repository when the workspace has none (AC-66). */
export const IMPORT_REPO_HREF = "/onboarding";

/** Quiet time after the last workflow edit before it is re-checked on the server. */
export const CHECK_DEBOUNCE_MS = 400;

/** GitHub's documentation on Actions secrets (the Install step's help link, AC-77). */
export const HELP_DOCS_HREF = "https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions";
/** Settings section where the studio's GitHub token is set (AC-36). */
export const API_KEYS_HREF = "/settings/api-keys";
