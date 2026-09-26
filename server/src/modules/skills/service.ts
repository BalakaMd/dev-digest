import { unzipSync } from 'fflate';
import type { Container } from '../../platform/container.js';
import type {
  Skill,
  SkillImportPreview,
  SkillSummary,
  SkillType,
  SkillVersion,
} from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { SkillsRepository } from './repository.js';
import {
  isExecutableLooking,
  parseSkillMarkdown,
  pickSkillCore,
  toSkillDto,
  toSkillVersionDto,
} from './helpers.js';
import {
  MAX_ARCHIVE_BYTES,
  MAX_ARCHIVE_ENTRIES,
  MAX_BODY_BYTES,
  MAX_UPLOAD_BYTES,
} from './constants.js';

/**
 * Skills service. A skill is TEXT AND CONFIG ONLY: it never executes, never
 * declares a tool, and never touches the filesystem or the network. Import
 * therefore parses in memory and returns a PREVIEW; persistence happens later,
 * through the ordinary create route, once the user has confirmed.
 */

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: Skill['source'];
  enabled?: boolean;
  /** Files the skill was derived from (extracted skills). Not part of the HTTP body. */
  evidenceFiles?: string[];
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<SkillSummary[]> {
    const rows = await this.repo.listWithUsage(workspaceId);
    return rows.map((r) => ({ ...toSkillDto(r.skill), agent_count: r.agentCount }));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      body: input.body,
      ...(input.source !== undefined ? { source: input.source } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.evidenceFiles !== undefined ? { evidenceFiles: input.evidenceFiles } : {}),
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /** Body history, newest version first. Undefined when not in this workspace. */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(id);
    return rows.map(toSkillVersionDto);
  }

  async getVersion(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<SkillVersion | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const row = await this.repo.getVersion(id, version);
    return row ? toSkillVersionDto(row) : undefined;
  }

  /**
   * Restore an older body. History stays append-only: the old body is written
   * FORWARD as a new version rather than rewinding the counter, so every run's
   * recorded skill version keeps pointing at the text it actually used.
   * Restoring a body identical to the current one is a no-op.
   */
  async restore(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<Skill | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const snapshot = await this.repo.getVersion(id, version);
    if (!snapshot) return undefined;
    const row = await this.repo.update(workspaceId, id, { body: snapshot.body });
    return row ? toSkillDto(row) : undefined;
  }

  /** Agents linking a skill — shown before deleting it. */
  async linkedAgents(
    workspaceId: string,
    id: string,
  ): Promise<Array<{ id: string; name: string }> | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    return this.repo.linkedAgents(id);
  }

  /**
   * Parse an uploaded `.md` or `.zip` into a preview. Persists NOTHING.
   *
   * For an archive only the skill's markdown core is ever decompressed; every
   * other member is reported by name as ignored and never opened, written, or
   * executed. Member paths are never resolved against a directory, so zip-slip
   * traversal has no surface — the only thing that leaves this function is text.
   */
  async importPreview(filename: string, contentB64: string): Promise<SkillImportPreview> {
    const bytes = Buffer.from(contentB64, 'base64');
    if (bytes.length === 0) throw new ValidationError('The uploaded file is empty');
    if (bytes.length > MAX_UPLOAD_BYTES) {
      throw new ValidationError(
        `File is too large (${bytes.length} bytes; max ${MAX_UPLOAD_BYTES})`,
      );
    }

    const lower = filename.toLowerCase();
    const isZip = lower.endsWith('.zip');
    if (!isZip && !/\.(md|markdown)$/.test(lower)) {
      throw new ValidationError('Only .md and .zip files can be imported');
    }
    const parsed = isZip
      ? this.parseArchive(filename, bytes)
      : {
          ...parseSkillMarkdown(filename, bytes.toString('utf8')),
          ignored_entries: [] as string[],
          warnings: [] as string[],
        };

    if (Buffer.byteLength(parsed.body, 'utf8') > MAX_BODY_BYTES) {
      throw new ValidationError(`Skill body is too large (max ${MAX_BODY_BYTES} bytes)`);
    }
    if (parsed.body.trim().length === 0) {
      throw new ValidationError('No skill content found in the upload');
    }

    return {
      name: parsed.name,
      description: parsed.description,
      type: parsed.type,
      // Anything that did not come from the editor is marked as imported; the
      // UI badges it as third-party text headed for an agent's prompt.
      source: 'imported',
      body: parsed.body,
      ignored_entries: parsed.ignored_entries,
      warnings: parsed.warnings,
    };
  }

  /**
   * Two passes over the archive's central directory. The first decompresses
   * nothing — it only lists members and their declared sizes, so the entry and
   * size caps are enforced BEFORE any inflation (a zip bomb never expands).
   * The second inflates the chosen markdown core alone.
   */
  private parseArchive(filename: string, bytes: Buffer) {
    const data = new Uint8Array(bytes);
    const members: Array<{ name: string; size: number }> = [];
    try {
      unzipSync(data, {
        filter: (file) => {
          if (!file.name.endsWith('/')) members.push({ name: file.name, size: file.originalSize });
          return false;
        },
      });
    } catch (err) {
      throw new ValidationError(`Could not read the archive: ${(err as Error).message}`);
    }

    if (members.length > MAX_ARCHIVE_ENTRIES) {
      throw new ValidationError(
        `Archive has too many entries (${members.length}; max ${MAX_ARCHIVE_ENTRIES})`,
      );
    }
    const total = members.reduce((sum, m) => sum + m.size, 0);
    if (total > MAX_ARCHIVE_BYTES) {
      throw new ValidationError(
        `Archive is too large uncompressed (${total} bytes; max ${MAX_ARCHIVE_BYTES})`,
      );
    }

    const paths = members.map((m) => m.name);
    const core = pickSkillCore(paths);
    if (!core) {
      throw new ValidationError(
        `No markdown file found in the archive (${paths.length} entries: ${paths
          .slice(0, 10)
          .join(', ')})`,
      );
    }
    const coreSize = members.find((m) => m.name === core)?.size ?? 0;
    if (coreSize > MAX_BODY_BYTES) {
      throw new ValidationError(`Skill body is too large (max ${MAX_BODY_BYTES} bytes)`);
    }

    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(data, { filter: (file) => file.name === core });
    } catch (err) {
      throw new ValidationError(`Could not read the archive: ${(err as Error).message}`);
    }
    const coreBytes = entries[core];
    // The declared size can lie; re-check what was actually inflated.
    if (!coreBytes || coreBytes.length > MAX_BODY_BYTES) {
      throw new ValidationError(`Skill body is too large (max ${MAX_BODY_BYTES} bytes)`);
    }

    const parsed = parseSkillMarkdown(core, Buffer.from(coreBytes).toString('utf8'));
    const ignored = paths.filter((p) => p !== core).sort();
    const executable = ignored.filter(isExecutableLooking);

    return {
      ...parsed,
      // Fall back to the archive's own name when the markdown declares none.
      name: parsed.name || filename,
      ignored_entries: ignored,
      warnings: executable.length
        ? [
            `${executable.length} executable-looking file(s) in the archive were NOT imported and never run: ${executable
              .slice(0, 5)
              .join(', ')}`,
          ]
        : [],
    };
  }
}
