import { and, asc, desc, eq, gt, inArray, ne, or } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow, ConventionScanRow } from '../../db/rows.js';
import type { ConventionEvidenceRow } from '../../db/schema.js';
import type { ConventionStatus } from '@devdigest/shared';

/**
 * Conventions data-access: the `conventions` candidates and their
 * `convention_scans`. Workspace-scoped throughout; the only file in the module
 * that touches Drizzle.
 */

export type { ConventionRow, ConventionScanRow };

export interface RepoRef {
  id: string;
  owner: string;
  name: string;
  clonePath: string | null;
}

export interface InsertScan {
  provider: string;
  model: string;
  sampleFiles: string[];
  proposed: number;
  kept: number;
  droppedUnverified: number;
  mergedDuplicates: number;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
}

export interface InsertCandidate {
  category: string;
  rule: string;
  evidence: ConventionEvidenceRow[];
  confidence: number;
  modelConfidence: number;
}

export interface UpdateCandidate {
  status?: ConventionStatus;
  rule?: string;
  category?: string;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  /** Category, then most confident first; id breaks ties so the order is total. */
  private readonly listOrder = [
    asc(t.conventions.category),
    desc(t.conventions.confidence),
    asc(t.conventions.id),
  ];

  async getRepo(workspaceId: string, repoId: string): Promise<RepoRef | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** Every candidate the page shows: pending + accepted (rejected stay hidden). */
  async listVisible(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          ne(t.conventions.status, 'rejected'),
        ),
      )
      .orderBy(...this.listOrder);
  }

  async listByStatus(
    workspaceId: string,
    repoId: string,
    statuses: ConventionStatus[],
  ): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.status, statuses),
        ),
      )
      .orderBy(...this.listOrder);
  }

  /**
   * Candidates a re-scan must keep: every accepted or rejected one, plus pending
   * ones the user touched (edited, or accepted and then un-accepted). A row the
   * user never touched still has `updated_at = created_at` — both come from the
   * inserting transaction's `now()`.
   */
  async listSurvivors(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          or(ne(t.conventions.status, 'pending'), gt(t.conventions.updatedAt, t.conventions.createdAt)),
        ),
      )
      .orderBy(...this.listOrder);
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateCandidate,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  async latestScan(workspaceId: string, repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(
        and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.repoId, repoId)),
      )
      .orderBy(desc(t.conventionScans.createdAt), desc(t.conventionScans.id))
      .limit(1);
    return row;
  }

  /**
   * Record a scan and swap in its candidates in one transaction: the previous
   * scan's untouched PENDING candidates are dropped; accepted, rejected and
   * user-edited ones are kept (the caller has already filtered new rules
   * against them — see `listSurvivors`).
   */
  async replacePending(
    workspaceId: string,
    repoId: string,
    scan: InsertScan,
    candidates: InsertCandidate[],
  ): Promise<ConventionScanRow> {
    return this.db.transaction(async (tx) => {
      const [scanRow] = await tx
        .insert(t.conventionScans)
        .values({ workspaceId, repoId, ...scan })
        .returning();
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            eq(t.conventions.status, 'pending'),
            eq(t.conventions.updatedAt, t.conventions.createdAt),
          ),
        );
      if (candidates.length) {
        await tx.insert(t.conventions).values(
          candidates.map((c) => {
            const primary = c.evidence[0];
            return {
              workspaceId,
              repoId,
              scanId: scanRow!.id,
              category: c.category,
              rule: c.rule,
              evidence: c.evidence,
              evidencePath: primary?.path ?? null,
              evidenceSnippet: primary?.snippet ?? null,
              lineStart: primary?.line_start ?? null,
              lineEnd: primary?.line_end ?? null,
              confidence: c.confidence,
              modelConfidence: c.modelConfidence,
            };
          }),
        );
      }
      return scanRow!;
    });
  }
}
