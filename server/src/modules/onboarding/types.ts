import type {
  OnboardingTour,
  OnboardingIndexStatus,
  TourLanguage,
} from '@devdigest/shared';

export interface OnboardingRepoBasics {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  clonePath: string | null;
}

export interface StoredTour {
  tour: OnboardingTour;
  generatedAt: Date;
}

/** Persistence port — implemented by `OnboardingRepository`, faked in tests. */
export interface OnboardingRepositoryPort {
  getRepo(workspaceId: string, repoId: string): Promise<OnboardingRepoBasics | undefined>;
  getStoredTour(workspaceId: string, repoId: string): Promise<StoredTour | undefined>;
  saveTour(workspaceId: string, repoId: string, tour: OnboardingTour, generatedAt: Date): Promise<void>;
  /** The workspace-wide "Tour language" setting, `undefined` when never set or invalid. */
  getTourLanguage(workspaceId: string): Promise<TourLanguage | undefined>;
}

/** What readiness/staleness need from the repo-intel index state. */
export interface IndexSnapshot {
  /** Index status as the studio reports it; `none` when there is no index row at all. */
  status: OnboardingIndexStatus;
  filesIndexed: number;
  updatedAt: Date;
}

/** Pino-compatible (obj-first) logger subset. */
export interface OnboardingLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface RunSource {
  /** Repo-relative file name. */
  name: string;
  content: string;
}
