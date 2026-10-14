import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadManifest, manifestPathFor } from './manifest.js';
import { RunnerError } from './errors.js';

const VALID_MANIFEST_YAML = `
name: "Security Reviewer"
version: 3
provider: "openrouter"
model: "deepseek/deepseek-v4-flash"
system_prompt: "Review this PR for security issues."
skills: ["security-basics"]
strategy: "auto"
ci_fail_on: "critical"
`;

describe('manifest loading + validation (AC-20)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'devdigest-runner-manifest-'));
    mkdirSync(path.join(dir, 'agents'), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads and validates a well-formed manifest against the AgentManifest schema', () => {
    writeFileSync(path.join(dir, 'agents', 'security-reviewer.yaml'), VALID_MANIFEST_YAML);

    const { manifest, sha256 } = loadManifest(dir, 'security-reviewer');
    expect(sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.version).toBe(3);

    expect(manifest.name).toBe('Security Reviewer');
    expect(manifest.model).toBe('deepseek/deepseek-v4-flash');
    expect(manifest.skills).toEqual(['security-basics']);
    expect(manifest.ci_fail_on).toBe('critical');
  });

  it('fails clearly when the manifest fails schema validation (bad ci_fail_on)', () => {
    writeFileSync(
      path.join(dir, 'agents', 'bad.yaml'),
      `
name: "Bad Agent"
version: 1
model: "gpt-4.1"
system_prompt: "review"
ci_fail_on: "sometimes"
`,
    );

    expect(() => loadManifest(dir, 'bad')).toThrow(RunnerError);
    expect(() => loadManifest(dir, 'bad')).toThrow(/failed validation/i);
  });

  it('fails clearly when the manifest is missing required fields', () => {
    writeFileSync(path.join(dir, 'agents', 'incomplete.yaml'), 'name: "No model or prompt"\n');
    expect(() => loadManifest(dir, 'incomplete')).toThrow(RunnerError);
  });

  it('fails with a message naming the expected path when the slug manifest is missing, whatever else exists (AC-61)', () => {
    writeFileSync(path.join(dir, 'agents', 'other.yaml'), VALID_MANIFEST_YAML);
    expect(() => loadManifest(dir, 'security-reviewer')).toThrow(
      /\.devdigest\/agents\/security-reviewer\.yaml/,
    );
  });

  it('fails clearly on malformed YAML', () => {
    writeFileSync(path.join(dir, 'agents', 'broken.yaml'), 'name: "unterminated\n  bad: [1, 2\n');
    expect(() => loadManifest(dir, 'broken')).toThrow(RunnerError);
  });

  it('rejects a slug that could escape the agents directory', () => {
    expect(() => manifestPathFor(dir, '../x')).toThrow(RunnerError);
  });
});
