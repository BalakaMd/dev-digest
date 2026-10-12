/* Test fixtures for the Export-to-CI features (CI Runs page, agent CI tab, Export wizard):
   builders for the shared contract types. Not a test file (no `.test.` suffix). */
import type {
  Agent,
  CiCheckResult,
  CiInstallation,
  CiPreview,
  CiPreviewFile,
  CiRunDetail,
  CiRunItem,
  CiTraceData,
  Repo,
} from "@devdigest/shared";

export const WORKFLOW_PATH = ".github/workflows/devdigest-review-security-reviewer.yml";
export const WORKFLOW_TEXT = "name: DevDigest review\non:\n  pull_request:\n    types: [opened, synchronize]\n";

export function agentOf(over: Partial<Agent> = {}): Agent {
  return {
    id: "ag1",
    name: "Security Reviewer",
    description: "Flags secrets and injection",
    provider: "openrouter",
    model: "openai/gpt-4.1",
    system_prompt: "You are a security reviewer.",
    output_schema: null,
    strategy: "single-pass",
    ci_fail_on: "critical",
    repo_intel: true,
    enabled: true,
    version: 3,
    ...over,
  };
}

export function repoOf(fullName: string, id = fullName): Repo {
  const [owner = "", name = ""] = fullName.split("/");
  return {
    id,
    workspace_id: "w1",
    owner,
    name,
    full_name: fullName,
    default_branch: "main",
    clone_path: null,
    last_polled_at: null,
    created_by: null,
  };
}

export function runOf(id: string, over: Partial<CiRunItem> = {}): CiRunItem {
  return {
    id,
    repo: "acme/api",
    pr_number: 42,
    pr_url: "https://github.com/acme/api/pull/42",
    agent_id: "ag1",
    agent_name: "Security Reviewer",
    installation_id: "i1",
    verdict: "comment",
    findings_count: 3,
    cost_usd: 0.0123,
    duration_ms: 12_000,
    job_url: "https://github.com/acme/api/actions/runs/9/job/1",
    ran_at: "2026-05-29T09:14:00Z",
    ...over,
  };
}

export function traceOf(over: Partial<CiTraceData> = {}): CiTraceData {
  return {
    manifest: { agent_version: 3, sha256: "a".repeat(64) },
    model: "openai/gpt-4.1",
    runner_version: "0.2.0",
    reviewer_core_revision: "b".repeat(40),
    node_version: "v22.11.0",
    skill_hashes: [{ slug: "owasp-top-10", sha256: "c".repeat(64) }],
    head_sha: "d".repeat(40),
    ...over,
  };
}

export function runDetailOf(id: string, over: Partial<CiRunDetail> = {}): CiRunDetail {
  return { ...runOf(id), model: "openai/gpt-4.1", trace: traceOf(), head_sha: "d".repeat(40), ...over };
}

export function installationOf(id: string, over: Partial<CiInstallation> = {}): CiInstallation {
  return {
    id,
    agent_id: "ag1",
    repo: "acme/api",
    target_type: "gha",
    agent_slug: "security-reviewer",
    workflow_path: WORKFLOW_PATH,
    status: "installed",
    status_changed_at: "2026-05-29T09:00:00Z",
    exported_agent_version: 3,
    triggers: ["opened", "synchronize"],
    post_as: "github_review",
    pr_url: null,
    latest_run: null,
    ...over,
  };
}

export function fileOf(path: string, over: Partial<CiPreviewFile> = {}): CiPreviewFile {
  return { path, editable: false, kind: "text", contents: `contents of ${path}`, size_bytes: 120, ...over };
}

/** A preview as the API returns it: manifest, one skill, memory, runner bundle, workflow (last). */
export function previewOf(over: Partial<CiPreview> = {}): CiPreview {
  return {
    agent_slug: "security-reviewer",
    workflow_path: WORKFLOW_PATH,
    files: [
      fileOf(".devdigest/agents/security-reviewer.yaml"),
      fileOf(".devdigest/skills/owasp-top-10/SKILL.md"),
      fileOf(".devdigest/memory.jsonl", { contents: "", size_bytes: 0 }),
      fileOf(".devdigest/runner/index.js", { kind: "bundle", contents: null, size_bytes: 2_411_520 }),
      fileOf(WORKFLOW_PATH, { editable: true, contents: WORKFLOW_TEXT, size_bytes: WORKFLOW_TEXT.length }),
    ],
    context_docs_count: 0,
    github_token_configured: true,
    leaks: [],
    ...over,
  };
}

export const CLEAN_CHECK: CiCheckResult = { yaml_error: null, risks: [], leaks: [] };
