import { z } from 'zod';
import {
  ConventionCategory,
  type ConventionCandidate,
  type ConventionSkillDraft,
  type ConventionSkillSplit,
  type ConventionsState,
  type CreateConventionSkillsInput,
  type Skill,
  type UpdateConventionInput,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import { wrapUntrusted } from '../../platform/prompt.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { SkillsService } from '../skills/service.js';
import { ConventionsRepository, type RepoRef } from './repository.js';
import {
  buildSkillDrafts,
  configPaths,
  dedupeCandidates,
  evidenceFiles,
  isKnownRule,
  numberLines,
  toCandidateDto,
  toScanDto,
  verifyCandidate,
  type VerifiedCandidate,
} from './helpers.js';
import {
  CONFIG_FILES,
  EXTRACTION_PROMPT,
  EXTRACTION_SCHEMA_NAME,
  EXTRACTION_TEMPERATURE,
  MAX_CANDIDATES,
  MAX_CONFIG_DIRS,
  MAX_EVIDENCE,
  MAX_LINES_PER_FILE,
  MAX_PROMPT_CHARS,
  SAMPLE_COUNT,
} from './constants.js';

/**
 * Conventions extractor.
 *
 *   1. sample   — configs at the clone root + top-ranked files from repo-intel.
 *                 Pure code, no model.
 *   2. extract  — ONE cheap structured LLM call (model from Settings → Models).
 *   3. verify   — every cited file/line/snippet is checked against the sample;
 *                 a candidate with no surviving evidence is dropped.
 *   4. persist  — de-duplicated, filtered against rules the user already
 *                 accepted, rejected or edited, and swapped in for the previous
 *                 scan's untouched pending ones.
 *
 * Accepted candidates are then turned into one or more NEW skills.
 */

/**
 * What the model returns. Strict JSON-schema structured output: no optional
 * fields and no numeric/array bounds — limits are enforced in code instead.
 */
export const ConventionExtraction = z.object({
  candidates: z.array(
    z.object({
      category: ConventionCategory,
      rule: z.string(),
      evidence: z.array(
        z.object({
          file: z.string(),
          line_start: z.number().int(),
          line_end: z.number().int(),
          snippet: z.string(),
        }),
      ),
      confidence: z.number(),
    }),
  ),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;

interface Sample {
  files: Map<string, string>;
  /** Paths in prompt order: configs first, then ranked source files. */
  order: string[];
}

export class ConventionsService {
  private repo: ConventionsRepository;
  private skills: SkillsService;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
    this.skills = new SkillsService(container);
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionsState> {
    await this.requireRepo(workspaceId, repoId);
    return this.state(workspaceId, repoId);
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionsState> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath) {
      throw new ValidationError('Repository is not cloned yet — sync it before scanning');
    }

    const sample = await this.sample(repo);
    if (sample.order.length === 0) {
      throw new ValidationError(
        'No files to sample — index the repository (Repo Intel) before scanning for conventions',
      );
    }

    const prompt = this.userMessage(repo, sample);
    const choice = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(choice.provider);
    const res = await llm.completeStructured<ConventionExtraction>({
      model: choice.model,
      schema: ConventionExtraction,
      schemaName: EXTRACTION_SCHEMA_NAME,
      temperature: EXTRACTION_TEMPERATURE,
      messages: [
        {
          role: 'system',
          content: await renderPrompt(EXTRACTION_PROMPT, {
            categories: ConventionCategory.options.map((c) => `\`${c}\``).join(', '),
            max_evidence: String(MAX_EVIDENCE),
            max_candidates: String(MAX_CANDIDATES),
          }),
        },
        { role: 'user', content: prompt.content },
      ],
    });

    const proposed = res.data.candidates.slice(0, MAX_CANDIDATES);
    const verified = proposed
      .map((c) => verifyCandidate(c, prompt.files))
      .filter((c): c is VerifiedCandidate => c !== null);
    const { kept, merged } = dedupeCandidates(verified);

    // Rules the user already dealt with stay as they are: an accepted or edited
    // rule is not proposed twice, a rejected one never comes back.
    const survivors = await this.repo.listSurvivors(workspaceId, repoId);
    const knownRules = survivors.map((d) => d.rule);
    const fresh = kept.filter((c) => !isKnownRule(c.rule, knownRules));

    await this.repo.replacePending(
      workspaceId,
      repoId,
      {
        provider: choice.provider,
        model: res.model || choice.model,
        sampleFiles: [...prompt.files.keys()],
        proposed: proposed.length,
        kept: fresh.length,
        droppedUnverified: proposed.length - verified.length,
        mergedDuplicates: merged + (kept.length - fresh.length),
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        costUsd: res.costUsd,
      },
      fresh.map((c) => ({
        category: c.category,
        rule: c.rule,
        evidence: c.evidence,
        confidence: c.confidence,
        modelConfidence: c.modelConfidence,
      })),
    );
    return this.state(workspaceId, repoId);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConventionInput,
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toCandidateDto(row) : undefined;
  }

  async skillDrafts(
    workspaceId: string,
    repoId: string,
    split: ConventionSkillSplit,
  ): Promise<ConventionSkillDraft[]> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const accepted = await this.accepted(workspaceId, repoId);
    return buildSkillDrafts(repo.name, accepted, split);
  }

  /** Every draft becomes a NEW skill — an existing skill with the same name is left alone. */
  async createSkills(
    workspaceId: string,
    repoId: string,
    input: CreateConventionSkillsInput,
  ): Promise<Skill[]> {
    await this.requireRepo(workspaceId, repoId);
    const accepted = await this.accepted(workspaceId, repoId);
    const byId = new Map(accepted.map((c) => [c.id, c]));

    const created: Skill[] = [];
    for (const draft of input.skills) {
      const sources = draft.convention_ids.map((id) => byId.get(id));
      if (sources.some((c) => c === undefined)) {
        throw new ValidationError('A skill can only be built from accepted conventions of this repository');
      }
      created.push(
        await this.skills.create(workspaceId, {
          name: draft.name.trim(),
          description: draft.description,
          type: draft.type,
          body: draft.body,
          enabled: draft.enabled,
          source: 'extracted',
          evidenceFiles: evidenceFiles(sources as ConventionCandidate[]),
        }),
      );
    }
    return created;
  }

  // ---------------------------------------------------------------- internals

  private async requireRepo(workspaceId: string, repoId: string): Promise<RepoRef> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  private async accepted(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.repo.listByStatus(workspaceId, repoId, ['accepted']);
    if (rows.length === 0) {
      throw new ValidationError('Accept at least one convention before creating a skill');
    }
    return rows.map(toCandidateDto);
  }

  private async state(workspaceId: string, repoId: string): Promise<ConventionsState> {
    const [scan, rows, rejected] = await Promise.all([
      this.repo.latestScan(workspaceId, repoId),
      this.repo.listVisible(workspaceId, repoId),
      this.repo.listByStatus(workspaceId, repoId, ['rejected']),
    ]);
    return {
      scan: scan ? toScanDto(scan) : null,
      candidates: rows.map(toCandidateDto),
      rejected: rejected.map(toCandidateDto),
    };
  }

  /**
   * Step 1 — pick what the model sees, with no model involved: whichever style
   * configs exist at the clone root or a package folder, then repo-intel's
   * top-ranked source files.
   * An unreadable file is skipped rather than failing the scan.
   */
  private async sample(repo: RepoRef): Promise<Sample> {
    const ref = { owner: repo.owner, name: repo.name };
    const ranked = await this.container.repoIntel.getConventionSamples(repo.id, SAMPLE_COUNT);
    const files = new Map<string, string>();
    const order: string[] = [];
    for (const path of [...configPaths(CONFIG_FILES, ranked, MAX_CONFIG_DIRS), ...ranked]) {
      if (files.has(path)) continue;
      const content = await this.container.git.readFile(ref, path).catch(() => '');
      if (!content.trim()) continue;
      files.set(path, content);
      order.push(path);
    }
    return { files, order };
  }

  /**
   * The user message: every sampled file, line-numbered and wrapped as
   * untrusted data, within the prompt budget. Returns the files that actually
   * made it in — evidence can only be verified against what the model saw.
   */
  private userMessage(
    repo: RepoRef,
    sample: Sample,
  ): { content: string; files: Map<string, string> } {
    const blocks: string[] = [];
    const files = new Map<string, string>();
    let budget = MAX_PROMPT_CHARS;
    for (const path of sample.order) {
      const content = sample.files.get(path)!;
      const block = wrapUntrusted(
        `file:${path}`,
        `### ${path}\n${numberLines(content, MAX_LINES_PER_FILE)}`,
      );
      if (block.length > budget) continue;
      budget -= block.length;
      blocks.push(block);
      files.set(path, content);
    }
    return {
      content: [
        `Repository: ${repo.owner}/${repo.name}`,
        `Sampled files (${blocks.length}):`,
        '',
        blocks.join('\n\n'),
      ].join('\n'),
      files,
    };
  }
}
