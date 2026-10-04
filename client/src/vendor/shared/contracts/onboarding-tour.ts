import { z } from 'zod';

/**
 * Onboarding Tour (SPEC-03) — a repository tour generated from the repo index
 * plus ONE LLM request, stored per repository, read by the studio page.
 *
 * Section fields are nullable on purpose: a section that is missing or invalid
 * after assembly is `null` and the page shows "Not enough data for this section".
 * Not to be confused with the legacy `Onboarding` contract in knowledge.ts.
 */

/** Workspace-wide language of generated prose. Fixed enum — it is injected into the prompt. */
export const TourLanguage = z.enum(['English', 'Ukrainian', 'Hebrew']);
export type TourLanguage = z.infer<typeof TourLanguage>;

export const TourArchitecture = z.object({
  markdown: z.string(),
  /** Mermaid source; null when the model gave none. */
  diagram: z.string().nullable(),
});
export type TourArchitecture = z.infer<typeof TourArchitecture>;

export const TourCriticalPath = z.object({
  path: z.string(),
  reason: z.string().nullable(),
  /** In-degree supplied by the repo index (AC-29). */
  imported_by: z.number().int(),
  imports: z.number().int(),
});
export type TourCriticalPath = z.infer<typeof TourCriticalPath>;

export const TourReadingStep = z.object({
  rank: z.number().int(),
  path: z.string(),
  reason: z.string().nullable(),
});
export type TourReadingStep = z.infer<typeof TourReadingStep>;

export const TourFirstTask = z.object({
  description: z.string(),
  paths: z.array(z.string()),
});
export type TourFirstTask = z.infer<typeof TourFirstTask>;

export const OnboardingTour = z.object({
  /** ISO timestamp of when the stored tour was generated. */
  generated_at: z.string(),
  /** Tour language the generation used (stored with the tour). */
  language: TourLanguage,
  /** Indexed file count at generation time. */
  indexed_files: z.number().int(),
  provider: z.string(),
  model: z.string(),
  architecture: TourArchitecture.nullable(),
  critical_paths: z.array(TourCriticalPath).nullable(),
  run: z.object({ commands: z.array(z.string()) }),
  reading_path: z.array(TourReadingStep).nullable(),
  first_tasks: z.array(TourFirstTask).nullable(),
});
export type OnboardingTour = z.infer<typeof OnboardingTour>;

export const OnboardingBlockedReason = z.enum([
  'not_indexed',
  'partial',
  'degraded',
  'no_clone',
  'no_source_files',
]);
export type OnboardingBlockedReason = z.infer<typeof OnboardingBlockedReason>;

export const OnboardingIndexStatus = z.enum(['none', 'full', 'partial', 'degraded', 'failed']);
export type OnboardingIndexStatus = z.infer<typeof OnboardingIndexStatus>;

/** Why a generation cannot start (AC-24). Also the body of the 422 rejection. */
export const OnboardingBlocked = z.object({
  reason: OnboardingBlockedReason,
  message: z.string(),
  index_status: OnboardingIndexStatus,
  files_indexed: z.number().int(),
});
export type OnboardingBlocked = z.infer<typeof OnboardingBlocked>;

export const OnboardingGeneration = z.object({
  status: z.enum(['idle', 'running', 'failed']),
  started_at: z.string().nullable(),
  error: z.string().nullable(),
});
export type OnboardingGeneration = z.infer<typeof OnboardingGeneration>;

export const OnboardingTourState = z.object({
  tour: OnboardingTour.nullable(),
  generation: OnboardingGeneration,
  blocked: OnboardingBlocked.nullable(),
  /** Provider whose API key is missing for the "Onboarding Tour" feature model (AC-34). */
  missing_key: z.object({ provider: z.string() }).nullable(),
  tour_language: TourLanguage,
  /** Stored tour language differs from the current setting (AC-40). */
  language_changed: z.boolean(),
  /** Index updated after the stored tour was generated (AC-35). */
  index_changed: z.boolean(),
  repo: z.object({ full_name: z.string(), default_branch: z.string() }),
});
export type OnboardingTourState = z.infer<typeof OnboardingTourState>;
