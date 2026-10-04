/** Constants for the onboarding-tour module (SPEC-03). */
import type { TourLanguage } from '@devdigest/shared';

export const READING_PATH_SIZE = 7;
export const CRITICAL_PATHS_SIZE = 5;
export const MAX_FIRST_TASKS = 5;
/** Cap on stored run commands / their length (output of the model is untrusted). */
export const MAX_RUN_COMMANDS = 30;
export const MAX_COMMAND_CHARS = 300;

export const ONBOARDING_PROMPT = 'onboarding.system.md';
export const ONBOARDING_SCHEMA_NAME = 'OnboardingNarrative';
export const ONBOARDING_TEMPERATURE = 0.2;
export const ONBOARDING_MAX_TOKENS = 4000;
export const ONBOARDING_TIMEOUT_MS = 120_000;

export const DEFAULT_TOUR_LANGUAGE: TourLanguage = 'English';
export const TOUR_LANGUAGE_KEY = 'tour_language';

/** Prompt budget: indexed paths listed to the model, and the sizes of run sources. */
export const MAX_PROMPT_PATHS = 300;
export const MAX_RUN_SOURCE_CHARS = 6_000;
export const MAX_RUN_SOURCES_TOTAL_CHARS = 24_000;
export const MAX_RUN_SOURCE_DIRS = 8;
export const MAX_ERROR_CHARS = 300;

/** Fixed file names read for "How to run locally" — never a name taken from model output. */
export const ROOT_RUN_SOURCE_FILES = [
  'package.json',
  'README.md',
  'README',
  'README.rst',
  'README.txt',
  'CONTRIBUTING.md',
  'docs/setup.md',
  'docs/getting-started.md',
  'docs/development.md',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
] as const;
export const FOLDER_RUN_SOURCE_FILES = [
  'package.json',
  'README.md',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
] as const;

/** Section anchors (shared with the client page). */
export const SECTION_ANCHORS = [
  'architecture',
  'critical-paths',
  'run-locally',
  'reading-path',
  'first-tasks',
] as const;
