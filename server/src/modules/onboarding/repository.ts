import { and, eq } from 'drizzle-orm';
import { OnboardingTour, TourLanguage } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { TOUR_LANGUAGE_KEY } from './constants.js';
import type { OnboardingRepoBasics, OnboardingRepositoryPort, StoredTour } from './types.js';

/** Onboarding data-access — the only file of this module touching Drizzle. Workspace-scoped via `repos`. */
export class OnboardingRepository implements OnboardingRepositoryPort {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<OnboardingRepoBasics | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        defaultBranch: t.repos.defaultBranch,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async getStoredTour(workspaceId: string, repoId: string): Promise<StoredTour | undefined> {
    const [row] = await this.db
      .select({ json: t.onboarding.json, generatedAt: t.onboarding.generatedAt })
      .from(t.onboarding)
      .innerJoin(t.repos, eq(t.repos.id, t.onboarding.repoId))
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.onboarding.repoId, repoId)));
    if (!row) return undefined;
    // jsonb is a cast, not a guarantee — an old-shape row (legacy contract) reads as "no tour".
    const parsed = OnboardingTour.safeParse(row.json);
    if (!parsed.success) return undefined;
    return { tour: parsed.data, generatedAt: row.generatedAt };
  }

  async saveTour(
    workspaceId: string,
    repoId: string,
    tour: OnboardingTour,
    generatedAt: Date,
  ): Promise<void> {
    const repo = await this.getRepo(workspaceId, repoId);
    if (!repo) return;
    await this.db
      .insert(t.onboarding)
      .values({ repoId, json: tour, generatedAt })
      .onConflictDoUpdate({ target: t.onboarding.repoId, set: { json: tour, generatedAt } });
  }

  async getTourLanguage(workspaceId: string): Promise<TourLanguage | undefined> {
    const [row] = await this.db
      .select({ value: t.settings.value })
      .from(t.settings)
      .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, TOUR_LANGUAGE_KEY)));
    const parsed = TourLanguage.safeParse(row?.value);
    return parsed.success ? parsed.data : undefined;
  }
}
